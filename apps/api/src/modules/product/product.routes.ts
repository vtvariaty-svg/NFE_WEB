import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../index.js';
import { compositeAuthMiddleware } from '../auth/composite-auth.middleware.js';
import { checkProductFiscalReadiness } from '../fiscal/validation/fiscal-readiness.js';

const productBody = z.object({
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
});

const updateBody = productBody.partial();

export async function productRoutes(app: FastifyInstance) {
    app.addHook('onRequest', compositeAuthMiddleware);

    // ── POST / ────────────────────────────────────────────────────────────────
    app.post('/', {
        schema: { body: productBody }
    }, async (request, reply) => {
        const data = request.body as any;
        const tenantId = (request as any).tenantId;

        const product = await prisma.product.create({
            data: { ...data, tenantId }
        });
        return reply.status(201).send(product);
    });

    // ── GET / ─────────────────────────────────────────────────────────────────
    app.get('/', async (request, reply) => {
        const tenantId = (request as any).tenantId;
        const products = await prisma.product.findMany({ where: { tenantId } });
        return { data: products };
    });

    // ── PUT /:id ──────────────────────────────────────────────────────────────
    app.put('/:id', {
        schema: { body: updateBody }
    }, async (request, reply) => {
        const tenantId = (request as any).tenantId;
        const { id } = request.params as { id: string };
        const data = request.body as any;

        const existing = await prisma.product.findFirst({ where: { id, tenantId } });
        if (!existing) return reply.status(404).send({ error: 'Produto não encontrado.' });

        const product = await prisma.product.update({
            where: { id },
            data
        });
        return reply.send(product);
    });

    // ── DELETE /:id ───────────────────────────────────────────────────────────
    app.delete('/:id', async (request, reply) => {
        const tenantId = (request as any).tenantId;
        const { id } = request.params as { id: string };

        const existing = await prisma.product.findFirst({ where: { id, tenantId } });
        if (!existing) return reply.status(404).send({ error: 'Produto não encontrado.' });

        await prisma.product.delete({ where: { id } });
        return reply.status(204).send();
    });

    // ── GET /:id/fiscal-readiness ─────────────────────────────────────────────
    app.get('/:id/fiscal-readiness', async (request, reply) => {
        const tenantId = (request as any).tenantId;
        const { id } = request.params as { id: string };

        const product = await prisma.product.findFirst({
            where: { id, tenantId },
            select: { id: true, name: true, ncm: true, icmsCst: true, pisCst: true, cofinsCst: true }
        });
        if (!product) return reply.status(404).send({ error: 'Produto não encontrado.' });

        const result = checkProductFiscalReadiness(product);
        return reply.send({ id: product.id, name: product.name, ...result });
    });
}
