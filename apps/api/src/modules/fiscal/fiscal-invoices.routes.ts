/**
 * fiscal-invoices.routes.ts
 *
 * Provider-agnostic invoice operations exposed via the central /fiscal namespace.
 * Consumed by both NFE_WEB frontend and Automation-WhatsApp.
 *
 * Endpoints:
 *   GET /fiscal/invoices/:id/xml   — download authorized NF-e XML
 */
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../index.js';
import { compositeAuthMiddleware } from '../auth/composite-auth.middleware.js';
import { NuvemFiscalProvider } from './providers/nuvemFiscal/index.js';

export async function fiscalInvoicesRoutes(app: FastifyInstance) {
    app.addHook('onRequest', compositeAuthMiddleware);

    /**
     * GET /fiscal/invoices/:id/xml
     *
     * Downloads the authorized NF-e XML for the given invoice.
     *
     * Resolution order:
     *  1. Invoice.xmlAuthorized in DB → return immediately (fastest, no external call)
     *  2. Invoice.xmlSigned in DB     → return as fallback (may not have protocol stamp)
     *  3. providerName=nuvem_fiscal + providerInvoiceId + status=AUTHORIZED
     *     → fetch from Nuvem Fiscal, persist to xmlAuthorized, return
     *
     * Error codes:
     *  404 — invoice not found or doesn't belong to tenant
     *  409 — invoice not yet authorized (SENT/PENDING)
     *  422 — invoice rejected/canceled — XML not available
     */
    app.get('/:id/xml', {
        schema: { params: z.object({ id: z.string().uuid() }) }
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        const tenantId = (request as any).tenantId;
        const { id } = request.params as { id: string };

        const invoice = await prisma.invoice.findFirst({
            where: { id, tenantId },
            select: {
                id:               true,
                status:           true,
                chave44:          true,
                xmlAuthorized:    true,
                xmlSigned:        true,
                providerName:     true,
                providerInvoiceId: true
            }
        });

        if (!invoice) {
            return reply.status(404).send({ error: 'NF-e não encontrada.' });
        }

        if (['REJECTED', 'CANCELED', 'ERROR'].includes(invoice.status)) {
            return reply.status(422).send({
                error: `XML não disponível — NF-e com status "${invoice.status}".`
            });
        }

        if (!['AUTHORIZED'].includes(invoice.status) && !invoice.xmlAuthorized && !invoice.xmlSigned) {
            return reply.status(409).send({
                error: `NF-e ainda não autorizada (status: ${invoice.status}). Aguarde a autorização pela SEFAZ.`
            });
        }

        // 1. DB-cached authorized XML (fastest)
        if (invoice.xmlAuthorized) {
            return sendXml(reply, invoice.xmlAuthorized, invoice.chave44);
        }

        // 2. Signed XML fallback (SEFAZ direct — xmlAuthorized may be null in this flow)
        if (invoice.xmlSigned) {
            return sendXml(reply, invoice.xmlSigned, invoice.chave44);
        }

        // 3. On-demand from Nuvem Fiscal
        if (invoice.providerName === 'nuvem_fiscal' && invoice.providerInvoiceId) {
            try {
                const provider = new NuvemFiscalProvider();
                const xml = await provider.downloadXml(invoice.providerInvoiceId);

                if (!xml) {
                    return reply.status(404).send({ error: 'XML ainda não disponível no provider.' });
                }

                // Persist so subsequent requests skip the external call
                await prisma.invoice.update({
                    where: { id: invoice.id },
                    data: { xmlAuthorized: xml }
                });

                return sendXml(reply, xml, invoice.chave44);
            } catch (err: any) {
                return reply.status(502).send({
                    error: 'Falha ao buscar XML no provider fiscal.',
                    detail: err.message
                });
            }
        }

        return reply.status(404).send({ error: 'XML não disponível para esta NF-e.' });
    });
}

function sendXml(reply: FastifyReply, xml: string, chave44: string | null) {
    const filename = chave44 ? `NFe_${chave44}.xml` : 'NFe.xml';
    reply.header('Content-Type', 'application/xml; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);
    return reply.send(xml);
}
