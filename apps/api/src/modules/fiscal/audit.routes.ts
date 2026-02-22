import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../../index.js';
import tenantMiddleware from '../tenant/tenant.middleware.js';

export async function auditRoutes(app: FastifyInstance) {
    app.addHook('onRequest', app.authenticate);
    app.addHook('onRequest', tenantMiddleware);

    // List audit trail (Read-Only)
    app.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
        const tenantId = (request as any).tenantId;

        const logs = await prisma.auditLog.findMany({
            where: { tenantId },
            orderBy: { createdAt: 'desc' },
            take: 100 // Keep list manageable
        });

        return reply.status(200).send({ data: logs });
    });
}
