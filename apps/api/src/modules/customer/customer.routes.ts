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
                document: z.string(),
                type: z.string().optional(),
                ie: z.string().optional(),
                im: z.string().optional(),
                email: z.string().optional(),
                street: z.string().optional(),
                number: z.string().optional(),
                complement: z.string().optional(),
                district: z.string().optional(),
                city: z.string().optional(),
                state: z.string().optional(),
                zipCode: z.string().optional(),
                ibgeCode: z.string().optional(),
                phone: z.string().optional()
            })
        }
    }, async (request, reply) => {
        const data = request.body as any;
        const tenantId = (request as any).tenantId;

        const customer = await prisma.customer.create({
            data: { ...data, tenantId }
        });
        return reply.status(201).send(customer);
    });

    app.get('/', async (request, reply) => {
        const tenantId = (request as any).tenantId;
        const customers = await prisma.customer.findMany({ where: { tenantId } });
        return { data: customers };
    });
}
