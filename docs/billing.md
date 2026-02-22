# Billing Architecture

## Models
- **Plan**: Defines limitations (e.g. `maxInvoicesPerMonth`).
- **Subscription**: Associates a Tenant to a Plan.
- **UsageCounter**: Tracks monthly emissions.

## Stripe Integration (Future Placeholder)
A webhook receiver at `/api/billing/webhook` will listen to:
- `checkout.session.completed`: Activates the subscription.
- `invoice.payment_failed`: Marks the subscription as PAST_DUE.

## Limits Middleware
A Fastify hook `checkUsageLimit` validates that the Tenant hasn't exceeded the current month's invoice allocation before calling `IFiscalProvider.issue()`.
