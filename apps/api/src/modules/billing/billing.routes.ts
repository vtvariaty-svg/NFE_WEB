import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../index.js';
import tenantMiddleware from '../tenant/tenant.middleware.js';

export async function billingRoutes(app: FastifyInstance) {
    app.addHook('onRequest', app.authenticate);

    // ── GET /billing/plans — public catalog (JWT only, no tenant scope) ────────
    app.get('/plans', async (request, reply) => {
        const plans = await prisma.plan.findMany({
            where: { isActive: true },
            orderBy: { price: 'asc' },
            select: { id: true, name: true, planName: true, price: true, maxInvoices: true, maxIntegrations: true, description: true }
        });
        return reply.status(200).send({ data: plans });
    });

    // ── GET /billing/status — subscription + usage ────────────────────────────
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

        // Check inadimplência
        const isOverdue = subscription?.status === 'PAST_DUE';
        const isSuspended = subscription?.status === 'SUSPENDED';
        const periodExpired = subscription?.currentPeriodEnd
            ? new Date(subscription.currentPeriodEnd) < now
            : false;

        return {
            subscription,
            usage: usage?.emissions || 0,
            alerts: {
                isOverdue,
                isSuspended,
                periodExpired,
                message: isSuspended ? 'Sua assinatura está suspensa por inadimplência. Regularize o pagamento.'
                    : isOverdue ? 'Pagamento pendente. Regularize para evitar suspensão.'
                        : periodExpired ? 'Período de assinatura expirado.'
                            : null
            }
        };
    });

    // ── GET /billing/history — full billing event log ──────────────────────────
    app.get('/history', {
        onRequest: [tenantMiddleware],
        schema: { tags: ['Billing'], summary: 'Histórico completo de cobranças e eventos' }
    }, async (request, reply) => {
        const tenantId = (request as any).tenantId;

        const subscription = await prisma.subscription.findFirst({ where: { tenantId } });
        if (!subscription) return reply.status(404).send({ error: 'Nenhuma assinatura encontrada.' });

        const history = await prisma.billingHistory.findMany({
            where: { subscriptionId: subscription.id },
            orderBy: { createdAt: 'desc' },
            take: 100
        });

        return { history };
    });

    // ── POST /billing/upgrade — upgrade de plano ──────────────────────────────
    app.post('/upgrade', {
        onRequest: [tenantMiddleware],
        schema: {
            tags: ['Billing'],
            summary: 'Upgrade de plano',
            body: z.object({ newPlanId: z.string().uuid() })
        }
    }, async (request, reply) => {
        const tenantId = (request as any).tenantId;
        const { newPlanId } = request.body as { newPlanId: string };

        const subscription = await prisma.subscription.findFirst({
            where: { tenantId },
            include: { plan: true }
        });

        if (!subscription) return reply.status(404).send({ error: 'Assinatura não encontrada.' });

        const newPlan = await prisma.plan.findFirst({ where: { id: newPlanId } });
        if (!newPlan) return reply.status(404).send({ error: 'Plano não encontrado.' });

        if (newPlan.price <= subscription.plan.price) {
            return reply.status(400).send({ error: 'Para downgrade use o endpoint /billing/downgrade.' });
        }

        const oldPlanId = subscription.planId;

        // Update subscription
        await prisma.subscription.update({
            where: { id: subscription.id },
            data: { planId: newPlanId, status: 'ACTIVE', canceledAt: null, suspendedAt: null }
        });

        // Log history
        await prisma.billingHistory.create({
            data: {
                tenantId,
                subscriptionId: subscription.id,
                event: 'UPGRADED',
                fromPlanId: oldPlanId,
                toPlanId: newPlanId,
                amount: newPlan.price,
                metadata: JSON.stringify({ from: subscription.plan.name, to: newPlan.name })
            }
        });

        // If Stripe subscription exists, update it
        if (subscription.stripeSubscriptionId && process.env.STRIPE_SECRET_KEY) {
            try {
                const Stripe = require('stripe');
                const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
                const stripeSub = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId);
                await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
                    items: [{
                        id: stripeSub.items.data[0].id, price_data: {
                            currency: 'brl',
                            product: stripeSub.items.data[0].price.product,
                            unit_amount: Math.round(newPlan.price * 100),
                            recurring: { interval: 'month' }
                        }
                    }],
                    proration_behavior: 'create_prorations'
                });
            } catch (err: any) {
                console.error('Stripe upgrade error:', err.message);
            }
        }

        return { success: true, message: `Upgrade para ${newPlan.name} realizado.`, newPlan };
    });

    // ── POST /billing/downgrade — downgrade de plano ──────────────────────────
    app.post('/downgrade', {
        onRequest: [tenantMiddleware],
        schema: {
            tags: ['Billing'],
            summary: 'Downgrade de plano (aplica no próximo ciclo)',
            body: z.object({ newPlanId: z.string().uuid() })
        }
    }, async (request, reply) => {
        const tenantId = (request as any).tenantId;
        const { newPlanId } = request.body as { newPlanId: string };

        const subscription = await prisma.subscription.findFirst({
            where: { tenantId },
            include: { plan: true }
        });
        if (!subscription) return reply.status(404).send({ error: 'Assinatura não encontrada.' });

        const newPlan = await prisma.plan.findFirst({ where: { id: newPlanId } });
        if (!newPlan) return reply.status(404).send({ error: 'Plano não encontrado.' });

        if (newPlan.price >= subscription.plan.price) {
            return reply.status(400).send({ error: 'Para upgrade use o endpoint /billing/upgrade.' });
        }

        const oldPlanId = subscription.planId;

        // Schedule downgrade at end of current period
        await prisma.subscription.update({
            where: { id: subscription.id },
            data: { planId: newPlanId }
        });

        await prisma.billingHistory.create({
            data: {
                tenantId,
                subscriptionId: subscription.id,
                event: 'DOWNGRADED',
                fromPlanId: oldPlanId,
                toPlanId: newPlanId,
                amount: newPlan.price,
                metadata: JSON.stringify({ from: subscription.plan.name, to: newPlan.name, appliesAt: subscription.currentPeriodEnd })
            }
        });

        return { success: true, message: `Downgrade para ${newPlan.name} agendado para o próximo ciclo.`, newPlan };
    });

    // ── POST /billing/cancel — cancelamento com grace period ──────────────────
    app.post('/cancel', {
        onRequest: [tenantMiddleware],
        schema: {
            tags: ['Billing'],
            summary: 'Cancelar assinatura (fica ativa até fim do período)',
            body: z.object({ reason: z.string().optional() })
        }
    }, async (request, reply) => {
        const tenantId = (request as any).tenantId;
        const { reason } = request.body as { reason?: string };

        const subscription = await prisma.subscription.findFirst({ where: { tenantId } });
        if (!subscription) return reply.status(404).send({ error: 'Assinatura não encontrada.' });

        await prisma.subscription.update({
            where: { id: subscription.id },
            data: { status: 'CANCELED', canceledAt: new Date() }
        });

        await prisma.billingHistory.create({
            data: {
                tenantId,
                subscriptionId: subscription.id,
                event: 'CANCELED',
                metadata: JSON.stringify({ reason: reason || 'Cancelado pelo usuário' })
            }
        });

        // Cancel on Stripe
        if (subscription.stripeSubscriptionId && process.env.STRIPE_SECRET_KEY) {
            try {
                const Stripe = require('stripe');
                const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
                await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
                    cancel_at_period_end: true
                });
            } catch (err: any) {
                console.error('Stripe cancel error:', err.message);
            }
        }

        return { success: true, message: 'Assinatura cancelada. Continuará ativa até o fim do período pago.' };
    });

    // ── POST /billing/reactivate — reativar assinatura cancelada ──────────────
    app.post('/reactivate', {
        onRequest: [tenantMiddleware],
        schema: { tags: ['Billing'], summary: 'Reativar assinatura cancelada' }
    }, async (request, reply) => {
        const tenantId = (request as any).tenantId;

        const subscription = await prisma.subscription.findFirst({ where: { tenantId } });
        if (!subscription) return reply.status(404).send({ error: 'Assinatura não encontrada.' });
        if (subscription.status === 'ACTIVE') return reply.status(400).send({ error: 'Assinatura já está ativa.' });

        await prisma.subscription.update({
            where: { id: subscription.id },
            data: { status: 'ACTIVE', canceledAt: null, suspendedAt: null }
        });

        await prisma.billingHistory.create({
            data: {
                tenantId,
                subscriptionId: subscription.id,
                event: 'REACTIVATED'
            }
        });

        return { success: true, message: 'Assinatura reativada com sucesso.' };
    });

    // ── Webhook Stripe completo ───────────────────────────────────────────────
    app.post('/webhook', async (request, reply) => {
        const event = request.body as any;
        const type: string = event?.type || '';
        const data = event?.data?.object || {};

        const tenantId: string = data?.client_reference_id || data?.metadata?.tenantId || '';

        try {
            switch (type) {
                // ── Checkout completed → Ativa plano ──────────────────────────
                case 'checkout.session.completed': {
                    const planId = data.metadata?.planId;
                    if (tenantId) {
                        await prisma.subscription.upsert({
                            where: { tenantId },
                            update: {
                                status: 'ACTIVE',
                                planId: planId || undefined,
                                stripeCustomerId: data.customer,
                                stripeSubscriptionId: data.subscription,
                                canceledAt: null,
                                suspendedAt: null
                            },
                            create: {
                                tenantId,
                                planId: planId || 'default',
                                status: 'ACTIVE',
                                stripeCustomerId: data.customer,
                                stripeSubscriptionId: data.subscription,
                                currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
                            }
                        });
                        await logBillingEvent(tenantId, 'ACTIVATED', data.amount_total ? data.amount_total / 100 : undefined, event.id);
                    }
                    break;
                }

                // ── Invoice paid → Renova período ──────────────────────────────
                case 'invoice.paid': {
                    const subId = data.subscription;
                    if (subId) {
                        const sub = await prisma.subscription.findFirst({ where: { stripeSubscriptionId: subId } });
                        if (sub) {
                            await prisma.subscription.update({
                                where: { id: sub.id },
                                data: {
                                    status: 'ACTIVE',
                                    currentPeriodStart: new Date(),
                                    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                                    suspendedAt: null
                                }
                            });
                            await logBillingEvent(sub.tenantId, 'PAYMENT_SUCCEEDED', data.amount_paid ? data.amount_paid / 100 : undefined, event.id);
                        }
                    }
                    break;
                }

                // ── Payment failed → Marca inadimplência ─────────────────────
                case 'invoice.payment_failed': {
                    const subId = data.subscription;
                    if (subId) {
                        const sub = await prisma.subscription.findFirst({ where: { stripeSubscriptionId: subId } });
                        if (sub) {
                            await prisma.subscription.update({
                                where: { id: sub.id },
                                data: { status: 'PAST_DUE' }
                            });
                            await logBillingEvent(sub.tenantId, 'PAYMENT_FAILED', data.amount_due ? data.amount_due / 100 : undefined, event.id);
                        }
                    }
                    break;
                }

                // ── Subscription deleted → Cancela definitivo ─────────────────
                case 'customer.subscription.deleted': {
                    const subId = data.id;
                    if (subId) {
                        const sub = await prisma.subscription.findFirst({ where: { stripeSubscriptionId: subId } });
                        if (sub) {
                            await prisma.subscription.update({
                                where: { id: sub.id },
                                data: { status: 'CANCELED', canceledAt: new Date() }
                            });
                            await logBillingEvent(sub.tenantId, 'CANCELED', undefined, event.id);
                        }
                    }
                    break;
                }

                // ── Subscription updated (plan change from Stripe) ────────────
                case 'customer.subscription.updated': {
                    const subId = data.id;
                    if (subId) {
                        const sub = await prisma.subscription.findFirst({ where: { stripeSubscriptionId: subId } });
                        if (sub) {
                            const newStatus = data.cancel_at_period_end ? 'CANCELED' : (data.status === 'past_due' ? 'PAST_DUE' : 'ACTIVE');
                            await prisma.subscription.update({
                                where: { id: sub.id },
                                data: { status: newStatus }
                            });
                        }
                    }
                    break;
                }

                default:
                    // Ignore unhandled event types gracefully
                    break;
            }
        } catch (err: any) {
            console.error(`Billing webhook error [${type}]:`, err.message);
        }

        return reply.status(200).send({ received: true });
    });
}

// ── Helper: log billing history ────────────────────────────────────────────────
async function logBillingEvent(tenantId: string, eventType: string, amount?: number, stripeEventId?: string) {
    const sub = await prisma.subscription.findFirst({ where: { tenantId } });
    if (!sub) return;

    // Deduplicate by stripeEventId
    if (stripeEventId) {
        const existing = await prisma.billingHistory.findFirst({ where: { stripeEventId } });
        if (existing) return;
    }

    await prisma.billingHistory.create({
        data: {
            tenantId,
            subscriptionId: sub.id,
            event: eventType,
            amount,
            stripeEventId
        }
    });
}
