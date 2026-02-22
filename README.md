# Fiscal SaaS Platform

A multi-tenant SaaS platform for issuing NF-e and NFS-e, designed for high scalability and modular integration with various marketplaces and sales channels.

## Structure
- `apps/api`: Fastify API with Prisma (Neon Postgres)
- `apps/web`: Next.js 14 Frontend with TailwindCSS

## Quick Start
1. Ensure Node.js 20+ is installed.
2. Run `npm install` at the root.
3. Configure your API `.env` from `.env.example`.
4. Run migrations: `npm run db:migrate` (Wait for Prisma to generate).
5. Start local development: `npm run dev`.

## Documentation
- `docs/architecture.md`
- `docs/providers.md`
- `docs/billing.md`
- `docs/integrations.md`
- `docs/security.md`
- `docs/runbook.md`
