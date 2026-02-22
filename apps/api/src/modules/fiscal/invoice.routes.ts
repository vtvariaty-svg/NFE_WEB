import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../index.js';
import tenantMiddleware from '../tenant/tenant.middleware.js';
import { getFiscalProvider } from './fiscal.provider.js';

import { checkUsageLimit } from '../billing/billing.middleware.js';

export async function invoiceRoutes(app: FastifyInstance) {
    app.addHook('onRequest', app.authenticate);
    app.addHook('onRequest', tenantMiddleware);

    app.post('/:orderId/issue', {
        schema: {
            params: z.object({ orderId: z.string() }),
            body: z.object({ type: z.enum(['NFE', 'NFSE']) })
        },
        preHandler: [checkUsageLimit]
    }, async (request, reply) => {
        const { orderId } = request.params as any;
        const { type } = request.body as any;
        const tenantId = (request as any).tenantId;

        const order = await prisma.order.findFirst({ where: { id: orderId, tenantId } });
        if (!order) return reply.status(404).send({ message: 'Order not found' });

        // Instanciate our Fiscal Provider for this tenant
        const provider = getFiscalProvider(tenantId);

        // Abstract Payload Building... In a real system, map DB data to NFe layout
        const payload = {
            orderId: order.id,
            total: order.total,
            type
        };

        // Attempt Issue
        const providerResult = await provider.issue(payload);

        // Save state locally
        const invoice = await prisma.invoice.create({
            data: {
                type,
                status: providerResult.status,
                orderId: order.id,
                tenantId
            }
        });

        if (providerResult.status === 'AUTHORIZED') {
            // Increment Usage
            const now = new Date();
            await prisma.usageCounter.upsert({
                where: {
                    tenantId_month_year: {
                        tenantId,
                        month: now.getMonth() + 1,
                        year: now.getFullYear()
                    }
                },
                update: { emissions: { increment: 1 } },
                create: {
                    tenantId,
                    month: now.getMonth() + 1,
                    year: now.getFullYear(),
                    emissions: 1
                }
            });
        }

        return reply.status(201).send(invoice);
    });

    app.get('/', async (request, reply) => {
        const tenantId = (request as any).tenantId;
        const invoices = await prisma.invoice.findMany({ where: { tenantId } });
        return { data: invoices };
    });

    app.post('/:invoiceId/cancel', {
        schema: {
            params: z.object({ invoiceId: z.string() }),
            body: z.object({ reason: z.string() })
        }
    }, async (request, reply) => {
        const { invoiceId } = request.params as any;
        const { reason } = request.body as any;
        const tenantId = (request as any).tenantId;

        const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, tenantId } });
        if (!invoice) return reply.status(404).send();

        const provider = getFiscalProvider(tenantId);
        const success = await provider.cancel(invoiceId, reason);

        if (success) {
            await prisma.invoice.update({
                where: { id: invoice.id },
                data: { status: 'CANCELED' }
            });
            return { message: 'Invoice canceled' };
        }

        return reply.status(400).send({ message: 'Failed to cancel invoice' });
    });
}
