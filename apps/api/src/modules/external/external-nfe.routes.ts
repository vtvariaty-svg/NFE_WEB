import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../index.js';
import { verifyApiKey } from './api-key.middleware.js';
import { idempotencyMiddleware, cacheIdempotencyResponseHook } from './idempotency.middleware.js';
import { EmissionService } from '../fiscal/nfe/services/emission.service.js';
import { NuvemFiscalProvider } from '../fiscal/providers/nuvemFiscal/index.js';
import type { NFePayload } from '../fiscal/fiscal.provider.js';

// ── Provider selection ────────────────────────────────────────────────────────

type FiscalProviderName = 'sefaz_direct' | 'nuvem_fiscal';

function getFiscalProviderName(): FiscalProviderName {
    const val = process.env.FISCAL_PROVIDER ?? 'sefaz_direct';
    return val === 'nuvem_fiscal' ? 'nuvem_fiscal' : 'sefaz_direct';
}

// ── Status normalisation (Nuvem Fiscal → Invoice.status) ──────────────────────

function toInvoiceStatus(nfStatus: string): string {
    switch (nfStatus) {
        case 'AUTORIZADO':  return 'AUTHORIZED';
        case 'PROCESSANDO': return 'SENT';
        case 'REJEITADO':   return 'REJECTED';
        case 'CANCELADO':   return 'CANCELED';
        case 'ERRO':        return 'ERROR';
        default:            return 'SENT';
    }
}

// ── Item fiscal data resolution ───────────────────────────────────────────────

interface ItemFiscalData {
    ncm: string;
    icms_origem: string;
    icms_situacao_tributaria: string;
    pis_situacao_tributaria: string;
    cofins_situacao_tributaria: string;
}

/**
 * Resolves a CST-like fiscal field for an NF-e item.
 *
 * Rules:
 *   - If the value exists (from Product or future request field) → use it.
 *   - Sandbox (NUVEM_FISCAL_DEFAULT_AMBIENTE=homologacao):
 *       fallback to the provided default, log a structured WARN.
 *   - Production (any other value):
 *       throw an explicit error — no silent defaults allowed.
 */
function resolveCst(
    value: string | null | undefined,
    fieldName: string,
    codigoProduto: string,
    fallback: string
): string {
    if (value?.trim()) return value.trim();

    const isSandbox = (process.env.NUVEM_FISCAL_DEFAULT_AMBIENTE ?? 'homologacao') !== 'producao';

    if (isSandbox) {
        console.warn(JSON.stringify({
            ts:            new Date().toISOString(),
            level:         'warn',
            module:        'nfe_cst_fallback',
            codigoProduto,
            field:         fieldName,
            fallback,
            msg:           `${fieldName} ausente — fallback sandbox aplicado. Cadastre o produto antes de produção.`
        }));
        return fallback;
    }

    throw new Error(
        `Campo "${fieldName}" obrigatório para o produto "${codigoProduto}" em ambiente de produção. ` +
        `Cadastre o campo no Product (sku="${codigoProduto}") ou informe no item da requisição.`
    );
}

/**
 * Resolves fiscal data for a single NF-e item.
 * Priority for NCM:
 *   1. Explicit field in request item.
 *   2. Product.ncm where Product.sku = codigo_produto.
 *   3. Error — never silently pass an invalid NCM in any environment.
 *
 * CST codes follow resolveCst() rules above.
 */
async function resolveItemFiscalData(
    tenantId: string,
    codigoProduto: string,
    requestNcm?: string
): Promise<ItemFiscalData> {
    const product = await prisma.product.findFirst({
        where: { tenantId, sku: codigoProduto },
        select: { ncm: true, icmsCst: true, pisCst: true, cofinsCst: true, icmsOrigin: true }
    });

    // NCM: no fallback in any environment — always required
    const ncm = requestNcm?.trim() || product?.ncm?.trim();
    if (!ncm) {
        throw new Error(
            `NCM ausente para o produto "${codigoProduto}". ` +
            `Informe o campo "ncm" no item da requisição ` +
            `ou cadastre o produto com NCM (Product.sku = "${codigoProduto}").`
        );
    }

    return {
        ncm,
        icms_origem:               product?.icmsOrigin ?? '0',
        icms_situacao_tributaria:  resolveCst(product?.icmsCst,    'icmsCst',    codigoProduto, '102'),
        pis_situacao_tributaria:   resolveCst(product?.pisCst,     'pisCst',     codigoProduto, '99'),
        cofins_situacao_tributaria: resolveCst(product?.cofinsCst, 'cofinsCst',  codigoProduto, '99'),
    };
}

// ── Zod schemas ───────────────────────────────────────────────────────────────

const itemSchema = z.object({
    codigo_produto:  z.string(),
    descricao:       z.string(),
    quantidade:      z.number().positive(),
    valor_unitario:  z.number().positive(),
    cfop:            z.string().default('5102'),
    ncm:             z.string().optional(),
    unidade:         z.string().default('UN')
});

const customerSchema = z.object({
    document: z.string().min(11).max(14),
    name:     z.string(),
    email:    z.string().email().optional(),
    /**
     * IBGE 7-digit city code for the customer address.
     * Required when FISCAL_PROVIDER=nuvem_fiscal and not already stored for this customer.
     * Source: Customer.ibgeCode (persisted after first request that provides it).
     */
    ibge_code: z.string().optional(),
    address: z.object({
        street:  z.string(),
        number:  z.string(),
        district: z.string(),
        city:    z.string(),
        state:   z.string().length(2),
        zipCode: z.string().length(8)
    })
});

const emitRequestSchema = z.object({
    external_reference_id: z.string(),
    company_id:            z.string().uuid(),
    natureza_operacao:     z.string().default('Venda de Mercadoria'),
    customer:              customerSchema,
    items:                 z.array(itemSchema).min(1)
});

// ── Routes ────────────────────────────────────────────────────────────────────

export async function externalNfeRoutes(app: FastifyInstance) {
    app.addHook('onRequest', verifyApiKey);
    app.addHook('onSend', cacheIdempotencyResponseHook);

    // ── POST /v1/external/nfe/issue ───────────────────────────────────────────
    app.post('/issue', {
        preHandler: [idempotencyMiddleware],
        schema: { body: emitRequestSchema }
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        const tenantId         = (request as any).tenantId;
        const body             = request.body as z.infer<typeof emitRequestSchema>;
        const idempotencyKey   = request.headers['idempotency-key'] as string;
        const providerName     = getFiscalProviderName();

        try {
            // ── Business duplication guard (provider-agnostic) ────────────────
            const existingInvoice = await prisma.invoice.findFirst({
                where: { tenantId, externalReference: body.external_reference_id }
            });
            if (existingInvoice) {
                return reply.status(409).send({
                    error: `NF-e com external_reference_id "${body.external_reference_id}" já processada.`,
                    code:       'business_duplication',
                    invoice_id: existingInvoice.id,
                    status:     existingInvoice.status,
                    protocol:   existingInvoice.protNprot
                });
            }

            // ── Upsert customer — persist ibgeCode when provided ──────────────
            const ibgeCodeUpdate = body.customer.ibge_code
                ? { ibgeCode: body.customer.ibge_code }
                : {};

            const customer = await prisma.customer.upsert({
                where: { tenantId_document: { tenantId, document: body.customer.document } },
                update: {
                    name:     body.customer.name,
                    email:    body.customer.email,
                    street:   body.customer.address.street,
                    number:   body.customer.address.number,
                    district: body.customer.address.district,
                    city:     body.customer.address.city,
                    state:    body.customer.address.state,
                    zipCode:  body.customer.address.zipCode,
                    ...ibgeCodeUpdate
                },
                create: {
                    tenantId,
                    type:     body.customer.document.replace(/\D/g, '').length > 11 ? 'JURIDICA' : 'FISICA',
                    document: body.customer.document,
                    name:     body.customer.name,
                    email:    body.customer.email,
                    street:   body.customer.address.street,
                    number:   body.customer.address.number,
                    district: body.customer.address.district,
                    city:     body.customer.address.city,
                    state:    body.customer.address.state,
                    zipCode:  body.customer.address.zipCode,
                    ...ibgeCodeUpdate
                }
            });

            // ── Fetch company (needed by both paths for environment/IBGE) ──────
            const company = await prisma.company.findFirst({
                where: { id: body.company_id, tenantId }
            });
            if (!company) {
                return reply.status(404).send({ error: 'Empresa não encontrada ou não pertence ao tenant.' });
            }

            // ══════════════════════════════════════════════════════════════════
            // PATH A — Nuvem Fiscal (sandbox / homologação only in this phase)
            // ══════════════════════════════════════════════════════════════════
            if (providerName === 'nuvem_fiscal') {

                // Resolve fiscal data for all items before any state change
                const resolvedItems = await Promise.all(
                    body.items.map(async (item) => {
                        const fiscal = await resolveItemFiscalData(tenantId, item.codigo_produto, item.ncm);
                        return { ...item, fiscal };
                    })
                );

                // Resolve ibge_code_destinatario:
                //   1. Persisted on Customer (from a previous request that included ibge_code)
                //   2. Provided in this request body
                //   3. Missing → adaptPayload() throws NuvemFiscalError 422
                const ibgeDestinatario = customer.ibgeCode ?? body.customer.ibge_code;

                // Derive tpAmb from provider environment configuration — no hardcodes
                const nfAmbiente = (process.env.NUVEM_FISCAL_DEFAULT_AMBIENTE ?? 'homologacao') as 'homologacao' | 'producao';
                const tpAmb      = nfAmbiente === 'producao' ? '1' : '2';

                // Build NFePayload with real domain data
                const nfePayload: NFePayload = {
                    natureza_operacao:            body.natureza_operacao,
                    data_emissao:                 new Date().toISOString(),
                    tipo_documento:               1,   // 1 = saída
                    finalidade_emissao:           1,   // 1 = normal
                    cnpj_emitente:                company.document,
                    inscricao_estadual_emitente:  company.ie  ?? '',
                    nome_emitente:                company.name,
                    nome_fantasia_emitente:       company.name,
                    logradouro_emitente:          company.street   ?? '',
                    numero_emitente:              company.number   ?? '',
                    bairro_emitente:              company.district ?? '',
                    municipio_emitente:           company.city     ?? '',
                    uf_emitente:                  company.state    ?? '',
                    cep_emitente:                 company.zipCode  ?? '',
                    nome_destinatario:            customer.name,
                    cpf_cnpj_destinatario:        customer.document,
                    inscricao_estadual_destinatario: customer.ie ?? undefined,
                    logradouro_destinatario:      customer.street  ?? '',
                    numero_destinatario:          customer.number  ?? '',
                    bairro_destinatario:          customer.district ?? '',
                    municipio_destinatario:       customer.city    ?? '',
                    uf_destinatario:              customer.state   ?? '',
                    cep_destinatario:             customer.zipCode ?? '',
                    // Extended fields — validated by adaptPayload()
                    referencia:               body.external_reference_id,
                    ibge_code_emitente:       company.ibgeCode  ?? undefined,
                    ibge_code_destinatario:   ibgeDestinatario  ?? undefined,
                    items: resolvedItems.map((item, idx) => ({
                        numero_item:               idx + 1,
                        codigo_produto:            item.codigo_produto,
                        descricao:                 item.descricao,
                        cfop:                      item.cfop,
                        unidade_comercial:         item.unidade,
                        quantidade_comercial:      item.quantidade,
                        valor_unitario_comercial:  item.valor_unitario,
                        valor_bruto:               item.quantidade * item.valor_unitario,
                        ncm:                       item.fiscal.ncm,
                        icms_origem:               item.fiscal.icms_origem,
                        icms_situacao_tributaria:  item.fiscal.icms_situacao_tributaria,
                        pis_situacao_tributaria:   item.fiscal.pis_situacao_tributaria,
                        cofins_situacao_tributaria: item.fiscal.cofins_situacao_tributaria,
                    }))
                };

                // Issue via Nuvem Fiscal — adaptPayload() validates all required fields
                const provider = new NuvemFiscalProvider();
                const nfResult = await provider.issueNFe(nfePayload);

                // Persist Invoice using dedicated provider columns (no xmlUnsigned hack)
                const invoice = await prisma.invoice.create({
                    data: {
                        tenantId,
                        companyId:          body.company_id,
                        type:               'NFE',
                        status:             toInvoiceStatus(nfResult.status),
                        tpAmb,                                        // from env, not hardcoded
                        externalReference:  body.external_reference_id,
                        providerName:       'nuvem_fiscal',
                        providerInvoiceId:  nfResult.externalId,
                        providerStatus:     nfResult.status,           // raw provider status
                        providerReference:  body.external_reference_id
                    }
                });

                request.log.info({
                    module:             'nfe_emission',
                    provider:           'nuvem_fiscal',
                    ambiente:           nfAmbiente,
                    tenantId,
                    companyId:          body.company_id,
                    externalReference:  body.external_reference_id,
                    providerInvoiceId:  nfResult.externalId,
                    status:             nfResult.status,
                    msg:                'NF-e emitida via Nuvem Fiscal'
                });

                return reply.status(200).send({
                    request_id:            request.id,
                    idempotency_key:       idempotencyKey,
                    status:                nfResult.status,
                    invoice_id:            invoice.id,            // internal DB ID
                    provider_invoice_id:   nfResult.externalId,   // Nuvem Fiscal UUID
                    external_reference_id: body.external_reference_id,
                    protocol:              null,                   // populated by sync worker after authorization
                    provider:              'nuvem_fiscal',
                    ambiente:              nfAmbiente
                });
            }

            // ══════════════════════════════════════════════════════════════════
            // PATH B — SEFAZ direct (existing, untouched)
            // ══════════════════════════════════════════════════════════════════
            const nfePayload: any = {
                naturezaOperacao: body.natureza_operacao,
                destinatario: {
                    cpfCnpj: customer.document,
                    nome:    customer.name,
                    endereco: {
                        logradouro: customer.street,
                        numero:     customer.number,
                        bairro:     customer.district,
                        municipio:  customer.city,
                        uf:         customer.state,
                        cep:        customer.zipCode
                    }
                },
                itens: body.items.map((it, idx) => ({
                    numeroItem:   idx + 1,
                    codigo:       it.codigo_produto,
                    descricao:    it.descricao,
                    cfop:         it.cfop,
                    unidade:      it.unidade,
                    quantidade:   it.quantidade,
                    valorUnitario: it.valor_unitario,
                    ncm:          it.ncm || '00000000'
                }))
            };

            const result = await EmissionService.emitNfe(
                tenantId,
                body.company_id,
                nfePayload,
                undefined
            );

            if (result.invoiceId) {
                await prisma.invoice.update({
                    where: { id: result.invoiceId },
                    data:  { externalReference: body.external_reference_id }
                });
            }

            return reply.status(200).send({
                request_id:            request.id,
                idempotency_key:       idempotencyKey,
                status:                result.status,
                invoice_id:            result.invoiceId,
                external_reference_id: body.external_reference_id,
                protocol:              result.protocol
            });

        } catch (error: any) {
            request.log.error(error);
            return reply.status(500).send({
                error:      'Internal processing error',
                message:    error.message,
                request_id: request.id
            });
        }
    });

    // ── GET /v1/external/nfe/id/:invoiceId/status ─────────────────────────────
    app.get('/id/:invoiceId/status', async (request: FastifyRequest, reply: FastifyReply) => {
        const tenantId    = (request as any).tenantId;
        const { invoiceId } = request.params as any;

        const invoice = await prisma.invoice.findFirst({
            where: { tenantId, id: invoiceId }
        });

        if (!invoice) return reply.status(404).send({ error: 'Invoice not found by ID.' });

        return reply.status(200).send({
            invoice_id:            invoice.id,
            external_reference_id: invoice.externalReference,
            status:                invoice.status,
            chave:                 invoice.chave44,
            protocol:              invoice.protNprot,
            created_at:            invoice.createdAt
        });
    });

    // ── GET /v1/external/nfe/ref/:externalReferenceId/status ─────────────────
    app.get('/ref/:externalReferenceId/status', async (request: FastifyRequest, reply: FastifyReply) => {
        const tenantId              = (request as any).tenantId;
        const { externalReferenceId } = request.params as any;

        const invoice = await prisma.invoice.findFirst({
            where: { tenantId, externalReference: externalReferenceId }
        });

        if (!invoice) return reply.status(404).send({ error: 'Invoice not found by External Reference.' });

        return reply.status(200).send({
            invoice_id:            invoice.id,
            external_reference_id: invoice.externalReference,
            status:                invoice.status,
            chave:                 invoice.chave44,
            protocol:              invoice.protNprot,
            created_at:            invoice.createdAt
        });
    });
}
