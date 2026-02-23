import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../index.js';
import tenantMiddleware from '../tenant/tenant.middleware.js';
import { CertificateService } from '../fiscal/nfe/services/certificate.service.js';

export async function certificateRoutes(app: FastifyInstance) {
    app.addHook('onRequest', app.authenticate);
    app.addHook('onRequest', tenantMiddleware);

    // Endpoint intended to receive the Base64 of the .pfx file and the plain password
    app.post('/:companyId/upload', {
        schema: {
            body: z.object({
                pfxBase64: z.string(),
                password: z.string(),
                expiresAt: z.string().optional() // kept for backward compat if frontend still sends it
            })
        }
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        const { companyId } = request.params as any;
        const tenantId = (request as any).tenantId;
        const body = request.body as any;

        // Ensure company belongs to tenant
        const company = await prisma.company.findFirst({ where: { id: companyId, tenantId } });
        if (!company) return reply.status(404).send({ message: "Empresa não encontrada" });

        try {
            const pfxBuffer = Buffer.from(body.pfxBase64, 'base64');
            const result = await CertificateService.uploadA1Certificate(tenantId, companyId, pfxBuffer, body.password);

            return reply.status(200).send({ message: "Certificado salvo com sucesso", id: result.id });
        } catch (error: any) {
            console.error(error);
            return reply.status(500).send({ message: "Erro ao salvar certificado", details: error.message });
        }
    });

    app.get('/:companyId/status', async (request: FastifyRequest, reply: FastifyReply) => {
        const { companyId } = request.params as any;
        const tenantId = (request as any).tenantId;

        const cert = await prisma.certificate.findFirst({
            where: { companyId, tenantId, isActive: true }
        });

        if (!cert) return { hasCertificate: false };

        return {
            hasCertificate: true,
            expiresAt: cert.validTo,
            createdAt: cert.createdAt
        };
    });
}
