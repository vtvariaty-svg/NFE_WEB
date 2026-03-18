import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../index.js';
import { compositeAuthMiddleware } from '../auth/composite-auth.middleware.js';
import { validateFiscalReadiness, EmissionFiscalItem } from './validation/fiscal-readiness.js';

const readinessCheckSchema = z.object({
    companyId: z.string().uuid(),
    customerId: z.string().uuid(),
    referencia: z.string().optional(),
    items: z.array(z.object({
        codigoProduto: z.string(),
        ncm: z.string().optional(),
        icmsCst: z.string().optional(),
        pisCst: z.string().optional(),
        cofinsCst: z.string().optional()
    }))
});

export async function fiscalReadinessRoutes(app: FastifyInstance) {
    app.addHook('onRequest', compositeAuthMiddleware);

    /**
     * POST /fiscal/readiness/check
     *
     * Full emission pre-flight: validates Company + Customer + all item Products
     * in one call. Returns rich readiness contract (ready/errors/warnings/missingFields/summary).
     *
     * Used by both NFE_WEB frontend and Automation-WhatsApp before triggering emission.
     */
    app.post('/check', {
        schema: { body: readinessCheckSchema }
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        const body = request.body as z.infer<typeof readinessCheckSchema>;
        const tenantId = (request as any).tenantId;

        // Fetch Company
        const company = await prisma.company.findFirst({
            where: { id: body.companyId, tenantId },
            select: { id: true, ibgeCode: true, crt: true, isActive: true }
        });
        if (!company) {
            return reply.status(404).send({ error: 'Empresa emissora não encontrada ou não pertence ao tenant.' });
        }
        if (!company.isActive) {
            return reply.status(409).send({ error: 'Empresa emissora está arquivada.' });
        }

        // Fetch Customer
        const customer = await prisma.customer.findFirst({
            where: { id: body.customerId, tenantId },
            select: { id: true, ibgeCode: true, isActive: true }
        });
        if (!customer) {
            return reply.status(404).send({ error: 'Destinatário não encontrado ou não pertence ao tenant.' });
        }
        if (!customer.isActive) {
            return reply.status(409).send({ error: 'Destinatário está arquivado.' });
        }

        // Resolve items: merge request data with Product DB data
        const itemsToValidate: EmissionFiscalItem[] = [];
        for (const item of body.items) {
            if (!item.ncm || !item.icmsCst || !item.pisCst || !item.cofinsCst) {
                const dbProd = await prisma.product.findFirst({
                    where: { tenantId, OR: [{ id: item.codigoProduto }, { sku: item.codigoProduto }] },
                    select: { ncm: true, icmsCst: true, pisCst: true, cofinsCst: true, sku: true }
                });
                if (dbProd) {
                    itemsToValidate.push({
                        codigoProduto: dbProd.sku || item.codigoProduto,
                        ncm:       item.ncm       || dbProd.ncm,
                        icmsCst:   item.icmsCst   || dbProd.icmsCst,
                        pisCst:    item.pisCst     || dbProd.pisCst,
                        cofinsCst: item.cofinsCst  || dbProd.cofinsCst
                    });
                    continue;
                }
            }
            itemsToValidate.push(item);
        }

        const result = validateFiscalReadiness({
            company,
            customer,
            items:      itemsToValidate,
            referencia: body.referencia
        });

        return reply.status(200).send(result);
    });
}
