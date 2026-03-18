import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../index.js';
import { compositeAuthMiddleware } from '../auth/composite-auth.middleware.js';
import { checkCompanyFiscalReadiness } from '../fiscal/validation/fiscal-readiness.js';

const companyBody = z.object({
    name: z.string(),
    document: z.string(),
    ie: z.string().optional(),
    cnae: z.string().optional(),
    crt: z.string().optional(),
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

const updateBody = companyBody.partial().omit({ document: true });

export async function companyRoutes(app: FastifyInstance) {
    app.addHook('onRequest', compositeAuthMiddleware);

    // ── POST / ────────────────────────────────────────────────────────────────
    app.post('/', {
        schema: { body: companyBody }
    }, async (request, reply) => {
        const data = request.body as any;
        const tenantId = (request as any).tenantId;

        const company = await prisma.company.create({
            data: { ...data, tenantId }
        });
        return reply.status(201).send(company);
    });

    // ── GET / ─────────────────────────────────────────────────────────────────
    app.get('/', async (request, reply) => {
        const tenantId = (request as any).tenantId;
        const companies = await prisma.company.findMany({ where: { tenantId } });
        return { data: companies };
    });

    // ── PUT /:id ──────────────────────────────────────────────────────────────
    app.put('/:id', {
        schema: { body: updateBody }
    }, async (request, reply) => {
        const tenantId = (request as any).tenantId;
        const { id } = request.params as { id: string };
        const data = request.body as any;

        const existing = await prisma.company.findFirst({ where: { id, tenantId } });
        if (!existing) return reply.status(404).send({ error: 'Empresa não encontrada.' });

        const company = await prisma.company.update({
            where: { id },
            data
        });
        return reply.send(company);
    });

    // ── DELETE /:id ───────────────────────────────────────────────────────────
    app.delete('/:id', async (request, reply) => {
        const tenantId = (request as any).tenantId;
        const { id } = request.params as { id: string };

        const existing = await prisma.company.findFirst({ where: { id, tenantId } });
        if (!existing) return reply.status(404).send({ error: 'Empresa não encontrada.' });

        await prisma.company.delete({ where: { id } });
        return reply.status(204).send();
    });

    // ── GET /:id/fiscal-readiness ─────────────────────────────────────────────
    app.get('/:id/fiscal-readiness', async (request, reply) => {
        const tenantId = (request as any).tenantId;
        const { id } = request.params as { id: string };

        const company = await prisma.company.findFirst({
            where: { id, tenantId },
            select: { id: true, name: true, ibgeCode: true, crt: true }
        });
        if (!company) return reply.status(404).send({ error: 'Empresa não encontrada.' });

        const result = checkCompanyFiscalReadiness(company);
        return reply.send({ id: company.id, name: company.name, ...result });
    });
}
