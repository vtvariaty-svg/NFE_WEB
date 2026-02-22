# Fiscal Providers Architecture

The system uses an adapter pattern to handle multiple fiscal providers (SEFAZ directly or municipal gateways like Focus NFe, Nota Fácil, plugnotas, etc.).

## Base Interface
```typescript
interface IFiscalProvider {
  issue(invoiceData: Invoice): Promise<{ status: string, externalId: string }>;
  consult(externalId: string): Promise<InvoiceStatus>;
  cancel(externalId: string, reason: string): Promise<boolean>;
}
```

## Mock Provider
In MVP, we implement `MockFiscalProvider` which simulates SEFAZ latency and returns success for any valid payload.
