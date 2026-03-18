import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../index.js';
import { verifyApiKey } from './api-key.middleware.js';
import { CertificateService } from '../fiscal/nfe/services/certificate.service.js';

const uploadBodySchema = z.object({
    pfxBase64: z.string().min(1),
    password: z.string().min(1),
    label: z.string().optional()
});

export async function externalCertificateRoutes(app: FastifyInstance) {
    app.addHook('onRequest', verifyApiKey);

    // POST /v1/external/certificates/:companyId/upload
    app.post('/:companyId/upload', {
        schema: {
            tags: ['External - Certificados'],
            summary: 'Upload de certificado A1 via M2M',
            body: uploadBodySchema
        }
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        const { companyId } = request.params as any;
        const tenantId = (request as any).tenantId;
        const body = request.body as z.infer<typeof uploadBodySchema>;

        const company = await prisma.company.findFirst({ where: { id: companyId, tenantId } });
        if (!company) return reply.status(404).send({ error: 'Empresa não encontrada.' });

        try {
            const pfxBuffer = Buffer.from(body.pfxBase64, 'base64');
            const result = await CertificateService.uploadA1Certificate(
                tenantId, companyId, pfxBuffer, body.password
            );

            if (body.label) {
                await prisma.certificate.update({
                    where: { id: result.id },
                    data: { label: body.label }
                });
            }

            request.log.info({
                module: 'fiscal_cert',
                tenantId,
                companyId,
                certId: result.id,
                thumbprint: result.thumbprint,
                msg: 'Certificado enviado via M2M'
            });

            return reply.status(200).send({
                message: 'Certificado instalado com sucesso.',
                id: result.id,
                thumbprint: result.thumbprint,
                validFrom: result.validFrom,
                validTo: result.validTo,
                label: body.label ?? null
            });
        } catch (error: any) {
            request.log.warn({ module: 'fiscal_cert', tenantId, companyId, error: error.message, msg: 'Falha no upload de certificado M2M' });
            return reply.status(400).send({ error: error.message });
        }
    });

    // GET /v1/external/certificates/:companyId/status
    app.get('/:companyId/status', {
        schema: {
            tags: ['External - Certificados'],
            summary: 'Status do certificado ativo via M2M'
        }
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        const { companyId } = request.params as any;
        const tenantId = (request as any).tenantId;

        const cert = await prisma.certificate.findFirst({
            where: { companyId, tenantId, isActive: true }
        });

        if (!cert) return reply.status(200).send({ hasCertificate: false });

        const now = new Date();
        const daysToExpiry = cert.validTo
            ? Math.floor((cert.validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
            : null;

        return reply.status(200).send({
            hasCertificate: true,
            id: cert.id,
            thumbprint: cert.thumbprint,
            label: cert.label,
            validFrom: cert.validFrom,
            validTo: cert.validTo,
            isExpired: daysToExpiry !== null && daysToExpiry < 0,
            daysToExpiry,
            expiryWarning: daysToExpiry !== null && daysToExpiry <= 30 && daysToExpiry >= 0
                ? `Certificado expira em ${daysToExpiry} dias.`
                : null,
            createdAt: cert.createdAt
        });
    });
}
