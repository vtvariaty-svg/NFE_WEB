import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../index.js';
import tenantMiddleware from '../tenant/tenant.middleware.js';
import { getConnector } from './connector.js';

export async function integrationRoutes(app: FastifyInstance) {
    app.addHook('onRequest', app.authenticate);
    app.addHook('onRequest', tenantMiddleware);

    app.post('/accounts', {
        schema: {
            body: z.object({ provider: z.string(), token: z.string() })
        }
    }, async (request, reply) => {
        const { provider, token } = request.body as any;
        const tenantId = (request as any).tenantId;

        const account = await prisma.integrationAccount.create({
            data: { provider, token, tenantId }
        });

        return reply.status(201).send(account);
    });

    app.get('/accounts', async (request, reply) => {
        const tenantId = (request as any).tenantId;
        const accounts = await prisma.integrationAccount.findMany({ where: { tenantId } });
        return { data: accounts };
    });

    app.post('/sync/:accountId', async (request, reply) => {
        const { accountId } = request.params as any;
        const tenantId = (request as any).tenantId;

        const account = await prisma.integrationAccount.findFirst({
            where: { id: accountId, tenantId }
        });

        if (!account) return reply.status(404).send({ message: 'Account not found' });

        const connector = getConnector(account.provider);
        const rawOrders = await connector.syncOrders(tenantId, account.id);

        // In a real system, we'd map these to our Order format and save to DB
        // For MVP, we just return the raw payload as simulation
        return { synced: rawOrders.length, rawOrders };
    });
}
