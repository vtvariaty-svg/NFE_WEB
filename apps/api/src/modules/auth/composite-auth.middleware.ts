import { FastifyReply, FastifyRequest } from 'fastify';
import crypto from 'crypto';
import { prisma } from '../../index.js';

export async function compositeAuthMiddleware(request: FastifyRequest, reply: FastifyReply) {
    const authHeader = request.headers['authorization'];
    const xApiKey = request.headers['x-api-key'];

    let isApiKey = false;
    let rawKey = '';

    if (authHeader && authHeader.startsWith('Bearer sk_live_')) {
        isApiKey = true;
        rawKey = authHeader.substring(7);
    } else if (xApiKey && typeof xApiKey === 'string') {
        isApiKey = true;
        rawKey = xApiKey;
    }

    if (isApiKey) {
        // --- 1. M2M API Key Validation ---
        const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
        
        const apiKeyRecord = await prisma.apiKey.findUnique({
            where: { keyHash },
            include: { tenant: true }
        });

        if (!apiKeyRecord || !apiKeyRecord.isActive || apiKeyRecord.revokedAt || (apiKeyRecord.expiresAt && apiKeyRecord.expiresAt < new Date())) {
            return reply.status(401).send({ error: 'M2M API Key inválida, revogada ou expirada.' });
        }

        // Apply tenant context
        (request as any).tenantId = apiKeyRecord.tenantId;
        (request as any).tenantName = apiKeyRecord.tenant.name;
        (request as any).apiKey = apiKeyRecord;

        // Async usage track
        prisma.apiKey.update({
            where: { id: apiKeyRecord.id },
            data: { lastUsedAt: new Date() }
        }).catch(() => {});
        
        return; // Valid M2M, proceed handler safely
    }

    // --- 2. GUI JWT Verification Fallback ---
    try {
        await request.jwtVerify();
        
        // Emulate the tenantMiddleware behavior locally since we replaced both hooks
        const jwtUser = (request as any).user as { tenantId?: string } | undefined;
        const tenantId = jwtUser?.tenantId || (request.headers['x-tenant-id'] as string) || undefined;

        if (!tenantId) {
            return reply.status(400).send({ error: 'tenantId ausente no JWT ou no cabeçalho.' });
        }

        // Validate tenant exists (quick)
        const tenant = await prisma.tenant.findUnique({
            where: { id: tenantId },
            select: { id: true, name: true }
        });

        if (!tenant) {
            return reply.status(403).send({ error: 'Tenant inválido ou desativado.' });
        }

        (request as any).tenantId = tenantId;
        (request as any).tenantName = tenant.name;
    } catch (err) {
        return reply.status(401).send({ error: 'Token JWT inválido, expirado ou formato não suportado.', details: err });
    }
}
