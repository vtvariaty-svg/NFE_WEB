import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../index.js';
import crypto from 'crypto';
import tenantMiddleware from '../tenant/tenant.middleware.js';

// Must be 32 chars for AES-256
const ENCRYPTION_KEY = process.env.CERTIFICATE_ENCRYPTION_KEY || '12345678901234567890123456789012';

function encrypt(text: string) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text: string) {
    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift()!, 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}

export async function certificateRoutes(app: FastifyInstance) {
    app.addHook('onRequest', app.authenticate);
    app.addHook('onRequest', tenantMiddleware);

    // Endpoint intended to receive the Base64 of the .pfx file and the plain password
    app.post('/:companyId/upload', {
        schema: {
            body: z.object({
                pfxBase64: z.string(),
                password: z.string(),
                expiresAt: z.string().optional()
            })
        }
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        const { companyId } = request.params as any;
        const tenantId = (request as any).tenantId;
        const body = request.body as any;

        // Ensure company belongs to tenant
        const company = await prisma.company.findFirst({ where: { id: companyId, tenantId } });
        if (!company) return reply.status(404).send({ message: "Empresa não encontrada" });

        // Encrypt the password before saving!
        const encryptedPassword = encrypt(body.password);

        try {
            const cert = await prisma.certificate.upsert({
                where: { companyId },
                update: {
                    pfxBase64: body.pfxBase64,
                    password: encryptedPassword,
                    expiresAt: body.expiresAt ? new Date(body.expiresAt) : null
                },
                create: {
                    companyId,
                    pfxBase64: body.pfxBase64,
                    password: encryptedPassword,
                    expiresAt: body.expiresAt ? new Date(body.expiresAt) : null
                }
            });

            return reply.status(200).send({ message: "Certificado salvo com sucesso", id: cert.id });
        } catch (error) {
            console.error(error);
            return reply.status(500).send({ message: "Erro ao salvar certificado" });
        }
    });

    app.get('/:companyId/status', async (request: FastifyRequest, reply: FastifyReply) => {
        const { companyId } = request.params as any;
        const tenantId = (request as any).tenantId;

        const company = await prisma.company.findFirst({
            where: { id: companyId, tenantId },
            include: { certificate: true }
        });

        if (!company) return reply.status(404).send({ message: "Empresa não encontrada" });

        if (!company.certificate) return { hasCertificate: false };

        return {
            hasCertificate: true,
            expiresAt: company.certificate.expiresAt,
            createdAt: company.certificate.createdAt
        };
    });
}
