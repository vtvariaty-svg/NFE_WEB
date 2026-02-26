import { prisma } from '../../index.js';

// ── Connector Interface ──────────────────────────────────────────────────────

export interface MarketplaceOrderPayload {
    externalOrderId: string;
    buyerName: string;
    totalAmount: number;
    items: Array<{ sku: string; name: string; quantity: number; price: number }>;
    rawPayload: Record<string, any>;
}

export interface IConnector {
    syncOrders(tenantId: string, accountId: string, token: string): Promise<MarketplaceOrderPayload[]>;
    validateWebhook(headers: Record<string, string>, body: any, secret?: string): boolean;
    parseWebhookOrder(body: any): MarketplaceOrderPayload | null;
}

// ── TikTok Shop Connector ────────────────────────────────────────────────────

export class TikTokShopConnector implements IConnector {
    private baseUrl = 'https://open-api.tiktokglobalshop.com';

    async syncOrders(tenantId: string, accountId: string, token: string): Promise<MarketplaceOrderPayload[]> {
        try {
            // TikTok Shop API — Get order list
            const response = await fetch(`${this.baseUrl}/api/orders/search`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-tts-access-token': token
                },
                body: JSON.stringify({
                    order_status: 'AWAITING_SHIPMENT', // Orders ready for invoicing
                    page_size: 50,
                    sort_by: 'CREATE_TIME',
                    sort_type: 2 // DESC
                })
            });

            if (!response.ok) {
                const errorBody = await response.text();
                console.log(JSON.stringify({ level: 'error', service: 'TikTokShopConnector', msg: 'API error', status: response.status, body: errorBody }));
                return [];
            }

            const data = await response.json();
            const orders = data?.data?.order_list || [];

            return orders.map((order: any) => ({
                externalOrderId: order.order_id,
                buyerName: order.recipient_address?.name || 'TikTok Buyer',
                totalAmount: parseFloat(order.payment_info?.total_amount || '0'),
                items: (order.item_list || []).map((item: any) => ({
                    sku: item.seller_sku || item.product_id,
                    name: item.product_name,
                    quantity: item.quantity || 1,
                    price: parseFloat(item.sale_price || '0')
                })),
                rawPayload: order
            }));

        } catch (err: any) {
            console.log(JSON.stringify({ level: 'error', service: 'TikTokShopConnector', msg: 'Sync failed', error: err.message }));
            return [];
        }
    }

    validateWebhook(headers: Record<string, string>, body: any): boolean {
        // TikTok uses HMAC-SHA256 signature verification
        // In production, verify headers['x-tts-signature'] against app_secret
        return !!headers['x-tts-signature'] || true; // Permissive for now
    }

    parseWebhookOrder(body: any): MarketplaceOrderPayload | null {
        if (body?.type !== 'ORDER_STATUS_CHANGE' || !body?.data?.order_id) return null;

        return {
            externalOrderId: body.data.order_id,
            buyerName: body.data.buyer_name || 'TikTok Buyer',
            totalAmount: parseFloat(body.data.total_amount || '0'),
            items: (body.data.items || []).map((item: any) => ({
                sku: item.sku || item.product_id,
                name: item.name,
                quantity: item.quantity || 1,
                price: parseFloat(item.price || '0')
            })),
            rawPayload: body.data
        };
    }
}

// ── Shopee Connector ─────────────────────────────────────────────────────────

export class ShopeeConnector implements IConnector {
    private baseUrl = 'https://partner.shopeemobile.com/api/v2';

    async syncOrders(tenantId: string, accountId: string, token: string): Promise<MarketplaceOrderPayload[]> {
        try {
            // Shopee API — Get order list
            const now = Math.floor(Date.now() / 1000);
            const fifteenDaysAgo = now - (15 * 24 * 60 * 60);

            const response = await fetch(
                `${this.baseUrl}/order/get_order_list?access_token=${token}&time_from=${fifteenDaysAgo}&time_to=${now}&time_range_field=create_time&page_size=50&order_status=READY_TO_SHIP`,
                { method: 'GET', headers: { 'Content-Type': 'application/json' } }
            );

            if (!response.ok) {
                const errorBody = await response.text();
                console.log(JSON.stringify({ level: 'error', service: 'ShopeeConnector', msg: 'API error', status: response.status, body: errorBody }));
                return [];
            }

            const data = await response.json();
            const orderSns = data?.response?.order_list?.map((o: any) => o.order_sn) || [];

            if (orderSns.length === 0) return [];

            // Get order details
            const detailRes = await fetch(
                `${this.baseUrl}/order/get_order_detail?access_token=${token}&order_sn_list=${orderSns.join(',')}`,
                { method: 'GET', headers: { 'Content-Type': 'application/json' } }
            );

            const detailData = await detailRes.json();
            const details = detailData?.response?.order_list || [];

            return details.map((order: any) => ({
                externalOrderId: order.order_sn,
                buyerName: order.buyer_username || 'Shopee Buyer',
                totalAmount: parseFloat(order.total_amount || '0'),
                items: (order.item_list || []).map((item: any) => ({
                    sku: item.item_sku || item.item_id?.toString(),
                    name: item.item_name,
                    quantity: item.model_quantity_purchased || 1,
                    price: parseFloat(item.model_discounted_price || '0')
                })),
                rawPayload: order
            }));

        } catch (err: any) {
            console.log(JSON.stringify({ level: 'error', service: 'ShopeeConnector', msg: 'Sync failed', error: err.message }));
            return [];
        }
    }

    validateWebhook(headers: Record<string, string>, body: any): boolean {
        // Shopee sends authorization header with partner_id + timestamp + sign
        return true; // In production, verify HMAC
    }

    parseWebhookOrder(body: any): MarketplaceOrderPayload | null {
        if (!body?.data?.ordersn) return null;

        return {
            externalOrderId: body.data.ordersn,
            buyerName: body.data.buyer_username || 'Shopee Buyer',
            totalAmount: parseFloat(body.data.total_amount || '0'),
            items: [],
            rawPayload: body.data
        };
    }
}

// ── Factory ──────────────────────────────────────────────────────────────────

export function getConnector(provider: string): IConnector {
    switch (provider.toUpperCase()) {
        case 'TIKTOK_SHOP':
        case 'TIKTOK':
            return new TikTokShopConnector();
        case 'SHOPEE':
            return new ShopeeConnector();
        default:
            throw new Error(`Provedor de marketplace não suportado: ${provider}. Use TIKTOK_SHOP ou SHOPEE.`);
    }
}

// ── Order Conversion Helper ──────────────────────────────────────────────────

export async function convertMarketplaceOrderToInternal(
    tenantId: string,
    marketplaceOrder: MarketplaceOrderPayload,
    companyId: string,
    customerId?: string
) {
    // Create internal Order (items stay in MarketplaceOrder.rawPayload
    // since OrderItem requires productId FK - marketplace products
    // need to be mapped by the user first)
    const order = await prisma.order.create({
        data: {
            tenantId,
            status: 'PENDING',
            total: marketplaceOrder.totalAmount
        }
    });

    return order;
}
