# Integrations Architecture

## Workflow
1. Users authenticate their Shopee/TikTok accounts via OAuth or generic Token.
2. The Integration record is saved (encrypted token).
3. A background Job (or Lambda trigger) polls `/orders` from the marketplace every X minutes.
4. Orders are mapped to the generic `Order` and `OrderItem` schema.
5. Emitted NF-e XML keys and Tracking Codes are sent back to the marketplace via another adapter method.

## Supported Marketplaces (Planned)
- Shopee
- TikTok Shop
- Mercado Livre
