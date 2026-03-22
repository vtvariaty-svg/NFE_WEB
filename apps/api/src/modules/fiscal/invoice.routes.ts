import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../index.js';
import tenantMiddleware from '../tenant/tenant.middleware.js';
import { getFiscalProvider } from './fiscal.provider.js';

import { checkUsageLimit } from '../billing/billing.middleware.js';

export async function invoiceRoutes(app: FastifyInstance) {
    // Webhook route must NOT have authentication hooks
    app.post('/webhook', async (request, reply) => {
        const body = request.body as any;
        const ref = body.ref; // Our internal Invoice ID passed to FocusNFe
        const status = body.status; // 'autorizado', 'erro', 'cancelado', 'processando'
        const xml = body.xml; // Assuming Focus sends the XML link or base64
        const pdf = body.pdf;

        if (!ref || !status) return reply.status(400).send({ message: 'Missing ref or status' });

        const invoice = await prisma.invoice.findFirst({ where: { id: ref } });
        if (!invoice) return reply.status(404).send({ message: 'Invoice not found' });

        let newStatus = invoice.status;
        if (status === 'autorizado') newStatus = 'AUTHORIZED';
        if (status === 'erro') newStatus = 'REJECTED';
        if (status === 'cancelado') newStatus = 'CANCELED';
        if (status === 'processando') newStatus = 'PROCESSING';

        if (newStatus !== invoice.status) {
            await prisma.invoice.update({
                where: { id: invoice.id },
                data: { status: newStatus }
            });

            await prisma.auditLog.create({
                data: {
                    tenantId: invoice.tenantId,
                    action: `WEBHOOK_${newStatus}`,
                    resourceId: invoice.id,
                    metadata: JSON.stringify(body)
                }
            });

            if (newStatus === 'AUTHORIZED' && xml) {
                await prisma.legalArchive.upsert({
                    where: { invoiceId: invoice.id },
                    update: { xmlBase64: xml, pdfUrl: pdf },
                    create: {
                        tenantId: invoice.tenantId,
                        invoiceId: invoice.id,
                        xmlBase64: xml,
                        pdfUrl: pdf
                    }
                });
            }
        }
        return reply.status(200).send({ message: 'Ack' });
    });

    // Apply hooks ONLY for the routes defined below this line
    app.register(async function authenticatedRoutes(childApp) {
        childApp.addHook('onRequest', childApp.authenticate);
        childApp.addHook('onRequest', tenantMiddleware);

        childApp.post('/:orderId/issue', {
            schema: {
                params: z.object({ orderId: z.string() }),
                body: z.object({ type: z.enum(['NFE', 'NFSE']), companyId: z.string() })
            },
            preHandler: [checkUsageLimit]
        }, async (request, reply) => {
            const { orderId } = request.params as any;
            const { type, companyId } = request.body as any;
            const tenantId = (request as any).tenantId;

            const order = await prisma.order.findFirst({
                where: { id: orderId, tenantId },
                include: { items: { include: { product: true } }, customer: true }
            });
            if (!order) return reply.status(404).send({ message: 'Order not found' });

            const company = await prisma.company.findFirst({ where: { id: companyId, tenantId } });
            if (!company) return reply.status(404).send({ message: 'Company not found' });

            const customer = (order as any).customer
                || await prisma.customer.findFirst({ where: { tenantId } });
            if (!customer) return reply.status(400).send({ message: 'Nenhum destinatário vinculado ao pedido. Selecione um cliente ao criar o pedido.' });

            const provider = getFiscalProvider(tenantId);

            // Map DB data to FocusNFe layout
            const payload = {
                natureza_operacao: "Venda de Mercadoria",
                data_emissao: new Date().toISOString(),
                tipo_documento: 1,
                finalidade_emissao: 1,
                cnpj_emitente: company.document.replace(/\D/g, ''),
                inscricao_estadual_emitente: company.ie || "ISENTO",
                nome_emitente: company.name,
                nome_fantasia_emitente: company.name,
                logradouro_emitente: company.street || "Rua Teste",
                numero_emitente: company.number || "123",
                bairro_emitente: company.district || "Centro",
                municipio_emitente: company.city || "São Paulo",
                uf_emitente: company.state || "SP",
                cep_emitente: company.zipCode?.replace(/\D/g, '') || "01000000",

                nome_destinatario: customer.name,
                cpf_cnpj_destinatario: customer.document.replace(/\D/g, ''),
                inscricao_estadual_destinatario: customer.type === "JURIDICA" && customer.ie ? customer.ie : undefined,
                logradouro_destinatario: customer.street || "Rua Cliente",
                numero_destinatario: customer.number || "456",
                bairro_destinatario: customer.district || "Bairro",
                municipio_destinatario: customer.city || "Rio de Janeiro",
                uf_destinatario: customer.state || "RJ",
                cep_destinatario: customer.zipCode?.replace(/\D/g, '') || "20000000",

                ibge_code_emitente: company.ibgeCode || "3550308",
                ibge_code_destinatario: customer.ibgeCode || "3304557",

                items: order.items.map((item, index) => ({
                    numero_item: index + 1,
                    codigo_produto: item.product.sku || item.productId,
                    descricao: item.product.name,
                    cfop: item.product.cfop || "5102",
                    unidade_comercial: item.product.unit,
                    quantidade_comercial: item.quantity,
                    valor_unitario_comercial: item.price,
                    valor_bruto: item.price * item.quantity,
                    icms_origem: item.product.icmsOrigin || "0",
                    icms_situacao_tributaria: item.product.icmsCst || "102",
                    pis_situacao_tributaria: item.product.pisCst || "99",
                    cofins_situacao_tributaria: item.product.cofinsCst || "99",
                    ncm: item.product.ncm || "00000000",
                }))
            };

            const isNuvemFiscal = process.env.NUVEM_FISCAL_ENABLED === 'true' || process.env.FISCAL_PROVIDER === 'nuvem_fiscal';

            const invoice = await prisma.invoice.create({
                data: {
                    type,
                    status: 'DRAFT',
                    orderId: order.id,
                    tenantId,
                    providerName: isNuvemFiscal ? 'nuvem_fiscal' : 'focus_nfe'
                }
            });

            // Set stable invoice id as reference for NuvemFiscal
            (payload as any).referencia = invoice.id;

            let providerResult: { status: string, externalId: string, message?: string };
            try {
                providerResult = await provider.issueNFe(payload as any);
            } catch (err: any) {
                request.log.error({ msg: "Erro ao emitir Nuvem Fiscal", error: err.message, detail: err.detail });
                
                const rejectionMsg = err.detail ? `${err.message} - Detalhes: ${JSON.stringify(err.detail)}` : err.message;
                
                await prisma.invoice.update({
                    where: { id: invoice.id },
                    data: { status: 'ERROR', rejectionMsg: rejectionMsg.substring(0, 1000) }
                });
                return reply.status(500).send({ error: "Falha ao enviar ao provedor", details: err.message, providerDetails: err.detail });
            }

            const finalStatus = providerResult.status === 'PROCESSANDO' ? 'PROCESSING' : providerResult.status;

            await prisma.invoice.update({
                where: { id: invoice.id },
                data: {
                    status: finalStatus,
                    providerInvoiceId: providerResult.externalId,
                    providerStatus: providerResult.status
                }
            });

            if (finalStatus === 'AUTHORIZED' || finalStatus === 'AUTORIZADO') {
                const now = new Date();
                await prisma.usageCounter.upsert({
                    where: {
                        tenantId_month_year: {
                            tenantId,
                            month: now.getMonth() + 1,
                            year: now.getFullYear()
                        }
                    },
                    update: { emissions: { increment: 1 } },
                    create: {
                        tenantId,
                        month: now.getMonth() + 1,
                        year: now.getFullYear(),
                        emissions: 1
                    }
                });
            }

            return reply.status(201).send(invoice);
        });

        app.get('/', async (request, reply) => {
            const tenantId = (request as any).tenantId;
            const invoices = await prisma.invoice.findMany({ where: { tenantId } });
            return { data: invoices };
        });

        app.post('/:invoiceId/cancel', {
            schema: {
                params: z.object({ invoiceId: z.string() }),
                body: z.object({ reason: z.string() })
            }
        }, async (request, reply) => {
            const { invoiceId } = request.params as any;
            const { reason } = request.body as any;
            const tenantId = (request as any).tenantId;

            const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, tenantId } });
            if (!invoice) return reply.status(404).send();

            const provider = getFiscalProvider(tenantId);
            const success = await provider.cancelNFe(invoiceId, reason);

            if (success) {
                await prisma.invoice.update({
                    where: { id: invoice.id },
                    data: { status: 'CANCELED' }
                });
                return { message: 'Invoice canceled' };
            }

            return reply.status(400).send({ message: 'Failed to cancel invoice' });
        });
    });
}
