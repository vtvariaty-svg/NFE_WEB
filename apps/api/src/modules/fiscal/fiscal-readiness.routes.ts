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

    // ── POST /check ────────────────────────────────────────────────────────────
    app.post('/check', {
        schema: {
            tags: ['Fiscal Readiness'],
            summary: 'Verifica prontidão geral para emissão (Company + Customer + Products)',
            body: readinessCheckSchema
        }
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        const body = request.body as z.infer<typeof readinessCheckSchema>;
        const tenantId = (request as any).tenantId;

        // Fetch Company
        const company = await prisma.company.findFirst({
            where: { id: body.companyId, tenantId },
            select: { ibgeCode: true, crt: true }
        });
        if (!company) return reply.status(404).send({ error: 'Empresa emissora não encontrada ou não pertence ao tenant.' });

        // Fetch Customer
        const customer = await prisma.customer.findFirst({
            where: { id: body.customerId, tenantId },
            select: { ibgeCode: true }
        });
        if (!customer) return reply.status(404).send({ error: 'Destinatário não encontrado ou não pertence ao tenant.' });

        // Build items data from DB if NCM/CST not provided directly
        const itemsToValidate: EmissionFiscalItem[] = [];
        for (const item of body.items) {
            // Se o payload não enviou CSTs/NCM, tenta buscar do banco como fallback real
            if (!item.ncm || !item.icmsCst) {
                const dbProd = await prisma.product.findFirst({
                    where: { id: item.codigoProduto, tenantId },
                    select: { ncm: true, icmsCst: true, pisCst: true, cofinsCst: true, sku: true }
                });

                if (dbProd) {
                    itemsToValidate.push({
                        codigoProduto: dbProd.sku || item.codigoProduto,
                        ncm: item.ncm || dbProd.ncm,
                        icmsCst: item.icmsCst || dbProd.icmsCst,
                        pisCst: item.pisCst || dbProd.pisCst,
                        cofinsCst: item.cofinsCst || dbProd.cofinsCst
                    });
                    continue; // processed
                }
            }
            // Add raw if fully populated or db fallback fails
            itemsToValidate.push(item);
        }

        const opts = {
            company,
            customer,
            referencia: body.referencia,
            items: itemsToValidate
        };

        const result = validateFiscalReadiness(opts);
        
        // Em vez de falhar 422, nós apenas retornamos 200 com a resposta do validador 
        // para que a UI consuma as mensagens ou erros não fatais
        return reply.status(200).send(result);
    });
}
