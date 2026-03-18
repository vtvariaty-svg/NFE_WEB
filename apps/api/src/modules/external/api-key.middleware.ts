import { FastifyReply, FastifyRequest } from 'fastify';
import crypto from 'crypto';
import { prisma } from '../../index.js';

/**
 * API Key Middleware - validates external M2M requests
 *
 * Branch A — Internal service secret (automation-whatsapp, other platform services)
 *   Headers: X-Internal-Secret: <INTERNAL_SECRET>  +  X-Tenant-Id: <tenantId>
 *   No DB lookup — zero cost. tenantId is trusted because the caller is authenticated
 *   via the shared secret known only to platform services.
 *
 * Branch B — Per-tenant M2M API Key (external integrators)
 *   Headers: Authorization: Bearer sk_live_...  or  X-Api-Key: sk_live_...
 *   tenantId sourced from DB record (ApiKey.tenantId).
 */
export async function verifyApiKey(request: FastifyRequest, reply: FastifyReply) {
    // ── Branch A: Internal shared secret ─────────────────────────────────────
    const internalSecret = request.headers['x-internal-secret'];
    const configuredSecret = process.env.INTERNAL_SECRET;

    if (internalSecret && typeof internalSecret === 'string') {
        if (!configuredSecret) {
            request.log.error({ module: 'api_key_middleware', msg: 'INTERNAL_SECRET não configurado no servidor.' });
            return reply.status(500).send({ error: 'Configuração interna ausente.' });
        }

        const valid = crypto.timingSafeEqual(
            Buffer.from(internalSecret),
            Buffer.from(configuredSecret)
        );

        if (!valid) {
            request.log.warn({ module: 'api_key_middleware', event: 'internal_secret_rejected', ip: request.ip });
            return reply.status(401).send({ error: 'X-Internal-Secret inválido.' });
        }

        const tenantId = request.headers['x-tenant-id'];
        if (!tenantId || typeof tenantId !== 'string') {
            return reply.status(400).send({ error: 'Header X-Tenant-Id obrigatório para chamadas internas.' });
        }

        const tenant = await prisma.tenant.findUnique({
            where: { id: tenantId },
            select: { id: true, name: true }
        });

        if (!tenant) {
            return reply.status(403).send({ error: 'Tenant inválido.' });
        }

        (request as any).tenantId   = tenant.id;
        (request as any).tenantName = tenant.name;
        return; // valid internal service call
    }

    // ── Branch B: Per-tenant M2M API Key ────────────────────────────────────
    const authHeader = request.headers['authorization'];
    const xApiKey = request.headers['x-api-key'];

    let rawKey = '';

    if (authHeader && authHeader.startsWith('Bearer ')) {
        rawKey = authHeader.substring(7);
    } else if (xApiKey && typeof xApiKey === 'string') {
        rawKey = xApiKey;
    }

    if (!rawKey) {
        return reply.status(401).send({ error: 'Missing API Key in Authorization or X-Api-Key header.' });
    }

    // SHA-256 hash to compare with DB
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

    const apiKeyRecord = await prisma.apiKey.findUnique({
        where: { keyHash },
        include: { tenant: true }
    });

    if (!apiKeyRecord) {
        return reply.status(401).send({ error: 'Invalid API Key.' });
    }

    if (!apiKeyRecord.isActive || apiKeyRecord.revokedAt) {
        return reply.status(401).send({ error: 'API Key is revoked or inactive.' });
    }

    if (apiKeyRecord.expiresAt && apiKeyRecord.expiresAt < new Date()) {
        return reply.status(401).send({ error: 'API Key has expired.' });
    }

    // Attach to context
    (request as any).tenantId = apiKeyRecord.tenantId;
    (request as any).tenantName = apiKeyRecord.tenant.name;
    (request as any).apiKey = apiKeyRecord;

    // Async tracking of last used (fire and forget)
    updateLastUsed(apiKeyRecord.id).catch(() => {});
}

async function updateLastUsed(id: string) {
    await prisma.apiKey.update({
        where: { id },
        data: { lastUsedAt: new Date() }
    });
}
