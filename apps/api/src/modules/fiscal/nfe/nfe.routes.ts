import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CertificateService } from './services/certificate.service.js';
import { EmissionService } from './services/emission.service.js';
import tenantMiddleware from '../../tenant/tenant.middleware.js';
import { prisma } from '../../../index.js';

export async function nfeRoutes(app: FastifyInstance) {
    // Both endpoints inside this module demand Auth and Tenant middleware
    app.addHook('onRequest', app.authenticate);
    app.addHook('onRequest', tenantMiddleware);

    // ==========================================
    // CERTIFICATE MANAGEMENT (A1)
    // ==========================================
    app.post('/:companyId/certificates/a1', {
        schema: {
            params: z.object({
                companyId: z.string().uuid()
            }),
            body: z.object({
                pfxBase64: z.string(),
                password: z.string()
            })
        }
    }, async (request, reply) => {
        const { companyId } = request.params as any;
        const { pfxBase64, password } = request.body as any;
        const tenantId = (request as any).tenantId;

        try {
            const pfxBuffer = Buffer.from(pfxBase64, 'base64');
            const result = await CertificateService.uploadA1Certificate(tenantId, companyId, pfxBuffer, password);

            return reply.status(201).send({
                message: 'Certificado A1 importado com sucesso.',
                data: result
            });
        } catch (error: any) {
            app.log.error(error);
            return reply.status(400).send({
                error: 'Falha ao processar certificado',
                details: error.message
            });
        }
    });

    // ==========================================
    // EMISSION (NF-e)
    // ==========================================
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
            app.log.error(error);
            return reply.status(500).send({
                error: 'Falha grave na emissão de NF-e',
                details: error.message
            });
        }
    });

    // ==========================================
    // QUERIES & MANAGEMENT
    // ==========================================
    app.get('/:id', {
        schema: {
            params: z.object({ id: z.string().uuid() })
        }
    }, async (request, reply) => {
        const { id } = request.params as any;
        const tenantId = (request as any).tenantId;

        const invoice = await prisma.invoice.findFirst({
            where: { id, tenantId }
        });

        if (!invoice) return reply.status(404).send({ error: 'NF-e não encontrada' });
        return reply.status(200).send(invoice);
    });

    app.get('/:id/protocol', {
        schema: {
            params: z.object({ id: z.string().uuid() })
        }
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

    app.get('/:id/danfe', {
        schema: {
            params: z.object({ id: z.string().uuid() })
        }
    }, async (request, reply) => {
        const { id } = request.params as any;
        const tenantId = (request as any).tenantId;

        try {
            const { DanfeService } = await import('./services/danfe.service.js');
            const pdfBuffer = await DanfeService.generatePdf(tenantId, id);

            reply.header('Content-Type', 'application/pdf'); // Fake PDF or text/plain depending on implementation
            reply.header('Content-Disposition', `inline; filename="danfe-${id}.pdf"`);
            return reply.send(pdfBuffer);
        } catch (error: any) {
            return reply.status(400).send({ error: error.message });
        }
    });

    app.post('/:id/cancel', {
        schema: {
            params: z.object({ id: z.string().uuid() }),
            body: z.object({ justificativa: z.string().min(15) })
        }
    }, async (request, reply) => {
        // TODO: Implement Event sending with xml-crypto and NfeRecepcaoEvento4
        return reply.status(501).send({ error: 'Cancelamento não implementado na base.' });
    });

    app.post('/:id/cce', {
        schema: {
            params: z.object({ id: z.string().uuid() }),
            body: z.object({ correcao: z.string().min(15) })
        }
    }, async (request, reply) => {
        return reply.status(501).send({ error: 'Carta de Correção não implementada na base.' });
    });
}
