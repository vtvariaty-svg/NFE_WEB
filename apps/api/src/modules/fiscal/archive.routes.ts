import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../index.js';
import tenantMiddleware from '../tenant/tenant.middleware.js';

export async function archiveRoutes(app: FastifyInstance) {
    app.addHook('onRequest', app.authenticate);
    app.addHook('onRequest', tenantMiddleware);

    // List all archived XMLs
    app.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
        const tenantId = (request as any).tenantId;

        const archives = await prisma.legalArchive.findMany({
            where: { tenantId },
            include: { invoice: { include: { order: true } } },
            orderBy: { createdAt: 'desc' }
        });

        return reply.status(200).send({ data: archives });
    });

    // Get specific archived XML details
    app.get('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
        const { id } = request.params as any;
        const tenantId = (request as any).tenantId;

        const archive = await prisma.legalArchive.findFirst({
            where: { id, tenantId },
            include: { invoice: true }
        });

        if (!archive) return reply.status(404).send({ message: "Archive not found" });

        return reply.status(200).send(archive);
    });
}
