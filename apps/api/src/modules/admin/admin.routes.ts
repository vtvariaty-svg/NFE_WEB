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
}
