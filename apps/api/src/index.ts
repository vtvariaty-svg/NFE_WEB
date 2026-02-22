import Fastify, { FastifyReply, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
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

dotenv.config();

export const prisma = new PrismaClient();
const fastify = Fastify({ logger: true });

// Add Zod Compiler
fastify.setValidatorCompiler(validatorCompiler);
fastify.setSerializerCompiler(serializerCompiler);

declare module 'fastify' {
    interface FastifyInstance {
        authenticate: any;
    }
}

async function buildServer() {
    await fastify.register(cors, { origin: '*' });

    await fastify.register(fastifyJwt, { secret: process.env.JWT_SECRET || 'supersecret' });

    fastify.decorate('authenticate', async function (request: FastifyRequest, reply: FastifyReply) {
        try {
            await request.jwtVerify();
        } catch (err) {
            reply.send(err);
        }
    });

    fastify.get('/health', async () => ({ status: 'ok', time: new Date().toISOString() }));

    // Register Modules
    fastify.register(authRoutes, { prefix: '/auth' });
    fastify.register(tenantRoutes, { prefix: '/tenants' });
    fastify.register(companyRoutes, { prefix: '/companies' });
    fastify.register(customerRoutes, { prefix: '/customers' });
    fastify.register(productRoutes, { prefix: '/products' });
    fastify.register(orderRoutes, { prefix: '/orders' });
    fastify.register(invoiceRoutes, { prefix: '/invoices' });
    fastify.register(billingRoutes, { prefix: '/billing' });
    fastify.register(integrationRoutes, { prefix: '/integrations' });

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
