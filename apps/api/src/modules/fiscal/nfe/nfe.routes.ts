import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CertificateService } from './services/certificate.service.js';
import { EmissionService } from './services/emission.service.js';
import {
    NfeCancelService,
    NfeCceService,
    NfeInutilizacaoService,
    NfeManifestacaoService,
    NfeStatusService,
    NfeContingenciaService,
    NfeDownloadService,
    NfeRetryService
} from './services/events.service.js';
import tenantMiddleware from '../../tenant/tenant.middleware.js';
import { prisma } from '../../../index.js';

export async function nfeRoutes(app: FastifyInstance) {
    app.addHook('onRequest', app.authenticate);
    app.addHook('onRequest', tenantMiddleware);

    // ── CERTIFICATE ────────────────────────────────────────────────────────────
    app.post('/:companyId/certificates/a1', {
        schema: {
            params: z.object({ companyId: z.string().uuid() }),
            body: z.object({ pfxBase64: z.string(), password: z.string() })
        }
    }, async (request, reply) => {
        const { companyId } = request.params as any;
        const { pfxBase64, password } = request.body as any;
        const tenantId = (request as any).tenantId;
        try {
            const pfxBuffer = Buffer.from(pfxBase64, 'base64');
            const result = await CertificateService.uploadA1Certificate(tenantId, companyId, pfxBuffer, password);
            return reply.status(201).send({ message: 'Certificado A1 importado com sucesso.', data: result });
        } catch (error: any) {
            return reply.status(400).send({ error: 'Falha ao processar certificado', details: error.message });
        }
    });

    // ── CERTIFICATE SYNC TO NUVEM FISCAL ──────────────────────────────────────
    // For cases where the cert is already in the DB but was not synced to the provider
    app.post('/:companyId/certificates/sync-nuvem-fiscal', {
        schema: {
            params: z.object({ companyId: z.string().uuid() })
        }
    }, async (request, reply) => {
        const { companyId } = request.params as any;
        const tenantId = (request as any).tenantId;
        try {
            const isNuvemFiscal =
                process.env.NUVEM_FISCAL_ENABLED === 'true' ||
                process.env.FISCAL_PROVIDER === 'nuvem_fiscal';
            if (!isNuvemFiscal) {
                return reply.status(400).send({ error: 'Nuvem Fiscal não está habilitada.' });
            }
            const cert = await CertificateService.getActiveCert(tenantId, companyId);
            const company = await prisma.company.findFirst({ where: { id: companyId, tenantId } });
            if (!company) return reply.status(404).send({ error: 'Empresa não encontrada.' });

            const cnpjClean = company.document.replace(/\D/g, '');
            const pfxBase64 = cert.pfxBuffer.toString('base64');
            const defaultAmbiente = (process.env.NUVEM_FISCAL_DEFAULT_AMBIENTE as 'homologacao' | 'producao') ?? 'homologacao';

            const { createOrUpdateCompany, uploadCertificate, configureNfeService } =
                await import('../providers/nuvemFiscal/nuvem-fiscal.bootstrap.js');

            // Step 1: Register company
            await createOrUpdateCompany({
                cpf_cnpj: cnpjClean,
                nome_razao_social: company.name,
                nome_fantasia: company.name,
                inscricao_estadual: (company as any).ie || undefined,
                email: (company as any).email || 'nfe@empresa.com.br',
                endereco: {
                    logradouro: (company as any).street || 'Rua',
                    numero: (company as any).number || 'SN',
                    bairro: (company as any).district || 'Centro',
                    codigo_municipio: String((company as any).ibgeCode || '0000000').replace(/\D/g, '').padEnd(7, '0').slice(0, 7),
                    cidade: (company as any).city || 'Cidade',
                    uf: (company as any).state || 'SP',
                    cep: ((company as any).zipCode || '00000000').replace(/\D/g, '')
                }
            });

            // Step 2: Upload certificate
            await uploadCertificate(cnpjClean, pfxBase64, cert.password);

            // Step 3: Configure NF-e service
            await configureNfeService(cnpjClean, { ambiente: defaultAmbiente });

            return reply.send({ message: 'Bootstrap Nuvem Fiscal concluído: empresa, certificado e configuração NF-e sincronizados.' });
        } catch (error: any) {
            return reply.status(500).send({ error: 'Falha ao sincronizar certificado', details: error.message });
        }
    });

    // ── EMISSION ───────────────────────────────────────────────────────────────
    app.post('/emit', {
        schema: {
            body: z.object({
                companyId: z.string().uuid(),
                orderId: z.string().uuid().optional(),
                payload: z.any()
            })
        }
    }, async (request, reply) => {
        const { companyId, orderId, payload } = request.body as any;
        const tenantId = (request as any).tenantId;
        try {
            // ── Pré-validação fiscal antes de enviar ao SEFAZ ──────────────────
            const validationErrors: string[] = [];
            
            // 1. Validar empresa emissora
            const company = await prisma.company.findFirst({ where: { id: companyId, tenantId } });
            if (!company) return reply.status(404).send({ error: 'Empresa não encontrada.' });
            
            const companyRequired: Record<string, string | null | undefined> = {
                'CRT (Regime Tributário)': company.crt,
                'Inscrição Estadual': company.ie,
                'Endereço (Logradouro)': company.street,
                'Endereço (Número)': company.number,
                'Bairro': company.district,
                'Cidade': company.city,
                'UF': company.state,
                'CEP': company.zipCode,
                'Código IBGE do Município': company.ibgeCode,
            };
            for (const [label, val] of Object.entries(companyRequired)) {
                if (!val?.trim()) validationErrors.push(`Empresa: campo "${label}" não preenchido`);
            }
            if (company.ibgeCode && !/^\d{7}$/.test(company.ibgeCode)) {
                validationErrors.push('Empresa: Código IBGE deve ter exatamente 7 dígitos numéricos');
            }
            if (company.zipCode && !/^\d{8}$/.test(company.zipCode)) {
                validationErrors.push('Empresa: CEP deve ter exatamente 8 dígitos numéricos');
            }
            
            // 2. Validar produtos do pedido
            if (orderId) {
                const order = await prisma.order.findFirst({
                    where: { id: orderId, tenantId },
                    include: { items: { include: { product: true } }, customer: true }
                });
                if (order) {
                    for (const item of order.items) {
                        const p = item.product;
                        if (!p.ncm?.trim() || !/^\d{8}$/.test(p.ncm)) {
                            validationErrors.push(`Produto "${p.name}": NCM inválido (deve ter 8 dígitos)`);
                        }
                        if (!p.cfop?.trim() || !/^\d{4}$/.test(p.cfop)) {
                            validationErrors.push(`Produto "${p.name}": CFOP inválido (deve ter 4 dígitos)`);
                        }
                        if (!p.icmsCst?.trim()) validationErrors.push(`Produto "${p.name}": CST ICMS não preenchido`);
                        if (!p.pisCst?.trim()) validationErrors.push(`Produto "${p.name}": CST PIS não preenchido`);
                        if (!p.cofinsCst?.trim()) validationErrors.push(`Produto "${p.name}": CST COFINS não preenchido`);
                    }
                    // 3. Validar destinatário
                    if (order.customer) {
                        const c = order.customer;
                        const destRequired: Record<string, string | null | undefined> = {
                            'Endereço (Logradouro)': c.street,
                            'Bairro': c.district,
                            'Cidade': c.city,
                            'UF': c.state,
                            'CEP': c.zipCode,
                            'Código IBGE': c.ibgeCode,
                        };
                        for (const [label, val] of Object.entries(destRequired)) {
                            if (!val?.trim()) validationErrors.push(`Destinatário: campo "${label}" não preenchido`);
                        }
                    }
                }
            }

            if (validationErrors.length > 0) {
                return reply.status(422).send({
                    error: 'Dados fiscais incompletos. Corrija antes de emitir a NF-e.',
                    campos: validationErrors
                });
            }
            // ──────────────────────────────────────────────────────────────────

            const result = await EmissionService.emitNfe(tenantId, companyId, payload, orderId);
            const httpStatus = result.status === 'AUTHORIZED' ? 200 : 400;
            return reply.status(httpStatus).send({
                message: result.status === 'AUTHORIZED' ? 'NF-e Autorizada' : 'NF-e Rejeitada',
                data: result
            });
        } catch (error: any) {
            return reply.status(500).send({ error: 'Falha grave na emissão de NF-e', details: error.message });
        }
    });


    // ── GET NF-e by ID ─────────────────────────────────────────────────────────
    app.get('/:id', {
        schema: { params: z.object({ id: z.string().uuid() }) }
    }, async (request, reply) => {
        const { id } = request.params as any;
        const tenantId = (request as any).tenantId;
        const invoice = await prisma.invoice.findFirst({ where: { id, tenantId } });
        if (!invoice) return reply.status(404).send({ error: 'NF-e não encontrada' });
        return reply.status(200).send(invoice);
    });

    // ── PROTOCOL ───────────────────────────────────────────────────────────────
    app.get('/:id/protocol', {
        schema: { params: z.object({ id: z.string().uuid() }) }
    }, async (request, reply) => {
        const { id } = request.params as any;
        const tenantId = (request as any).tenantId;
        const invoice = await prisma.invoice.findFirst({
            where: { id, tenantId },
            select: { protNprot: true, protDhrecbto: true, status: true, xmlAuthorized: true }
        });
        if (!invoice) return reply.status(404).send({ error: 'NF-e não encontrada' });
        return reply.status(200).send(invoice);
    });

    // ── DANFE ─────────────────────────────────────────────────────────────────
    app.get('/:id/danfe', {
        schema: { params: z.object({ id: z.string().uuid() }) }
    }, async (request, reply) => {
        const { id } = request.params as any;
        const tenantId = (request as any).tenantId;
        try {
            const { DanfeService } = await import('./services/danfe.service.js');
            const pdfBuffer = await DanfeService.generatePdf(tenantId, id);
            reply.header('Content-Type', 'application/pdf');
            reply.header('Content-Disposition', `inline; filename="danfe-${id}.pdf"`);
            return reply.send(pdfBuffer);
        } catch (error: any) {
            return reply.status(400).send({ error: error.message });
        }
    });

    // ── DOWNLOAD XML AUTORIZADO ────────────────────────────────────────────────
    app.get('/:id/xml', {
        schema: { params: z.object({ id: z.string().uuid() }) }
    }, async (request, reply) => {
        const { id } = request.params as any;
        const tenantId = (request as any).tenantId;
        try {
            const { xml, chave44 } = await NfeDownloadService.downloadXml(tenantId, id);
            reply.header('Content-Type', 'application/xml');
            reply.header('Content-Disposition', `attachment; filename="NFe_${chave44}.xml"`);
            return reply.send(xml);
        } catch (error: any) {
            return reply.status(404).send({ error: error.message });
        }
    });

    // ── CANCELAMENTO ───────────────────────────────────────────────────────────
    app.post('/:id/cancel', {
        schema: {
            params: z.object({ id: z.string().uuid() }),
            body: z.object({ justificativa: z.string().min(15).max(255) })
        }
    }, async (request, reply) => {
        const { id } = request.params as any;
        const { justificativa } = request.body as any;
        const tenantId = (request as any).tenantId;
        try {
            const result = await NfeCancelService.cancel(tenantId, id, justificativa);
            const status = result.success ? 200 : 400;
            return reply.status(status).send(result);
        } catch (error: any) {
            return reply.status(400).send({ error: error.message });
        }
    });

    // ── CARTA DE CORREÇÃO (CC-e) ───────────────────────────────────────────────
    app.post('/:id/cce', {
        schema: {
            params: z.object({ id: z.string().uuid() }),
            body: z.object({ correcao: z.string().min(15).max(1000) })
        }
    }, async (request, reply) => {
        const { id } = request.params as any;
        const { correcao } = request.body as any;
        const tenantId = (request as any).tenantId;
        try {
            const result = await NfeCceService.sendCce(tenantId, id, correcao);
            return reply.status(result.success ? 200 : 400).send(result);
        } catch (error: any) {
            return reply.status(400).send({ error: error.message });
        }
    });

    // ── INUTILIZAÇÃO ───────────────────────────────────────────────────────────
    app.post('/inutilizar', {
        schema: {
            body: z.object({
                companyId: z.string().uuid(),
                ano: z.number().int().min(2000),
                serie: z.string(),
                nNFIni: z.number().int().min(1),
                nNFFin: z.number().int().min(1),
                xJust: z.string().min(15).max(255),
                tpAmb: z.enum(['1', '2']).default('2')
            })
        }
    }, async (request, reply) => {
        const { companyId, ...params } = request.body as any;
        const tenantId = (request as any).tenantId;
        try {
            const result = await NfeInutilizacaoService.inutilizar(tenantId, companyId, params);
            return reply.status(result.success ? 200 : 400).send(result);
        } catch (error: any) {
            return reply.status(400).send({ error: error.message });
        }
    });

    // ── MANIFESTAÇÃO DO DESTINATÁRIO ───────────────────────────────────────────
    app.post('/:id/manifestar', {
        schema: {
            params: z.object({ id: z.string().uuid() }),
            body: z.object({
                tpEvento: z.enum(['210200', '210210', '210220', '210240']),
                xJust: z.string().min(15).optional()
            })
        }
    }, async (request, reply) => {
        const { id } = request.params as any;
        const { tpEvento, xJust } = request.body as any;
        const tenantId = (request as any).tenantId;
        try {
            const result = await NfeManifestacaoService.manifestar(tenantId, id, tpEvento, xJust);
            return reply.status(result.success ? 200 : 400).send(result);
        } catch (error: any) {
            return reply.status(400).send({ error: error.message });
        }
    });

    // ── STATUS SEFAZ ──────────────────────────────────────────────────────────
    app.get('/status-sefaz', {
        schema: {
            querystring: z.object({
                companyId: z.string().uuid(),
                uf: z.string().length(2).optional(),
                tpAmb: z.enum(['1', '2']).optional()
            })
        }
    }, async (request, reply) => {
        const { companyId, uf, tpAmb } = request.query as any;
        const tenantId = (request as any).tenantId;
        try {
            const result = await NfeStatusService.checkStatus(tenantId, companyId, uf, tpAmb);
            return reply.status(200).send(result);
        } catch (error: any) {
            return reply.status(400).send({ error: error.message });
        }
    });

    // ── CONTINGÊNCIA ──────────────────────────────────────────────────────────
    app.post('/contingencia/ativar', {
        schema: {
            body: z.object({
                companyId: z.string().uuid(),
                tipo: z.enum(['SVC-AN', 'SVC-RS']),
                motivo: z.string().min(15)
            })
        }
    }, async (request, reply) => {
        const { companyId, tipo, motivo } = request.body as any;
        const tenantId = (request as any).tenantId;
        try {
            const result = await NfeContingenciaService.ativarContingencia(tenantId, companyId, tipo, motivo);
            return reply.status(200).send(result);
        } catch (error: any) {
            return reply.status(400).send({ error: error.message });
        }
    });

    app.post('/contingencia/desativar', {
        schema: {
            body: z.object({ companyId: z.string().uuid() })
        }
    }, async (request, reply) => {
        const { companyId } = request.body as any;
        const tenantId = (request as any).tenantId;
        try {
            const result = await NfeContingenciaService.desativarContingencia(tenantId, companyId);
            return reply.status(200).send(result);
        } catch (error: any) {
            return reply.status(400).send({ error: error.message });
        }
    });

    // ── RETRY AUTOMÁTICO ──────────────────────────────────────────────────────
    app.post('/retry-pending', {
        schema: {
            body: z.object({ companyId: z.string().uuid().optional() })
        }
    }, async (request, reply) => {
        const { companyId } = request.body as any;
        const tenantId = (request as any).tenantId;
        try {
            const result = await NfeRetryService.retryPending(tenantId, companyId);
            return reply.status(200).send(result);
        } catch (error: any) {
            return reply.status(400).send({ error: error.message });
        }
    });
}
