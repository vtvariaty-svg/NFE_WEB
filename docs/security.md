# Security Context

## Multi-Tenancy Hardening
Every sensitive query must include the `tenantId` extracted exclusively from the `x-tenant-id` header (verified by the JWT authorization claims mapping).
Never trust a `tenantId` coming directly from user JSON bodies for editing data - always map it from the middleware context.

## A1 Certificate Encryption
The `.pfx` or `.p12` certificates used to emit NF-e will be stored in `Certificate.pfxBase64`.
We will hash/encrypt these securely at the database level when we implement proper KMS or an Application-Level encryption secret.
For the MVP, they are base64 encoded and the passwords stored in the database. In a production scenario with "real fiscal integrations", they should be encrypted natively or stored in AWS Secret Manager/Hashicorp Vault.

## Rate Limiting
Fastify Rate Limit bounds are configured on login routes and emission triggers.
