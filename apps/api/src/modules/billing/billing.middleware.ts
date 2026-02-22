import { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../../index.js';

export async function checkUsageLimit(
    request: FastifyRequest,
    reply: FastifyReply
) {
    const tenantId = (request as any).tenantId;
    const now = new Date();

    // 1. Get Tenant's Active Subscription and Plan
    const subscription = await prisma.subscription.findFirst({
        where: { tenantId, status: 'ACTIVE' },
        include: { plan: true }
    });

    if (!subscription) {
        return reply.status(403).send({ message: 'No active subscription found. Please upgrade your plan.' });
    }

    const { plan } = subscription;

    // 2. Get current month's usage
    const usage = await prisma.usageCounter.findUnique({
        where: {
            tenantId_month_year: {
                tenantId,
                month: now.getMonth() + 1,
                year: now.getFullYear()
            }
        }
    });

    const emissions = usage?.emissions || 0;

    // 3. Check limit
    if (emissions >= plan.maxInvoices) {
        return reply.status(403).send({
            message: `Usage limit exceeded. Your plan allows ${plan.maxInvoices} invoices per month. You have issued ${emissions}.`
        });
    }

    // Check passed, attach subscription to request if needed down the line
    (request as any).subscription = subscription;
}
