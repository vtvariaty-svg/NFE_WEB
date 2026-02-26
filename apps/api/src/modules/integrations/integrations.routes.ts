import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../index.js';
import tenantMiddleware from '../tenant/tenant.middleware.js';
import { getConnector, convertMarketplaceOrderToInternal } from './connector.js';

export async function integrationRoutes(app: FastifyInstance) {

    // ── 1. Connect Marketplace Account ────────────────────────────────────────
    app.post('/accounts', {
        onRequest: [app.authenticate, tenantMiddleware],
        schema: {
            body: z.object({
                provider: z.enum(['TIKTOK_SHOP', 'SHOPEE']),
                token: z.string(),
                refreshToken: z.string().optional(),
                shopId: z.string().optional(),
                metadata: z.string().optional()
            })
        }
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        const body = request.body as any;
        const tenantId = (request as any).tenantId;

        const account = await prisma.integrationAccount.create({
            data: {
                tenantId,
                provider: body.provider,
                token: body.token,
                refreshTk: body.refreshToken,
                shopId: body.shopId,
                metadata: body.metadata
            }
        });

        return reply.status(201).send({ message: 'Conta marketplace conectada.', account });
    });

    // ── List Connected Accounts ───────────────────────────────────────────────
    app.get('/accounts', {
        onRequest: [app.authenticate, tenantMiddleware]
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        const tenantId = (request as any).tenantId;
        const accounts = await prisma.integrationAccount.findMany({
            where: { tenantId },
            select: {
                id: true, provider: true, shopId: true, isActive: true,
                lastSyncAt: true, createdAt: true, _count: { select: { orders: true } }
            }
        });
        return { data: accounts };
    });

    // ── 2. Manual Sync Orders ─────────────────────────────────────────────────
    app.post('/sync/:accountId', {
        onRequest: [app.authenticate, tenantMiddleware],
        schema: { params: z.object({ accountId: z.string().uuid() }) }
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        const { accountId } = request.params as any;
        const tenantId = (request as any).tenantId;

        const account = await prisma.integrationAccount.findFirst({
            where: { id: accountId, tenantId, isActive: true }
        });
        if (!account) return reply.status(404).send({ error: 'Conta não encontrada ou inativa.' });

        const connector = getConnector(account.provider);
        const marketplaceOrders = await connector.syncOrders(tenantId, account.id, account.token);

        let synced = 0;
        let skipped = 0;

        for (const mo of marketplaceOrders) {
            // Check if already synced (idempotent)
            const exists = await prisma.marketplaceOrder.findFirst({
                where: { integrationAccountId: account.id, externalOrderId: mo.externalOrderId }
            });

            if (exists) {
                skipped++;
                continue;
            }

            await prisma.marketplaceOrder.create({
                data: {
                    tenantId,
                    integrationAccountId: account.id,
                    externalOrderId: mo.externalOrderId,
                    platform: account.provider,
                    buyerName: mo.buyerName,
                    totalAmount: mo.totalAmount,
                    itemCount: mo.items.length,
                    rawPayload: JSON.stringify(mo.rawPayload),
                    status: 'SYNCED'
                }
            });
            synced++;
        }

        // Update last sync timestamp
        await prisma.integrationAccount.update({
            where: { id: account.id },
            data: { lastSyncAt: new Date() }
        });

        return { synced, skipped, total: marketplaceOrders.length };
    });

    // ── 3. List Synced Marketplace Orders ─────────────────────────────────────
    app.get('/orders', {
        onRequest: [app.authenticate, tenantMiddleware]
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        const tenantId = (request as any).tenantId;
        const orders = await prisma.marketplaceOrder.findMany({
            where: { tenantId },
            orderBy: { createdAt: 'desc' },
            take: 100
        });
        return { data: orders };
    });

    // ── 4. Convert Marketplace Order → Internal Order + Auto NF-e ─────────────
    app.post('/orders/:marketplaceOrderId/convert', {
        onRequest: [app.authenticate, tenantMiddleware],
        schema: {
            params: z.object({ marketplaceOrderId: z.string().uuid() }),
            body: z.object({
                companyId: z.string().uuid(),
                customerId: z.string().uuid().optional(),
                autoIssueNfe: z.boolean().optional()
            })
        }
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        const { marketplaceOrderId } = request.params as any;
        const body = request.body as any;
        const tenantId = (request as any).tenantId;

        const mktOrder = await prisma.marketplaceOrder.findFirst({
            where: { id: marketplaceOrderId, tenantId, status: 'SYNCED' }
        });
        if (!mktOrder) return reply.status(404).send({ error: 'Pedido marketplace não encontrado ou já convertido.' });

        // Parse raw payload to get items
        const rawItems = mktOrder.rawPayload ? JSON.parse(mktOrder.rawPayload) : {};
        const items = rawItems.item_list || rawItems.items || [];

        // Create internal order
        const order = await convertMarketplaceOrderToInternal(
            tenantId,
            {
                externalOrderId: mktOrder.externalOrderId,
                buyerName: mktOrder.buyerName || 'Marketplace Buyer',
                totalAmount: mktOrder.totalAmount || 0,
                items: items.map((i: any) => ({
                    sku: i.sku || i.seller_sku || i.item_sku || 'SKU',
                    name: i.name || i.product_name || i.item_name || 'Produto',
                    quantity: i.quantity || i.model_quantity_purchased || 1,
                    price: parseFloat(i.price || i.sale_price || i.model_discounted_price || '0')
                })),
                rawPayload: rawItems
            },
            body.companyId,
            body.customerId
        );

        // Update marketplace order
        await prisma.marketplaceOrder.update({
            where: { id: marketplaceOrderId },
            data: { status: 'CONVERTED', orderId: order.id, convertedAt: new Date() }
        });

        // Auto-issue NF-e if requested
        let invoiceResult = null;
        if (body.autoIssueNfe) {
            try {
                const invoice = await prisma.invoice.create({
                    data: {
                        tenantId,
                        orderId: order.id,
                        companyId: body.companyId,
                        type: 'NFE',
                        status: 'PROCESSING'
                    }
                });

                await prisma.marketplaceOrder.update({
                    where: { id: marketplaceOrderId },
                    data: { invoiceId: invoice.id }
                });

                invoiceResult = { id: invoice.id, status: 'PROCESSING' };
            } catch (err: any) {
                invoiceResult = { error: err.message };
            }
        }

        return {
            message: 'Pedido convertido com sucesso.',
            orderId: order.id,
            invoice: invoiceResult
        };
    });

    // ── 5. Marketplace Webhook Receiver ───────────────────────────────────────
    app.post('/webhook/:provider', {
        // NO auth — webhooks come from external platforms
        schema: {
            params: z.object({ provider: z.enum(['tiktok', 'shopee']) })
        }
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        const { provider } = request.params as any;
        const providerKey = provider === 'tiktok' ? 'TIKTOK_SHOP' : 'SHOPEE';

        try {
            const connector = getConnector(providerKey);

            // Validate signature
            const isValid = connector.validateWebhook(
                request.headers as Record<string, string>,
                request.body
            );

            if (!isValid) {
                return reply.status(403).send({ error: 'Invalid webhook signature' });
            }

            // Parse order from webhook
            const orderPayload = connector.parseWebhookOrder(request.body);
            if (!orderPayload) {
                // Not an order event — acknowledge
                return reply.status(200).send({ received: true, action: 'ignored' });
            }

            // Find matching integration accounts for this provider
            const accounts = await prisma.integrationAccount.findMany({
                where: { provider: providerKey, isActive: true }
            });

            let saved = 0;
            for (const account of accounts) {
                const exists = await prisma.marketplaceOrder.findFirst({
                    where: { integrationAccountId: account.id, externalOrderId: orderPayload.externalOrderId }
                });

                if (!exists) {
                    await prisma.marketplaceOrder.create({
                        data: {
                            tenantId: account.tenantId,
                            integrationAccountId: account.id,
                            externalOrderId: orderPayload.externalOrderId,
                            platform: providerKey,
                            buyerName: orderPayload.buyerName,
                            totalAmount: orderPayload.totalAmount,
                            itemCount: orderPayload.items.length,
                            rawPayload: JSON.stringify(orderPayload.rawPayload),
                            status: 'SYNCED'
                        }
                    });
                    saved++;
                }
            }

            return reply.status(200).send({ received: true, saved });

        } catch (err: any) {
            console.log(JSON.stringify({ level: 'error', service: 'MarketplaceWebhook', msg: err.message, provider }));
            return reply.status(200).send({ received: true, error: err.message });
        }
    });

    // ── Disconnect Account ────────────────────────────────────────────────────
    app.delete('/accounts/:accountId', {
        onRequest: [app.authenticate, tenantMiddleware],
        schema: { params: z.object({ accountId: z.string().uuid() }) }
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        const { accountId } = request.params as any;
        const tenantId = (request as any).tenantId;

        await prisma.integrationAccount.updateMany({
            where: { id: accountId, tenantId },
            data: { isActive: false }
        });

        return { message: 'Conta marketplace desconectada.' };
    });
}
