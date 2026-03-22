import Fastify, { FastifyReply, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import fastifyJwt from '@fastify/jwt';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';

import { authRoutes } from './modules/auth/auth.routes.js';
import { customerRoutes } from './modules/customer/customer.routes.js';
import { productRoutes } from './modules/product/product.routes.js';
import { companyRoutes } from './modules/company/company.routes.js';
import { tenantRoutes } from './modules/tenant/tenant.routes.js';
import { invoiceRoutes } from './modules/fiscal/invoice.routes.js';
import { orderRoutes } from './modules/order/order.routes.js';
import { billingRoutes } from './modules/billing/billing.routes.js';
import { integrationRoutes } from './modules/integrations/integrations.routes.js';
import { certificateRoutes } from './modules/certificate/certificate.routes.js';
import { archiveRoutes } from './modules/fiscal/archive.routes.js';
import { nfeRoutes } from './modules/fiscal/nfe/nfe.routes.js';
import { nfseRoutes } from './modules/fiscal/nfse/nfse.routes.js';
import { auditRoutes } from './modules/fiscal/audit.routes.js';
import { checkoutRoutes } from './modules/billing/checkout.routes.js';
import { adminRoutes } from './modules/admin/admin.routes.js';
import { fiscalOpsRoutes } from './modules/fiscal/fiscal-ops.routes.js';
import { fiscalReadinessRoutes } from './modules/fiscal/fiscal-readiness.routes.js';
import { fiscalInvoicesRoutes } from './modules/fiscal/fiscal-invoices.routes.js';
import { externalNfeRoutes } from './modules/external/external-nfe.routes.js';
import { externalCertificateRoutes } from './modules/external/external-certificates.routes.js';
import { apiKeyRoutes } from './modules/external/api-key.routes.js';
// Side-effect import: registers Nuvem Fiscal sync polling when FISCAL_PROVIDER=nuvem_fiscal
import './modules/fiscal/nfe/services/nuvem-fiscal-sync.service.js';

dotenv.config();

export const prisma = new PrismaClient();
const fastify = Fastify({ logger: true });

// ── Zod schema validation ────────────────────────────────────────────────────
fastify.setValidatorCompiler(validatorCompiler);
fastify.setSerializerCompiler(serializerCompiler);

declare module 'fastify' {
    interface FastifyInstance {
        authenticate: any;
    }
}

async function buildServer() {
    // ── CORS ──────────────────────────────────────────────────────────────────
    await fastify.register(cors, {
        origin: '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'x-tenant-id', 'x-api-key']
    });

    // ── Per-tenant rate limiting ───────────────────────────────────────────────
    // 300 requests / 1 minute per tenant (or IP for unauthenticated requests)
    await fastify.register(rateLimit, {
        global: true,
        max: 300,
        timeWindow: '1 minute',
        // Identify requests by tenantId (from JWT or ApiKey) or fallback to IP
        keyGenerator: (request: FastifyRequest) => {
            const tenantId = (request as any).tenantId; // Set by both auth middlewares
            return tenantId || request.ip;
        },
        errorResponseBuilder: (_request, context) => ({
            error: 'Too Many Requests',
            message: `Rate limit atingido. Tente novamente em ${context.ttl}ms.`,
            statusCode: 429
        })
    });

    // ── JWT Authentication ─────────────────────────────────────────────────────
    await fastify.register(fastifyJwt, { secret: process.env.JWT_SECRET || 'supersecret' });

    fastify.decorate('authenticate', async function (request: FastifyRequest, reply: FastifyReply) {
        try {
            await request.jwtVerify();
        } catch (err) {
            reply.send(err);
        }
    });

    // ── Per-tenant structured request logging ──────────────────────────────────
    // Every request gets logged with tenantId for isolation and audit purposes
    fastify.addHook('onRequest', async (request) => {
        const jwtUser = (request as any).user as { tenantId?: string } | undefined;
        const tenantId = jwtUser?.tenantId || (request.headers['x-tenant-id'] as string) || 'anonymous';
        // The Fastify logger is pino — bind tenantId to every log line for this request
        (request as any).log = request.log.child({ tenantId, path: request.url, method: request.method });
    });

    // ── Health check ──────────────────────────────────────────────────────────
    fastify.get('/health', async () => ({ status: 'ok', time: new Date().toISOString() }));

    // ── Register Modules ───────────────────────────────────────────────────────
    fastify.register(authRoutes, { prefix: '/auth' });
    fastify.register(tenantRoutes, { prefix: '/tenants' });
    
    // Core Fiscal Shared Entities namespaces (Composite Auth)
    // Both NFE_WEB Frontend and External API keys can use these unified services
    fastify.register(companyRoutes, { prefix: '/fiscal/companies' });
    fastify.register(customerRoutes, { prefix: '/fiscal/customers' });
    fastify.register(productRoutes, { prefix: '/fiscal/products' });
    fastify.register(fiscalReadinessRoutes, { prefix: '/fiscal/readiness' });
    fastify.register(fiscalInvoicesRoutes, { prefix: '/fiscal/invoices' });

    fastify.register(certificateRoutes, { prefix: '/certificates' });
    fastify.register(orderRoutes, { prefix: '/orders' });
    fastify.register(invoiceRoutes, { prefix: '/invoices' });
    fastify.register(archiveRoutes, { prefix: '/archives' });
    fastify.register(nfeRoutes, { prefix: '/fiscal/nfe' });
    fastify.register(nfseRoutes, { prefix: '/api/fiscal/nfse' });
    fastify.register(auditRoutes, { prefix: '/audits' });
    fastify.register(billingRoutes, { prefix: '/billing' });
    fastify.register(checkoutRoutes, { prefix: '/checkout' });
    fastify.register(adminRoutes, { prefix: '/admin' });
    fastify.register(integrationRoutes, { prefix: '/integrations' });
    fastify.register(fiscalOpsRoutes, { prefix: '/fiscal-ops' });
    
    // External API routes (M2M automation)
    fastify.register(apiKeyRoutes, { prefix: '/api-keys' });
    fastify.register(externalNfeRoutes, { prefix: '/v1/external/nfe' });
    fastify.register(externalCertificateRoutes, { prefix: '/v1/external/certificates' });

    return fastify;
}

buildServer()
    .then(app => {
        app.listen({ port: 3333, host: '0.0.0.0' }, (err, address) => {
            if (err) {
                app.log.error(err);
                process.exit(1);
            }
            app.log.info(`API listening at ${address}`);
        });
    })
    .catch(err => {
        console.error('Error starting server', err);
        process.exit(1);
    });
