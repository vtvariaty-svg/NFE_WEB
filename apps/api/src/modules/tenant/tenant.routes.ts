import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../index.js';
import tenantMiddleware from './tenant.middleware.js';

export async function tenantRoutes(app: FastifyInstance) {
    app.addHook('onRequest', app.authenticate);
    // specific tenant switch operations or info fetch operations

    app.get('/me', async (request, reply) => {
        const user = (request as any).user;
        const tenants = await prisma.tenant.findMany({
            where: { users: { some: { id: user.sub } } }
        });
        return { data: tenants };
    });

    app.post('/switch', {
        schema: {
            body: z.object({ tenantId: z.string() })
        }
    }, async (request, reply) => {
        const { tenantId } = request.body as any;
        const user = (request as any).user;

        // Verify membership
        const membership = await prisma.tenant.findFirst({
            where: { id: tenantId, users: { some: { id: user.sub } } }
        });

        if (!membership) {
            return reply.status(403).send({ message: 'Not a member of this tenant' });
        }

        // Return new JWT scoped to this tenant
        const token = app.jwt.sign({ sub: user.sub, email: user.email, tenantId: membership.id });
        return { token, tenant: membership };
    });
}
