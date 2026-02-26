import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../index.js';
import tenantMiddleware from '../tenant/tenant.middleware.js';
import { CertificateService } from '../fiscal/nfe/services/certificate.service.js';

export async function certificateRoutes(app: FastifyInstance) {
    app.addHook('onRequest', app.authenticate);
    app.addHook('onRequest', tenantMiddleware);

    // ── POST /:companyId/upload — Upload novo certificado A1 ──────────────────
    app.post('/:companyId/upload', {
        schema: {
            tags: ['Certificados'],
            summary: 'Upload de certificado A1 (PFX)',
            body: z.object({
                pfxBase64: z.string(),
                password: z.string(),
                label: z.string().optional()
            })
        }
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        const { companyId } = request.params as any;
        const tenantId = (request as any).tenantId;
        const body = request.body as any;

        const company = await prisma.company.findFirst({ where: { id: companyId, tenantId } });
        if (!company) return reply.status(404).send({ error: 'Empresa não encontrada.' });

        try {
            const pfxBuffer = Buffer.from(body.pfxBase64, 'base64');
            const result = await CertificateService.uploadA1Certificate(tenantId, companyId, pfxBuffer, body.password);

            // Set label if provided
            if (body.label) {
                await prisma.certificate.update({ where: { id: result.id }, data: { label: body.label } });
            }

            return reply.status(200).send({ message: 'Certificado salvo com sucesso.', ...result });
        } catch (error: any) {
            return reply.status(400).send({ error: error.message });
        }
    });

    // ── POST /:companyId/renew — Renovação de certificado ─────────────────────
    app.post('/:companyId/renew', {
        schema: {
            tags: ['Certificados'],
            summary: 'Renovar certificado A1 (desativa o anterior)',
            body: z.object({
                pfxBase64: z.string(),
                password: z.string(),
                label: z.string().optional()
            })
        }
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        const { companyId } = request.params as any;
        const tenantId = (request as any).tenantId;
        const body = request.body as any;

        const company = await prisma.company.findFirst({ where: { id: companyId, tenantId } });
        if (!company) return reply.status(404).send({ error: 'Empresa não encontrada.' });

        try {
            const pfxBuffer = Buffer.from(body.pfxBase64, 'base64');
            const result = await CertificateService.renewCertificate(tenantId, companyId, pfxBuffer, body.password, body.label);
            return reply.status(200).send({ message: 'Certificado renovado com sucesso.', ...result });
        } catch (error: any) {
            return reply.status(400).send({ error: error.message });
        }
    });

    // ── GET /:companyId/status — Status do certificado ativo ───────────────────
    app.get('/:companyId/status', {
        schema: { tags: ['Certificados'], summary: 'Status do certificado ativo da empresa' }
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        const { companyId } = request.params as any;
        const tenantId = (request as any).tenantId;

        const cert = await prisma.certificate.findFirst({
            where: { companyId, tenantId, isActive: true }
        });

        if (!cert) return { hasCertificate: false };

        const now = new Date();
        const daysToExpiry = cert.validTo
            ? Math.floor((cert.validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
            : null;

        return {
            hasCertificate: true,
            id: cert.id,
            thumbprint: cert.thumbprint,
            label: cert.label,
            validFrom: cert.validFrom,
            validTo: cert.validTo,
            isExpired: daysToExpiry !== null && daysToExpiry < 0,
            daysToExpiry,
            expiryWarning: daysToExpiry !== null && daysToExpiry <= 30 && daysToExpiry >= 0
                ? `Certificado expira em ${daysToExpiry} dias. Renove antes do vencimento.`
                : null,
            createdAt: cert.createdAt
        };
    });

    // ── GET /:companyId/list — Todos os certificados da empresa ───────────────
    app.get('/:companyId/list', {
        schema: { tags: ['Certificados'], summary: 'Listar todos os certificados (ativos e inativos)' }
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        const { companyId } = request.params as any;
        const tenantId = (request as any).tenantId;

        const certs = await prisma.certificate.findMany({
            where: { companyId, tenantId },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true, thumbprint: true, label: true, certType: true,
                isActive: true, validFrom: true, validTo: true,
                revokedAt: true, createdAt: true
            }
        });

        return { total: certs.length, certificates: certs };
    });

    // ── POST /:certId/revoke — Revogar certificado específico ─────────────────
    app.post('/:certId/revoke', {
        schema: {
            tags: ['Certificados'],
            summary: 'Revogar (desativar) um certificado',
            params: z.object({ certId: z.string().uuid() })
        }
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        const { certId } = request.params as any;
        const tenantId = (request as any).tenantId;

        try {
            await CertificateService.revokeCertificate(tenantId, certId);
            return reply.status(200).send({ message: 'Certificado revogado com sucesso.' });
        } catch (error: any) {
            return reply.status(400).send({ error: error.message });
        }
    });

    // ── GET /:companyId/logs — Log de uso do certificado ──────────────────────
    app.get('/:companyId/logs', {
        schema: { tags: ['Certificados'], summary: 'Histórico de uso dos certificados da empresa' }
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        const { companyId } = request.params as any;
        const tenantId = (request as any).tenantId;

        // Get all cert IDs for this company
        const certs = await prisma.certificate.findMany({
            where: { companyId, tenantId },
            select: { id: true }
        });
        const certIds = certs.map(c => c.id);

        if (certIds.length === 0) return { logs: [] };

        const logs = await prisma.certificateLog.findMany({
            where: { certificateId: { in: certIds } },
            orderBy: { createdAt: 'desc' },
            take: 200
        });

        return { total: logs.length, logs };
    });
}
