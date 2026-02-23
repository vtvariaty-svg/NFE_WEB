import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../index.js';
import tenantMiddleware from '../tenant/tenant.middleware.js';

// IMPORTANT: Requires the STRIPE_SECRET_KEY in apps/api/.env
const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_mock', { apiVersion: '2023-10-16' });

export async function checkoutRoutes(app: FastifyInstance) {
    // Webhook route must NOT have authentication hooks
    app.post('/webhook', async (request: FastifyRequest, reply: FastifyReply) => {
        const sig = request.headers['stripe-signature'];
        const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_mock';

        let event;
        try {
            // Focus on basic mocking if we don't have real keys
            if (process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY !== 'sk_test_mock') {
                event = stripe.webhooks.constructEvent((request as any).rawBody, sig, endpointSecret);
            } else {
                // Mock payload for testing
                event = request.body as any;
            }
        } catch (err: any) {
            return reply.status(400).send(`Webhook Error: ${err.message}`);
        }

        if (event.type === 'checkout.session.completed') {
            const session = event.data.object;
            const tenantId = session.client_reference_id;
            const stripeCustomerId = session.customer;
            const stripeSubscriptionId = session.subscription;

            if (tenantId) {
                await prisma.subscription.update({
                    where: { tenantId },
                    data: {
                        status: 'ACTIVE',
                        stripeCustomerId,
                        stripeSubscriptionId,
                        // Simplification for the webhook demo
                    }
                });
            }
        }

        return reply.status(200).send({ received: true });
    });

    // Apply hooks ONLY for the routes defined below this line
    app.register(async function authenticatedRoutes(childApp) {
        childApp.addHook('onRequest', childApp.authenticate);
        childApp.addHook('onRequest', tenantMiddleware);

        childApp.post('/create-session', {
            schema: {
                body: z.object({ planId: z.string() })
            }
        }, async (request: FastifyRequest, reply: FastifyReply) => {
            const { planId } = request.body as any;
            const tenantId = (request as any).tenantId;

            const plan = await prisma.plan.findFirst({ where: { id: planId } });
            if (!plan) return reply.status(404).send({ message: 'Plan not found' });

            const tenant = await prisma.tenant.findFirst({ where: { id: tenantId } });

            try {
                // Create Stripe Checkout Session
                const session = await stripe.checkout.sessions.create({
                    payment_method_types: ['card'],
                    line_items: [
                        {
                            price_data: {
                                currency: 'brl',
                                product_data: {
                                    name: `Plano ${plan.name}`,
                                },
                                unit_amount: Math.round(plan.price * 100),
                                recurring: { interval: 'month' }
                            },
                            quantity: 1,
                        },
                    ],
                    mode: 'subscription',
                    client_reference_id: tenantId,
                    success_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
                    cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/onboarding/plans`,
                });

                return reply.status(200).send({ url: session.url });
            } catch (err: any) {
                return reply.status(500).send({ message: 'Error creating checkout session', error: err.message });
            }
        });
    });
}
