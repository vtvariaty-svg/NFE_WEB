import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../index.js';
import { verifyApiKey } from './api-key.middleware.js';
import { idempotencyMiddleware, cacheIdempotencyResponseHook } from './idempotency.middleware.js';
import { EmissionService } from '../fiscal/nfe/services/emission.service.js';

const itemSchema = z.object({
    codigo_produto: z.string(),
    descricao: z.string(),
    quantidade: z.number().positive(),
    valor_unitario: z.number().positive(),
    cfop: z.string().default('5102'),
    ncm: z.string().optional(),
    unidade: z.string().default('UN')
});

const customerSchema = z.object({
    document: z.string().min(11).max(14),
    name: z.string(),
    email: z.string().email().optional(),
    address: z.object({
        street: z.string(),
        number: z.string(),
        district: z.string(),
        city: z.string(),
        state: z.string().length(2),
        zipCode: z.string().length(8)
    })
});

const emitRequestSchema = z.object({
    external_reference_id: z.string(),
    company_id: z.string().uuid(),
    natureza_operacao: z.string().default('Venda de Mercadoria'),
    customer: customerSchema,
    items: z.array(itemSchema).min(1)
});

export async function externalNfeRoutes(app: FastifyInstance) {
    // 1. Force Machine-to-Machine authentication
    app.addHook('onRequest', verifyApiKey);

    // 2. Wrap all successful requests or validation errors into Idempotency cache
    app.addHook('onSend', cacheIdempotencyResponseHook);

    // POST /api/v1/nfe/issue
    app.post('/issue', {
        preHandler: [idempotencyMiddleware],
        schema: {
            body: emitRequestSchema
        }
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        const tenantId = (request as any).tenantId;
        const body = request.body as z.infer<typeof emitRequestSchema>;
        const idempotencyKey = request.headers['idempotency-key'] as string; // Guaranteed by middleware

        try {
            // Business Duplication Check: Prevent processing identical orders
            const existingInvoice = await prisma.invoice.findFirst({
                where: { tenantId, externalReference: body.external_reference_id }
            });

            if (existingInvoice) {
                // Return exactly the pattern of an already processed invoice but 409
                return reply.status(409).send({
                    error: `Uma NF-e com este external_reference_id (${body.external_reference_id}) já foi emitida ou processada.`,
                    code: 'business_duplication',
                    invoice_id: existingInvoice.id,
                    status: existingInvoice.status,
                    protocol: existingInvoice.protNprot
                });
            }

            // Find or Create the customer in the context of the external application
            // You can refine this to match existing models perfectly
            const customer = await prisma.customer.upsert({
                where: { tenantId_document: { tenantId, document: body.customer.document } },
                update: {
                    name: body.customer.name,
                    email: body.customer.email,
                    street: body.customer.address.street,
                    number: body.customer.address.number,
                    district: body.customer.address.district,
                    city: body.customer.address.city,
                    state: body.customer.address.state,
                    zipCode: body.customer.address.zipCode
                },
                create: {
                    tenantId,
                    type: body.customer.document.length > 11 ? 'JURIDICA' : 'FISICA',
                    document: body.customer.document,
                    name: body.customer.name,
                    email: body.customer.email,
                    street: body.customer.address.street,
                    number: body.customer.address.number,
                    district: body.customer.address.district,
                    city: body.customer.address.city,
                    state: body.customer.address.state,
                    zipCode: body.customer.address.zipCode
                }
            });

            // Format payload to the EmissionService's expectation
            // The API payload might differ slightly from the UI payload. We map it here.
            const nfePayload: any = {
                naturezaOperacao: body.natureza_operacao,
                destinatario: {
                    cpfCnpj: customer.document,
                    nome: customer.name,
                    endereco: {
                        logradouro: customer.street,
                        numero: customer.number,
                        bairro: customer.district,
                        municipio: customer.city,
                        uf: customer.state,
                        cep: customer.zipCode
                    }
                },
                itens: body.items.map((it, idx) => ({
                    numeroItem: idx + 1,
                    codigo: it.codigo_produto,
                    descricao: it.descricao,
                    cfop: it.cfop,
                    unidade: it.unidade,
                    quantidade: it.quantidade,
                    valorUnitario: it.valor_unitario,
                    ncm: it.ncm || '00000000'
                }))
            };

            // Call the real unified service
            const result = await EmissionService.emitNfe(
                tenantId,
                body.company_id,
                nfePayload,
                undefined // Using undefined for abstract orderId since it's external
            );

            // Update local Invoice record with external reference
            if (result.invoiceId) {
                await prisma.invoice.update({
                    where: { id: result.invoiceId },
                    data: { externalReference: body.external_reference_id }
                });
            }

            return reply.status(200).send({
                request_id: request.id,
                idempotency_key: idempotencyKey,
                status: result.status,
                invoice_id: result.invoiceId,
                external_reference_id: body.external_reference_id,
                protocol: result.protocol
            });

        } catch (error: any) {
            // Unhandled exceptions (e.g certificate missing, database down) will return 500
            // The idempotency hook will NOT cache 5xx so the user can genuinely retry
            request.log.error(error);
            return reply.status(500).send({ 
                error: 'Internal processing error', 
                message: error.message,
                request_id: request.id
            });
        }
    });

    // GET /api/v1/nfe/id/:invoiceId/status
    app.get('/id/:invoiceId/status', async (request: FastifyRequest, reply: FastifyReply) => {
        const tenantId = (request as any).tenantId;
        const { invoiceId } = request.params as any;

        const invoice = await prisma.invoice.findFirst({
            where: { tenantId, id: invoiceId }
        });

        if (!invoice) return reply.status(404).send({ error: 'Invoice not found by ID.' });

        return reply.status(200).send({
            invoice_id: invoice.id,
            external_reference_id: invoice.externalReference,
            status: invoice.status,
            chave: invoice.chave44,
            protocol: invoice.protNprot,
            created_at: invoice.createdAt
        });
    });

    // GET /api/v1/nfe/ref/:externalReferenceId/status
    app.get('/ref/:externalReferenceId/status', async (request: FastifyRequest, reply: FastifyReply) => {
        const tenantId = (request as any).tenantId;
        const { externalReferenceId } = request.params as any;

        const invoice = await prisma.invoice.findFirst({
            where: { tenantId, externalReference: externalReferenceId }
        });

        if (!invoice) return reply.status(404).send({ error: 'Invoice not found by External Reference.' });

        return reply.status(200).send({
            invoice_id: invoice.id,
            external_reference_id: invoice.externalReference,
            status: invoice.status,
            chave: invoice.chave44,
            protocol: invoice.protNprot,
            created_at: invoice.createdAt
        });
    });
}
