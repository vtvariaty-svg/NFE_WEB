import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../index.js';
import tenantMiddleware from '../tenant/tenant.middleware.js';

export async function customerRoutes(app: FastifyInstance) {
    app.addHook('onRequest', app.authenticate);
    app.addHook('onRequest', tenantMiddleware);

    app.post('/', {
        schema: {
            body: z.object({
                name: z.string(),
                document: z.string()
            })
        }
    }, async (request, reply) => {
        const { name, document } = request.body as any;
        const tenantId = (request as any).tenantId;

        const customer = await prisma.customer.create({
            data: { name, document, tenantId }
        });
        return reply.status(201).send(customer);
    });

    app.get('/', async (request, reply) => {
        const tenantId = (request as any).tenantId;
        const customers = await prisma.customer.findMany({ where: { tenantId } });
        return { data: customers };
    });
}
