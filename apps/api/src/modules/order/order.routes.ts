import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../index.js';
import tenantMiddleware from '../tenant/tenant.middleware.js';

export async function orderRoutes(app: FastifyInstance) {
    app.addHook('onRequest', app.authenticate);
    app.addHook('onRequest', tenantMiddleware);

    app.post('/', {
        schema: {
            body: z.object({
                items: z.array(z.object({
                    productId: z.string(),
                    quantity: z.number().int().min(1)
                }))
            })
        }
    }, async (request, reply) => {
        const { items } = request.body as any;
        const tenantId = (request as any).tenantId;

        // Calculate total
        let total = 0;
        const products = await prisma.product.findMany({
            where: { id: { in: items.map((i: any) => i.productId) }, tenantId }
        });

        const productMap = new Map<string, any>(products.map((p: any) => [p.id, p]));
        const orderItemsRecord: any[] = [];

        for (const item of items) {
            const p = productMap.get(item.productId);
            if (!p) return reply.status(400).send({ message: `Product ${item.productId} not found` });

            const itemTotal = p.price * item.quantity;
            total += itemTotal;

            orderItemsRecord.push({
                productId: p.id,
                quantity: item.quantity,
                price: p.price
            });
        }

        const order = await prisma.order.create({
            data: {
                tenantId,
                total,
                status: 'PENDING',
                items: {
                    create: orderItemsRecord
                }
            },
            include: { items: true }
        });

        return reply.status(201).send(order);
    });

    app.get('/', async (request, reply) => {
        const tenantId = (request as any).tenantId;
        const orders = await prisma.order.findMany({
            where: { tenantId },
            include: { items: true, invoices: true }
        });
        return { data: orders };
    });

    app.get('/:id', async (request, reply) => {
        const { id } = request.params as any;
        const tenantId = (request as any).tenantId;

        const order = await prisma.order.findFirst({
            where: { id, tenantId },
            include: { items: { include: { product: true } }, invoices: true }
        });
        if (!order) return reply.status(404).send();
        return order;
    });
}
