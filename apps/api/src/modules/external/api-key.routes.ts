import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import crypto from 'crypto';
import { prisma } from '../../index.js';
import tenantMiddleware from '../tenant/tenant.middleware.js';

export async function apiKeyRoutes(app: FastifyInstance) {
    app.addHook('onRequest', app.authenticate);
    app.addHook('onRequest', tenantMiddleware);

    // List tenant's keys
    app.get('/', async (request, reply) => {
        const tenantId = (request as any).tenantId;
        const keys = await prisma.apiKey.findMany({
            where: { tenantId },
            select: { id: true, name: true, prefix: true, hint: true, isActive: true, createdAt: true, lastUsedAt: true, expiresAt: true, revokedAt: true },
            orderBy: { createdAt: 'desc' }
        });
        return { data: keys };
    });

    // Create a new key
    app.post('/', {
        schema: {
            body: z.object({
                name: z.string().min(3).max(50),
                scopes: z.array(z.string()).optional()
            })
        }
    }, async (request, reply) => {
        const tenantId = (request as any).tenantId;
        const { name, scopes } = request.body as any;

        // Generate a 32-byte secure random key
        const randomHex = crypto.randomBytes(32).toString('hex');
        const rawToken = `sk_live_${randomHex}`;
        
        // Hash it for DB storage
        const keyHash = crypto.createHash('sha256').update(rawToken).digest('hex');
        
        const prefix = rawToken.substring(0, 12); // "sk_live_xxxx"
        const hint = rawToken.slice(-4); // last 4 chars

        const apiKey = await prisma.apiKey.create({
            data: {
                tenantId,
                name,
                prefix,
                hint,
                keyHash,
                scopes: scopes || ['*']
            }
        });

        // Audit Trail
        await prisma.auditLog.create({
            data: { tenantId, action: 'API_KEY_CREATED', metadata: JSON.stringify({ name, id: apiKey.id }) }
        });

        return reply.status(201).send({
            id: apiKey.id,
            name: apiKey.name,
            token: rawToken, // THE ONLY TIME THE RAW TOKEN IS EVER RETURNED
            message: 'Guarde esta chave. Ela não será exibida novamente.'
        });
    });

    // Revoke a key
    app.post('/:id/revoke', {
        schema: { params: z.object({ id: z.string().uuid() }) }
    }, async (request, reply) => {
        const tenantId = (request as any).tenantId;
        const { id } = request.params as any;

        const apiKey = await prisma.apiKey.findFirst({ where: { id, tenantId } });
        if (!apiKey) return reply.status(404).send({ error: 'Key not found' });

        await prisma.apiKey.update({
            where: { id },
            data: { isActive: false, revokedAt: new Date() }
        });

        // Audit Trail
        await prisma.auditLog.create({
            data: { tenantId, action: 'API_KEY_REVOKED', metadata: JSON.stringify({ id }) }
        });

        return { message: 'API Key revogada com sucesso.' };
    });
}
