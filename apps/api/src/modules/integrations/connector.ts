export interface IConnector {
    syncOrders(tenantId: string, integrationAccountId: string): Promise<any[]>;
}

export class MockConnector implements IConnector {
    async syncOrders(tenantId: string, integrationAccountId: string) {
        console.log(`[MockConnector] Syncing orders for account ${integrationAccountId}`);
        // Return some mock external orders
        return [
            {
                externalId: 'EXT-123',
                total: 150.00,
                items: [
                    { sku: 'MOCK-SKU-1', quantity: 1, price: 150.00 }
                ]
            }
        ];
    }
}

export function getConnector(provider: string): IConnector {
    // In a real scenario, switch on provider (SHOPEE, MERCADOLIVRE)
    return new MockConnector();
}
