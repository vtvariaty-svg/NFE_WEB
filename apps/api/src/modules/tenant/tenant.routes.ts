import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../index.js';
import tenantMiddleware from './tenant.middleware.js';
import { TenantUsageControlService } from './tenant.services.js';

export async function tenantRoutes(app: FastifyInstance) {
    app.addHook('onRequest', app.authenticate);

    // GET /tenants/me — current tenant info
    app.get('/me', async (request, reply) => {
        const user = (request as any).user;
        const tenants = await prisma.tenant.findMany({
            where: { users: { some: { id: user.sub } } }
        });
        return { data: tenants };
    });

    // POST /tenants/switch — issue new JWT scoped to a different tenant
    app.post('/switch', {
        schema: { body: z.object({ tenantId: z.string() }) }
    }, async (request, reply) => {
        const { tenantId } = request.body as any;
        const user = (request as any).user;

        const membership = await prisma.tenant.findFirst({
            where: { id: tenantId, users: { some: { id: user.sub } } }
        });

        if (!membership) {
            return reply.status(403).send({ message: 'Not a member of this tenant' });
        }

        const token = app.jwt.sign({ sub: user.sub, email: user.email, tenantId: membership.id });
        return { token, tenant: membership };
    });

    // ── Usage Control endpoints ──────────────────────────────────────────────

    // GET /tenants/usage — today's usage + last 30 days
    app.get('/usage', {
        onRequest: [tenantMiddleware as any],
        schema: {
            tags: ['Tenant'],
            summary: 'Uso de API do tenant (hoje + 30 dias)'
        }
    }, async (request, reply) => {
        const tenantId = (request as any).tenantId;
        const today = await TenantUsageControlService.getTodayUsage(tenantId);
        const history = await TenantUsageControlService.getUsageHistory(tenantId, 30);
        return { today, history };
    });

    // GET /tenants/usage/limits — check if tenant is over daily plan limit
    app.get('/usage/limits', {
        onRequest: [tenantMiddleware as any],
        schema: {
            tags: ['Tenant'],
            summary: 'Verificar limite diário por plano'
        }
    }, async (request, reply) => {
        const tenantId = (request as any).tenantId;
        // Fetch plan name from subscription
        const sub = await prisma.subscription.findFirst({
            where: { tenantId },
            include: { plan: true }
        });
        const planName = sub?.plan?.name || 'FREE';
        const isOver = await TenantUsageControlService.isOverLimit(tenantId, planName);
        const { requests } = await TenantUsageControlService.getTodayUsage(tenantId);
        return { tenantId, planName, requestsToday: requests, overLimit: isOver };
    });
}
