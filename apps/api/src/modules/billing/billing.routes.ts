import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../index.js';
import tenantMiddleware from '../tenant/tenant.middleware.js';

export async function billingRoutes(app: FastifyInstance) {
    app.addHook('onRequest', app.authenticate);
    // Do NOT add tenantMiddleware hook globally here because webhook doesn't have it

    app.get('/status', {
        onRequest: [tenantMiddleware]
    }, async (request, reply) => {
        const tenantId = (request as any).tenantId;

        const subscription = await prisma.subscription.findFirst({
            where: { tenantId },
            include: { plan: true }
        });

        const now = new Date();
        const usage = await prisma.usageCounter.findUnique({
            where: {
                tenantId_month_year: {
                    tenantId,
                    month: now.getMonth() + 1,
                    year: now.getFullYear()
                }
            }
        });

        return {
            subscription,
            usage: usage?.emissions || 0
        };
    });

    app.post('/webhook', async (request, reply) => {
        // Note: In real Stripe webhook, you verify signature here.
        const { type, data } = request.body as any;

        if (type === 'checkout.session.completed') {
            const tenantId = data.metadata.tenantId;
            const planId = data.metadata.planId;

            await prisma.subscription.upsert({
                where: { tenantId },
                update: { status: 'ACTIVE', planId },
                create: {
                    tenantId,
                    planId,
                    status: 'ACTIVE',
                    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
                }
            });
            return { received: true };
        }

        if (type === 'invoice.payment_failed') {
            const tenantId = data.metadata.tenantId;
            await prisma.subscription.update({
                where: { tenantId },
                data: { status: 'PAST_DUE' }
            });
            return { received: true };
        }

        return reply.status(400).send({ message: 'Unhandled event type' });
    });
}
