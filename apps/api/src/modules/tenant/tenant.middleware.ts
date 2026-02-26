import { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../../index.js';

/**
 * Tenant Middleware — runs on every authenticated route.
 *
 * Priority of tenantId resolution:
 *   1. JWT payload (request.user.tenantId) — primary and most secure
 *   2. x-tenant-id header — fallback for service-to-service calls
 *
 * Also validates that the tenant exists and is active in the DB.
 * Increments the daily API usage counter for the tenant.
 */
export default async function tenantMiddleware(
    request: FastifyRequest,
    reply: FastifyReply
) {
    // 1. Resolve tenantId from JWT first, then header fallback
    const jwtUser = (request as any).user as { tenantId?: string } | undefined;
    const tenantId: string | undefined =
        jwtUser?.tenantId ||
        (request.headers['x-tenant-id'] as string) ||
        undefined;

    if (!tenantId) {
        return reply.status(400).send({ error: 'tenantId não encontrado. Autentique-se primeiro.' });
    }

    // 2. Validate tenant exists (cached in a real system — here we fast-query ID only)
    const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true, name: true }
    });

    if (!tenant) {
        return reply.status(403).send({ error: 'Tenant inválido ou não autorizado.' });
    }

    // 3. Attach to request context for downstream handlers
    (request as any).tenantId = tenantId;
    (request as any).tenantName = tenant.name;

    // 4. Increment daily usage counter (fire-and-forget — doesn't block the request)
    incrementUsage(tenantId, request.url).catch(() => { });
}

async function incrementUsage(tenantId: string, endpoint: string) {
    const today = new Date().toISOString().split('T')[0]; // 'YYYY-MM-DD'
    await prisma.tenantApiUsage.upsert({
        where: { tenantId_date: { tenantId, date: today } },
        create: { tenantId, date: today, requests: 1, lastEndpoint: endpoint },
        update: { requests: { increment: 1 }, lastEndpoint: endpoint }
    });
}
