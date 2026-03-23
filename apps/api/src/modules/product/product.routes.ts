import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../index.js';
import { compositeAuthMiddleware } from '../auth/composite-auth.middleware.js';
import { checkProductFiscalReadiness } from '../fiscal/validation/fiscal-readiness.js';

// ── Helpers de validação fiscal ──────────────────────────────────────────────
const digits = (n: number) => z.string().regex(new RegExp(`^\\d{${n}}$`), `Deve ter exatamente ${n} dígitos numéricos`);

const productBody = z.object({
    name: z.string().min(1, 'Nome do produto é obrigatório'),
    price: z.number().positive('Preço deve ser positivo'),
    sku: z.string().optional(),
    ncm: digits(8).describe('NCM — 8 dígitos. Consulte tabela da Receita Federal'),
    cest: z.string().regex(/^\d{7}$/, 'CEST deve ter 7 dígitos').optional().or(z.literal('')).optional(),
    cfop: digits(4).describe('CFOP — 4 dígitos. Ex: 5102 para venda dentro do estado'),
    unit: z.string().optional(),
    icmsCst: z.string().min(2, 'CST ICMS é obrigatório. Simples Nacional: 102, 400 ou 500'),
    pisCst: z.string().min(2, 'CST PIS é obrigatório. Simples Nacional: 07'),
    cofinsCst: z.string().min(2, 'CST COFINS é obrigatório. Simples Nacional: 07'),
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
        const products = await prisma.product.findMany({
            where: { tenantId, isActive: true }
        });
        return { data: products };
    });

    // ── GET /:id ──────────────────────────────────────────────────────────────
    app.get('/:id', async (request, reply) => {
        const tenantId = (request as any).tenantId;
        const { id } = request.params as { id: string };
        const product = await prisma.product.findFirst({ where: { id, tenantId } });
        if (!product) return reply.status(404).send({ error: 'Produto não encontrado.' });
        return reply.send(product);
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
        if (!existing.isActive) return reply.status(409).send({ error: 'Produto arquivado. Reative-o antes de editar.' });

        const product = await prisma.product.update({ where: { id }, data });
        return reply.send(product);
    });

    // ── DELETE /:id — SOFT DELETE ─────────────────────────────────────────────
    app.delete('/:id', async (request, reply) => {
        const tenantId = (request as any).tenantId;
        const { id } = request.params as { id: string };

        const existing = await prisma.product.findFirst({ where: { id, tenantId } });
        if (!existing) return reply.status(404).send({ error: 'Produto não encontrado.' });
        if (!existing.isActive) return reply.status(409).send({ error: 'Produto já está arquivado.' });

        await prisma.product.update({
            where: { id },
            data: { isActive: false, archivedAt: new Date() }
        });
        return reply.send({ archived: true, id, archivedAt: new Date().toISOString() });
    });

    // ── GET /:id/readiness  (alias: /:id/fiscal-readiness) ───────────────────
    async function productReadinessHandler(request: any, reply: any) {
        const tenantId = request.tenantId;
        const { id } = request.params as { id: string };

        const product = await prisma.product.findFirst({
            where: { id, tenantId },
            select: { id: true, name: true, ncm: true, icmsCst: true, pisCst: true, cofinsCst: true }
        });
        if (!product) return reply.status(404).send({ error: 'Produto não encontrado.' });

        const result = checkProductFiscalReadiness(product);
        return reply.send({ id: product.id, name: product.name, ...result });
    }

    app.get('/:id/readiness', productReadinessHandler);
    app.get('/:id/fiscal-readiness', productReadinessHandler);
}
