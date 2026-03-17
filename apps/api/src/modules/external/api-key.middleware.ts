import { FastifyReply, FastifyRequest } from 'fastify';
import crypto from 'crypto';
import { prisma } from '../../index.js';

/**
 * API Key Middleware - validates external M2M requests
 * Expects header: "Authorization: Bearer sk_live_..." or "X-Api-Key: sk_live_..."
 */
export async function verifyApiKey(request: FastifyRequest, reply: FastifyReply) {
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
