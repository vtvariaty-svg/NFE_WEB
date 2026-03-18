import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../index.js';
import { compositeAuthMiddleware } from '../auth/composite-auth.middleware.js';
import { checkCustomerFiscalReadiness } from '../fiscal/validation/fiscal-readiness.js';

const customerBody = z.object({
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
});

const updateBody = customerBody.partial().omit({ document: true });

export async function customerRoutes(app: FastifyInstance) {
    app.addHook('onRequest', compositeAuthMiddleware);

    // ── POST / ────────────────────────────────────────────────────────────────
    app.post('/', {
        schema: { body: customerBody }
    }, async (request, reply) => {
        const data = request.body as any;
        const tenantId = (request as any).tenantId;

        const customer = await prisma.customer.create({
            data: { ...data, tenantId }
        });
        return reply.status(201).send(customer);
    });

    // ── GET / ─────────────────────────────────────────────────────────────────
    app.get('/', async (request, reply) => {
        const tenantId = (request as any).tenantId;
        const customers = await prisma.customer.findMany({ where: { tenantId } });
        return { data: customers };
    });

    // ── GET /:id ──────────────────────────────────────────────────────────────
    app.get('/:id', async (request, reply) => {
        const tenantId = (request as any).tenantId;
        const { id } = request.params as { id: string };
        const customer = await prisma.customer.findFirst({ where: { id, tenantId } });
        if (!customer) return reply.status(404).send({ error: 'Cliente não encontrado.' });
        return reply.send(customer);
    });

    // ── PUT /:id ──────────────────────────────────────────────────────────────
    app.put('/:id', {
        schema: { body: updateBody }
    }, async (request, reply) => {
        const tenantId = (request as any).tenantId;
        const { id } = request.params as { id: string };
        const data = request.body as any;

        const existing = await prisma.customer.findFirst({ where: { id, tenantId } });
        if (!existing) return reply.status(404).send({ error: 'Cliente não encontrado.' });

        const customer = await prisma.customer.update({
            where: { id },
            data
        });
        return reply.send(customer);
    });

    // ── DELETE /:id ───────────────────────────────────────────────────────────
    app.delete('/:id', async (request, reply) => {
        const tenantId = (request as any).tenantId;
        const { id } = request.params as { id: string };

        const existing = await prisma.customer.findFirst({ where: { id, tenantId } });
        if (!existing) return reply.status(404).send({ error: 'Cliente não encontrado.' });

        await prisma.customer.delete({ where: { id } });
        return reply.status(204).send();
    });

    // ── GET /:id/readiness  (alias: /:id/fiscal-readiness) ───────────────────
    async function customerReadinessHandler(request: any, reply: any) {
        const tenantId = request.tenantId;
        const { id } = request.params as { id: string };

        const customer = await prisma.customer.findFirst({
            where: { id, tenantId },
            select: { id: true, name: true, ibgeCode: true }
        });
        if (!customer) return reply.status(404).send({ error: 'Cliente não encontrado.' });

        const result = checkCustomerFiscalReadiness(customer);
        return reply.send({ id: customer.id, name: customer.name, ...result });
    }

    app.get('/:id/readiness', customerReadinessHandler);
    app.get('/:id/fiscal-readiness', customerReadinessHandler);
}
