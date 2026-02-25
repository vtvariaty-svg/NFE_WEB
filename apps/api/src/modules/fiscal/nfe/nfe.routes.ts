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
