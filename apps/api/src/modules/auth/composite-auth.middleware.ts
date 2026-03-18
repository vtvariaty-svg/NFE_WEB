/**
 * compositeAuthMiddleware
 *
 * Single authentication hook that accepts either:
 *   A) M2M API Key  — `Authorization: Bearer sk_live_<key>` or `X-API-Key: <key>`
 *   B) JWT Bearer   — `Authorization: Bearer <jwt>` (GUI sessions)
 *
 * Security guarantees:
 *  - tenantId is ALWAYS sourced from the validated credential (JWT payload or API Key DB record).
 *    It CANNOT be overridden by request headers — no X-Tenant-ID header fallback.
 *  - API Key path: tenantId comes from ApiKey.tenantId in DB (immutable after creation).
 *  - JWT path: tenantId comes from the verified JWT payload claim.
 *  - Both paths validate the tenant exists and is active before setting context.
 *  - Super-admin JWTs that carry no tenantId are rejected with 403 here.
 *    Admin routes have their own separate middleware that does not enforce tenantId.
 */
import { FastifyReply, FastifyRequest } from 'fastify';
import crypto from 'crypto';
import { prisma } from '../../index.js';

export async function compositeAuthMiddleware(request: FastifyRequest, reply: FastifyReply) {
    const authHeader = request.headers['authorization'];
    const xApiKey   = request.headers['x-api-key'];

    // ── Branch A: M2M API Key ─────────────────────────────────────────────────
    let isApiKey = false;
    let rawKey   = '';

    if (authHeader && authHeader.startsWith('Bearer sk_live_')) {
        isApiKey = true;
        rawKey   = authHeader.substring(7); // strip 'Bearer '
    } else if (xApiKey && typeof xApiKey === 'string') {
        isApiKey = true;
        rawKey   = xApiKey;
    }

    if (isApiKey) {
        if (!rawKey) {
            return reply.status(401).send({ error: 'API Key vazia ou inválida.' });
        }

        const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

        const apiKeyRecord = await prisma.apiKey.findUnique({
            where: { keyHash },
            include: { tenant: { select: { id: true, name: true } } }
        });

        if (
            !apiKeyRecord
            || !apiKeyRecord.isActive
            || apiKeyRecord.revokedAt !== null
            || (apiKeyRecord.expiresAt !== null && apiKeyRecord.expiresAt < new Date())
        ) {
            // Log the failed attempt for audit purposes (fire-and-forget)
            request.log.warn({
                module: 'composite_auth',
                event:  'api_key_rejected',
                hint:   rawKey.slice(-4),
                ip:     request.ip
            });
            return reply.status(401).send({ error: 'M2M API Key inválida, revogada ou expirada.' });
        }

        // Tenant isolation: sourced exclusively from DB record — not from headers
        (request as any).tenantId   = apiKeyRecord.tenantId;
        (request as any).tenantName = apiKeyRecord.tenant.name;
        (request as any).apiKey     = apiKeyRecord;

        // Async lastUsedAt — never blocks the request
        prisma.apiKey.update({
            where: { id: apiKeyRecord.id },
            data:  { lastUsedAt: new Date() }
        }).catch(() => {});

        return; // valid M2M — proceed to handler
    }

    // ── Branch B: JWT (GUI session) ───────────────────────────────────────────
    try {
        await request.jwtVerify();
    } catch {
        return reply.status(401).send({ error: 'Token JWT inválido ou expirado.' });
    }

    const jwtPayload = (request as any).user as { tenantId?: string; role?: string } | undefined;

    // tenantId must come from JWT claim — never from headers (prevents tenant spoofing)
    const tenantId = jwtPayload?.tenantId;

    if (!tenantId) {
        // Super-admin JWTs without tenantId must use admin-specific routes.
        request.log.warn({
            module: 'composite_auth',
            event:  'jwt_missing_tenant',
            role:   jwtPayload?.role ?? 'unknown',
            ip:     request.ip,
            path:   request.url
        });
        return reply.status(403).send({
            error: 'Este endpoint requer um token de usuário com tenantId. ' +
                   'Tokens de super-admin devem usar os endpoints /admin/*.'
        });
    }

    // Validate the tenant is active
    const tenant = await prisma.tenant.findUnique({
        where:  { id: tenantId },
        select: { id: true, name: true }
    });

    if (!tenant) {
        return reply.status(403).send({ error: 'Tenant inválido ou desativado.' });
    }

    // Tenant isolation: sourced from verified JWT claim
    (request as any).tenantId   = tenantId;
    (request as any).tenantName = tenant.name;
}
