import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../index.js';
import tenantMiddleware from '../tenant/tenant.middleware.js';

export async function productRoutes(app: FastifyInstance) {
    app.addHook('onRequest', app.authenticate);
    app.addHook('onRequest', tenantMiddleware);

    app.post('/', {
        schema: {
            body: z.object({
                name: z.string(),
                price: z.number(),
                sku: z.string().optional(),
                ncm: z.string().optional(),
                cest: z.string().optional(),
                cfop: z.string().optional(),
                unit: z.string().optional(),
                icmsCst: z.string().optional(),
                pisCst: z.string().optional(),
                cofinsCst: z.string().optional(),
                icmsOrigin: z.string().optional()
            })
        }
    }, async (request, reply) => {
        const data = request.body as any;
        const tenantId = (request as any).tenantId;

        const product = await prisma.product.create({
            data: { ...data, tenantId }
        });
        return reply.status(201).send(product);
    });

    app.get('/', async (request, reply) => {
        const tenantId = (request as any).tenantId;
        const products = await prisma.product.findMany({ where: { tenantId } });
        return { data: products };
    });
}
