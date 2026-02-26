import { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../../index.js';

/**
 * Billing Middleware — enforces:
 * 1. Active subscription required
 * 2. Monthly invoice emission limit per plan
 * 3. Inadimplência auto-suspend after 7 days of PAST_DUE
 */
export async function checkUsageLimit(
    request: FastifyRequest,
    reply: FastifyReply
) {
    const tenantId = (request as any).tenantId;
    const now = new Date();

    // 1. Get Tenant's Subscription and Plan
    const subscription = await prisma.subscription.findFirst({
        where: { tenantId },
        include: { plan: true }
    });

    if (!subscription) {
        return reply.status(403).send({
            error: 'Nenhuma assinatura ativa encontrada. Faça upgrade do plano.'
        });
    }

    // 2. Inadimplência control — auto-suspend after 7 days of PAST_DUE
    if (subscription.status === 'PAST_DUE') {
        const pastDueDays = Math.floor(
            (now.getTime() - new Date(subscription.updatedAt).getTime()) / (1000 * 60 * 60 * 24)
        );

        if (pastDueDays >= 7) {
            // Auto-suspend tenant
            await prisma.subscription.update({
                where: { id: subscription.id },
                data: { status: 'SUSPENDED', suspendedAt: now }
            });

            await prisma.billingHistory.create({
                data: {
                    tenantId,
                    subscriptionId: subscription.id,
                    event: 'SUSPENDED',
                    metadata: JSON.stringify({ reason: `Auto-suspenso após ${pastDueDays} dias de inadimplência` })
                }
            });

            return reply.status(403).send({
                error: 'Assinatura suspensa por inadimplência. Regularize o pagamento para continuar.',
                status: 'SUSPENDED'
            });
        }

        // Still within grace period — warn but allow
        (request as any).billingWarning = `Pagamento pendente há ${pastDueDays} dias. Suspensão automática em ${7 - pastDueDays} dias.`;
    }

    // 3. Suspended = hard block
    if (subscription.status === 'SUSPENDED') {
        return reply.status(403).send({
            error: 'Assinatura suspensa. Regularize o pagamento para continuar.',
            status: 'SUSPENDED'
        });
    }

    // 4. Canceled = block new emissions
    if (subscription.status === 'CANCELED') {
        const periodEnd = new Date(subscription.currentPeriodEnd);
        if (now > periodEnd) {
            return reply.status(403).send({
                error: 'Assinatura cancelada e período expirado. Reative para continuar.',
                status: 'CANCELED'
            });
        }
        // Still within paid period, allow
    }

    // 5. Monthly emission limit check
    const { plan } = subscription;
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

    if (emissions >= plan.maxInvoices) {
        return reply.status(403).send({
            error: `Limite de emissões atingido. Seu plano ${plan.name} permite ${plan.maxInvoices}/mês. Emitidas: ${emissions}.`,
            status: 'LIMIT_EXCEEDED',
            limit: plan.maxInvoices,
            used: emissions
        });
    }

    // All OK — attach subscription and plan to request
    (request as any).subscription = subscription;
    (request as any).plan = plan;
}
