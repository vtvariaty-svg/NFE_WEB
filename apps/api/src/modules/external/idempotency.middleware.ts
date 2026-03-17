import { FastifyReply, FastifyRequest } from 'fastify';
import crypto from 'crypto';
import { prisma } from '../../index.js';

const LOCK_TIMEOUT_MINUTES = parseInt(process.env.IDEMPOTENCY_LOCK_TIMEOUT_MINUTES || '2', 10);

export async function idempotencyMiddleware(request: FastifyRequest, reply: FastifyReply) {
    // Only apply to state-changing methods
    if (request.method === 'GET' || request.method === 'OPTIONS') return;

    const idempotencyKey = request.headers['idempotency-key'] as string;
    
    // For external integration it is heavily recommended, but we can make it implicitly required
    if (!idempotencyKey) {
        return reply.status(400).send({ 
            error: 'Idempotency-Key header is required for safe retries.' 
        });
    }

    const tenantId = (request as any).tenantId;
    if (!tenantId) {
        throw new Error('idempotencyMiddleware must run after verifyApiKey.');
    }

    // Stable JSON stringify to avoid hash mismatch due to key ordering
    const bodyStr = request.body ? stableStringify(request.body) : '';
    const requestBodyHash = crypto.createHash('sha256').update(bodyStr).digest('hex');

    // 1. Transactionally check/lock the key
    try {
        const existingRecord = await prisma.idempotencyKey.findUnique({
            where: { tenantId_key: { tenantId, key: idempotencyKey } }
        });

        if (existingRecord) {
            // Check for payload mutation
            if (existingRecord.requestBodyHash !== requestBodyHash) {
                return reply.status(400).send({
                    error: `A request with the same Idempotency-Key was received but the payload was different.`,
                    code: 'idempotency_payload_mismatch'
                });
            }

            // Check if it already successfully processed (Cache HIT)
            if (existingRecord.responseStatus && existingRecord.responseBody) {
                reply.header('X-Idempotency-Cache', 'HIT');
                return reply.status(existingRecord.responseStatus).send(JSON.parse(existingRecord.responseBody));
            }

            // Check if it's currently locked (in progress)
            if (existingRecord.lockedAt) {
                const now = new Date();
                const diffMins = (now.getTime() - existingRecord.lockedAt.getTime()) / 60000;
                
                if (diffMins < LOCK_TIMEOUT_MINUTES) {
                    return reply.status(409).send({
                        error: 'A request with this Idempotency-Key is currently being processed.',
                        code: 'idempotency_conflict'
                    });
                } else {
                    // Lock expired (crash maybe). Steal the lock and continue processing.
                    await lockRecord(existingRecord.id, request.url, request.method);
                }
            }
        } else {
            // Create lock
            await createLock(tenantId, idempotencyKey, request.url, request.method, requestBodyHash);
        }
    } catch (err: any) {
        return reply.status(500).send({ error: 'Failed to negotiate idempotency lock.' });
    }

    // 2. Intercept the Response (onSend Hook equivalent)
    // We attach it to the request flow. We register an onSend hook localized to this request
}

// ─── Fastify Hook interceptor ───
export async function cacheIdempotencyResponseHook(request: FastifyRequest, reply: FastifyReply, payload: any) {
    if (request.method === 'GET' || request.method === 'OPTIONS') return payload;
    
    const idempotencyKey = request.headers['idempotency-key'] as string;
    if (!idempotencyKey) return payload;

    const tenantId = (request as any).tenantId;
    const statusCode = reply.statusCode;

    // We only cache deterministic rules (2xx Success, 3xx Redirects, 4xx Business Validation)
    // We DO NOT cache 5xx Server Errors, 408 Request Timeout, or 429 Rate Limits so the client can explicitly retry
    const isCacheable = (statusCode >= 200 && statusCode < 400) || 
                        (statusCode >= 400 && statusCode < 500 && statusCode !== 408 && statusCode !== 429);

    if (isCacheable) {
        await prisma.idempotencyKey.update({
            where: { tenantId_key: { tenantId, key: idempotencyKey } },
            data: {
                responseStatus: statusCode,
                responseBody: typeof payload === 'string' ? payload : JSON.stringify(payload),
                lockedAt: null // release lock
            }
        }).catch(err => console.error('Failed to cache idempotency payload', err));
    } else {
        // Transient error — release lock but delete record or clear it so it can be retried genuinely
        await prisma.idempotencyKey.delete({
            where: { tenantId_key: { tenantId, key: idempotencyKey } }
        }).catch(() => {});
    }

    return payload;
}

// ─── Helpers ───

async function createLock(tenantId: string, key: string, path: string, method: string, bodyHash: string) {
    await prisma.idempotencyKey.create({
        data: {
            tenantId,
            key,
            requestPath: path,
            requestMethod: method,
            requestBodyHash: bodyHash,
            lockedAt: new Date(),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // Keep cache for 24h
        }
    });
}

async function lockRecord(id: string, path: string, method: string) {
    await prisma.idempotencyKey.update({
        where: { id },
        data: {
            lockedAt: new Date(),
            requestPath: path,
            requestMethod: method
        }
    });
}
