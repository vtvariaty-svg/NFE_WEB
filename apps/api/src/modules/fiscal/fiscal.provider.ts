export interface IFiscalProvider {
    issue(invoiceData: any): Promise<{ status: string, externalId: string }>;
    consult(externalId: string): Promise<{ status: string }>;
    cancel(externalId: string, reason: string): Promise<boolean>;
}

export class MockFiscalProvider implements IFiscalProvider {
    async issue(invoiceData: any) {
        console.log(`[MockProvider] Issuing invoice for Order ${invoiceData.orderId}`);
        return {
            status: 'AUTHORIZED', // Instantly approved in Mock
            externalId: `mock-nfe-${Date.now()}`
        };
    }

    async consult(externalId: string) {
        console.log(`[MockProvider] Consulting invoice ${externalId}`);
        return { status: 'AUTHORIZED' };
    }

    async cancel(externalId: string, reason: string) {
        console.log(`[MockProvider] Canceling invoice ${externalId} for reason: ${reason}`);
        return true;
    }
}

// In a real scenario, this would dynamically instantiate FocusNfe, NotaFacil, etc.
// depending on tenant fiscal config. For MVP we use Mock.
export function getFiscalProvider(tenantId: string): IFiscalProvider {
    return new MockFiscalProvider();
}
