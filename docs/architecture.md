# Architecture Document

## Overview
This document outlines the high-level architecture of the Fiscal SaaS Platform.

### Core Stack
- **Database**: PostgreSQL (hosted on Neon Database). We use Prisma ORM.
- **Backend API**: Node.js + Fastify + TypeScript. Fastify provides extreme performance suitable for high-throughput webhook processing.
- **Frontend**: Next.js 14 (App Routing) + TailwindCSS.
- **Deployment**: Render Web Services.

### Multi-Tenancy Strategy
We implement Logical Separation via a `tenantId` column on every tenant-specific table.
- At the API layer, a Fastify middleware intercepts requests, validates the JWT, and enforces a `tenantId`.
- No cross-tenant queries are allowed.

### Modules
1. **Auth & Identity**: JWT-based authentication. Roles and permissions are attached to the `User`.
2. **Fiscal Engine**: A state machine managing Invoice lifecycles (DRAFT -> PENDING -> AUTHORIZED / REJECTED). Uses Provider adapters to talk to diverse SEFAZ and Municipal endpoints.
3. **Billing**: Limits the number of invoices per month depending on the Plan properties structure (FREE / PRO).
4. **Integrations**: Polling or Webhook receivers standardizing generic "Orders" into the local `Order` schema.
