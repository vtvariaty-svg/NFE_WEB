import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../../index.js';
import { z } from 'zod';

// Middleware to protect global admin routes
export const globalAdminMiddleware = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
        const userId = (request as any).user.sub; // From fastify-jwt
        const user = await prisma.user.findFirst({ where: { id: userId } });

        if (!user || user.isGlobalAdmin !== true) {
            return reply.status(403).send({ message: 'Forbidden. Global Admin only.' });
        }
        (request as any).globalAdminUser = user;
    } catch (err) {
        return reply.status(401).send({ message: 'Unauthorized' });
    }
};

export async function adminRoutes(app: FastifyInstance) {
    app.addHook('onRequest', app.authenticate);
    app.addHook('onRequest', globalAdminMiddleware);

    // List all users
    app.get('/users', async (request: FastifyRequest, reply: FastifyReply) => {
        const users = await prisma.user.findMany({
            include: { tenant: true },
            orderBy: { createdAt: 'desc' },
            take: 100
        });
        return reply.status(200).send({ data: users });
    });

    // Reset password for a specific user
    app.post('/users/:id/reset-password', {
        schema: {
            params: z.object({ id: z.string() }),
            body: z.object({ newPassword: z.string().min(6) })
        }
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        const { id } = request.params as any;
        const { newPassword } = request.body as any;

        const { hashSync } = await import('bcrypt');
        const hashedPassword = hashSync(newPassword, 10);

        await prisma.user.update({
            where: { id },
            data: { password: hashedPassword }
        });

        return reply.status(200).send({ message: 'Password reset successfully' });
    });

    // List NFe Errors
    app.get('/nfe-errors', async (request: FastifyRequest, reply: FastifyReply) => {
        const errors = await prisma.auditLog.findMany({
            where: { action: 'WEBHOOK_REJECTED' },
            include: { tenant: true },
            orderBy: { createdAt: 'desc' },
            take: 50
        });
        return reply.status(200).send({ data: errors });
    });

    // ── NFS-e Provider Management ────────────────────────────────────────────

    /**
     * POST /api/admin/nfse/seed-providers
     * Seeds the standard NFS-e providers (ABRASF, Nacional, Custom) into the database.
     * Safe to run multiple times — uses upsert so it won't create duplicates.
     */
    app.post('/nfse/seed-providers', async (request: FastifyRequest, reply: FastifyReply) => {
        const standardProviders = [
            { name: 'ABRASF v2.02 (Prefeituras parceiras)', type: 'ABRASF' },
            { name: 'Padrão Nacional NFS-e (SEFIN)', type: 'NATIONAL' },
            { name: 'Proprietário / Outros (WebISS, Ginfes, Betha)', type: 'OTHER' },
        ];

        const results = [];

        for (const provider of standardProviders) {
            // Check if it already exists
            const existing = await prisma.nfseProvider.findFirst({
                where: { type: provider.type }
            });

            if (existing) {
                results.push({ status: 'already_exists', id: existing.id, ...provider });
            } else {
                const created = await prisma.nfseProvider.create({ data: provider });
                results.push({ status: 'created', id: created.id, ...provider });
            }
        }

        return reply.status(200).send({
            message: 'NFS-e providers seeded successfully. Use the IDs below when configuring municipalities.',
            providers: results
        });
    });

    /**
     * GET /api/admin/nfse/providers
     * Lists all registered NFS-e providers.
     */
    app.get('/nfse/providers', async (request: FastifyRequest, reply: FastifyReply) => {
        const providers = await prisma.nfseProvider.findMany({
            orderBy: { createdAt: 'asc' },
            include: { _count: { select: { configs: true, invoices: true } } }
        });
        return reply.status(200).send({ providers });
    });

    /**
     * DELETE /api/admin/nfse/providers/:id
     * Deletes a provider (only if it has no linked configs or invoices).
     */
    app.delete('/nfse/providers/:id', {
        schema: { params: z.object({ id: z.string().uuid() }) }
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        const { id } = request.params as { id: string };

        const configs = await prisma.nfseMunicipalConfig.count({ where: { providerId: id } });
        const invoices = await prisma.nfseInvoice.count({ where: { providerId: id } });

        if (configs > 0 || invoices > 0) {
            return reply.status(400).send({
                error: `Não é possível deletar: existem ${configs} configuração(ões) e ${invoices} nota(s) vinculadas a este provedor.`
            });
        }

        await prisma.nfseProvider.delete({ where: { id } });
        return reply.status(200).send({ message: 'Provedor deletado com sucesso.' });
    });
}

