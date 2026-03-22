import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../../index.js';
import { z } from 'zod';
import { NFSE_WORKER_STATE } from '../fiscal/nfse/services/worker.service.js';

// Middleware to protect global admin routes
export const globalAdminMiddleware = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
        const userId = (request as any).user.sub; // From fastify-jwt
        const user = await prisma.user.findFirst({ where: { id: userId } });

        if (!user || user.isGlobalAdmin !== true) {
            return reply.status(403).send({ message: 'Forbidden. Global Admin only.' });
        }
        (request as any).globalAdminUser = user;
    } catch (err) {
        return reply.status(401).send({ message: 'Unauthorized' });
    }
};

export async function adminRoutes(app: FastifyInstance) {
    app.addHook('onRequest', app.authenticate);
    app.addHook('onRequest', globalAdminMiddleware);

    // ── GET /admin/users — paginated + filterable ────────────────────────────────
    app.get('/users', {
        schema: {
            querystring: z.object({
                page:          z.coerce.number().default(1),
                limit:         z.coerce.number().max(200).default(50),
                email:         z.string().optional(),
                tenantId:      z.string().uuid().optional(),
                isGlobalAdmin: z.enum(['true','false']).optional()
            })
        }
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        const q = request.query as any;
        const page  = Math.max(1, q.page);
        const limit = Math.min(200, q.limit);
        const skip  = (page - 1) * limit;

        const where: any = {};
        if (q.email)         where.email = { contains: q.email, mode: 'insensitive' };
        if (q.tenantId)      where.tenantId = q.tenantId;
        if (q.isGlobalAdmin) where.isGlobalAdmin = q.isGlobalAdmin === 'true';

        const [users, total] = await Promise.all([
            prisma.user.findMany({
                where,
                include: { tenant: { select: { id: true, name: true, slug: true } }, role: { select: { id: true, name: true } } },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit
            }),
            prisma.user.count({ where })
        ]);

        // Strip password hashes from response
        const safeUsers = users.map(({ password, ...u }) => u);
        return reply.status(200).send({ data: safeUsers, total, page, limit });
    });

    // ── POST /admin/users — create user (hardened) ───────────────────────────
    app.post('/users', {
        schema: {
            body: z.object({
                name:                z.string().min(2).max(100),
                email:               z.string().email(),
                password:            z.string().min(8),
                tenantId:            z.string().uuid(),
                roleId:              z.string().uuid().optional(),
                elevateToGlobalAdmin: z.boolean().default(false)
            })
        }
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        const adminUser = (request as any).globalAdminUser;
        const body = request.body as any;

        // 1. Email uniqueness
        const existing = await prisma.user.findUnique({ where: { email: body.email } });
        if (existing) return reply.status(409).send({ error: 'E-mail já cadastrado no sistema.' });

        // 2. Validate tenantId
        const tenant = await prisma.tenant.findUnique({ where: { id: body.tenantId } });
        if (!tenant) return reply.status(422).send({ error: 'tenantId inválido ou tenant não encontrado.' });

        // 3. Validate roleId belongs to the same tenant
        if (body.roleId) {
            const role = await prisma.role.findUnique({ where: { id: body.roleId } });
            if (!role || role.tenantId !== body.tenantId) {
                return reply.status(422).send({ error: 'roleId não pertence ao tenant informado.' });
            }
        }

        // 4. Elevation to globalAdmin is explicit and audited
        const isGlobalAdmin = body.elevateToGlobalAdmin === true;

        const { hashSync } = await import('bcrypt');
        const hashedPassword = hashSync(body.password, 12);

        const newUser = await prisma.user.create({
            data: {
                name:          body.name,
                email:         body.email,
                password:      hashedPassword,
                tenantId:      body.tenantId,
                roleId:        body.roleId || null,
                isGlobalAdmin: isGlobalAdmin
            },
            select: { id: true, name: true, email: true, tenantId: true, isGlobalAdmin: true, createdAt: true }
        });

        // Audit
        await prisma.auditLog.create({
            data: {
                tenantId:   body.tenantId,
                userId:     adminUser.id,
                action:     'ADMIN_CREATE_USER',
                resourceId: newUser.id,
                metadata:   JSON.stringify({ email: body.email, tenantId: body.tenantId, isGlobalAdmin, createdBy: adminUser.email })
            }
        });

        return reply.status(201).send({ data: newUser });
    });

    // ── GET /admin/tenants — list tenants with subscription + pagination ────────
    app.get('/tenants', {
        schema: {
            querystring: z.object({
                page:            z.coerce.number().default(1),
                limit:           z.coerce.number().max(200).default(50),
                name:            z.string().optional(),
                hasSubscription: z.enum(['true','false']).optional()
            })
        }
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        const q = request.query as any;
        const page  = Math.max(1, q.page);
        const limit = Math.min(200, q.limit);
        const skip  = (page - 1) * limit;

        const where: any = {};
        if (q.name) where.name = { contains: q.name, mode: 'insensitive' };
        if (q.hasSubscription === 'true')  where.subscription = { isNot: null };
        if (q.hasSubscription === 'false') where.subscription = { is: null };

        const [tenants, total] = await Promise.all([
            prisma.tenant.findMany({
                where,
                include: {
                    subscription: { include: { plan: { select: { id: true, name: true, planName: true, price: true } } } },
                    _count: { select: { users: true, companies: true } }
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit
            }),
            prisma.tenant.count({ where })
        ]);

        return reply.status(200).send({ data: tenants, total, page, limit });
    });

    // ── PUT /admin/tenants/:tenantId/plan — manual plan override (no Stripe sync) ──
    app.put('/tenants/:tenantId/plan', {
        schema: {
            params: z.object({ tenantId: z.string().uuid() }),
            body:   z.object({
                planId: z.string().uuid(),
                reason: z.string().optional()
            })
        }
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        const adminUser   = (request as any).globalAdminUser;
        const { tenantId } = request.params as any;
        const { planId, reason } = request.body as any;

        // Validate tenant
        const tenant = await prisma.tenant.findUnique({
            where: { id: tenantId },
            include: { subscription: { include: { plan: true } } }
        });
        if (!tenant) return reply.status(404).send({ error: 'Tenant não encontrado.' });

        // Validate plan
        const newPlan = await prisma.plan.findUnique({ where: { id: planId } });
        if (!newPlan || !newPlan.isActive) return reply.status(404).send({ error: 'Plano não encontrado ou inativo.' });

        const fromPlanId = tenant.subscription?.planId || null;
        const hasStripe  = !!tenant.subscription?.stripeSubscriptionId;

        // Upsert subscription
        await prisma.subscription.upsert({
            where:  { tenantId },
            update: { planId, updatedAt: new Date() },
            create: {
                tenantId,
                planId,
                status:             'ACTIVE',
                currentPeriodStart: new Date(),
                currentPeriodEnd:   new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 ano
            }
        });

        // Audit: BillingHistory
        const sub = await prisma.subscription.findUnique({ where: { tenantId } });
        if (sub) {
            await prisma.billingHistory.create({
                data: {
                    tenantId,
                    subscriptionId: sub.id,
                    event:          'ADMIN_OVERRIDE',
                    fromPlanId,
                    toPlanId:       planId,
                    metadata:       JSON.stringify({ adminId: adminUser.id, adminEmail: adminUser.email, reason: reason || null, source: 'MANUAL_ADMIN' })
                }
            });
        }

        // AuditLog
        await prisma.auditLog.create({
            data: {
                tenantId,
                userId:     adminUser.id,
                action:     'ADMIN_PLAN_OVERRIDE',
                resourceId: tenantId,
                metadata:   JSON.stringify({ fromPlanId, toPlanId: planId, planName: newPlan.name, reason: reason || null })
            }
        });

        return reply.status(200).send({
            success: true,
            message: `Plano alterado para "${newPlan.name}" (override manual).`,
            newPlan: { id: newPlan.id, name: newPlan.name, price: newPlan.price },
            warning: hasStripe ? '⚠️ Este tenant possui assinatura no Stripe. A alteração não foi sincronizada com o Stripe — faça isso manualmente se necessário.' : null
        });
    });

    // Reset password for a specific user
    app.post('/users/:id/reset-password', {
        schema: {
            params: z.object({ id: z.string() }),
            body: z.object({ newPassword: z.string().min(6) })
        }
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        const { id } = request.params as any;
        const { newPassword } = request.body as any;

        const { hashSync } = await import('bcrypt');
        const hashedPassword = hashSync(newPassword, 10);

        await prisma.user.update({
            where: { id },
            data: { password: hashedPassword }
        });

        return reply.status(200).send({ message: 'Password reset successfully' });
    });

    // List NFe Errors
    app.get('/nfe-errors', async (request: FastifyRequest, reply: FastifyReply) => {
        const errors = await prisma.auditLog.findMany({
            where: { action: 'WEBHOOK_REJECTED' },
            include: { tenant: true },
            orderBy: { createdAt: 'desc' },
            take: 50
        });
        return reply.status(200).send({ data: errors });
    });

    // ── NFS-e Provider Management ────────────────────────────────────────────

    /**
     * POST /api/admin/nfse/seed-providers
     * Seeds the standard NFS-e providers (ABRASF, Nacional, Custom) into the database.
     * Safe to run multiple times — uses upsert so it won't create duplicates.
     */
    app.post('/nfse/seed-providers', async (request: FastifyRequest, reply: FastifyReply) => {
        const standardProviders = [
            { name: 'ABRASF v2.02 (Prefeituras parceiras)', type: 'ABRASF' },
            { name: 'Padrão Nacional NFS-e (SEFIN)', type: 'NATIONAL' },
            { name: 'Proprietário / Outros (WebISS, Ginfes, Betha)', type: 'OTHER' },
        ];

        const results = [];

        for (const provider of standardProviders) {
            // Check if it already exists
            const existing = await prisma.nfseProvider.findFirst({
                where: { type: provider.type }
            });

            if (existing) {
                results.push({ status: 'already_exists', id: existing.id, ...provider });
            } else {
                const created = await prisma.nfseProvider.create({ data: provider });
                results.push({ status: 'created', id: created.id, ...provider });
            }
        }

        return reply.status(200).send({
            message: 'NFS-e providers seeded successfully. Use the IDs below when configuring municipalities.',
            providers: results
        });
    });

    /**
     * GET /api/admin/nfse/providers
     * Lists all registered NFS-e providers.
     */
    app.get('/nfse/providers', async (request: FastifyRequest, reply: FastifyReply) => {
        const providers = await prisma.nfseProvider.findMany({
            orderBy: { createdAt: 'asc' },
            include: { _count: { select: { configs: true, invoices: true } } }
        });
        return reply.status(200).send({ providers });
    });

    /**
     * DELETE /api/admin/nfse/providers/:id
     * Deletes a provider (only if it has no linked configs or invoices).
     */
    app.delete('/nfse/providers/:id', {
        schema: { params: z.object({ id: z.string().uuid() }) }
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        const { id } = request.params as { id: string };

        const configs = await prisma.nfseMunicipalConfig.count({ where: { providerId: id } });
        const invoices = await prisma.nfseInvoice.count({ where: { providerId: id } });

        if (configs > 0 || invoices > 0) {
            return reply.status(400).send({
                error: `Não é possível deletar: existem ${configs} configuração(ões) e ${invoices} nota(s) vinculadas a este provedor.`
            });
        }

        await prisma.nfseProvider.delete({ where: { id } });
        return reply.status(200).send({ message: 'Provedor deletado com sucesso.' });
    });

    // ── Job Monitoring ────────────────────────────────────────────────────────
    app.get('/jobs/status', async (request: FastifyRequest, reply: FastifyReply) => {
        const pendingNfse = await prisma.nfseInvoice.count({ where: { status: 'PROCESSING' } });
        const pendingNfe = await prisma.invoice.count({ where: { status: 'PROCESSING' } });
        const failedNfse = await prisma.nfseInvoice.count({ where: { status: 'REJECTED' } });
        const failedNfe = await prisma.invoice.count({ where: { status: 'REJECTED' } });

        return reply.status(200).send({
            workers: { nfsePollWorker: NFSE_WORKER_STATE },
            queues: {
                nfse: { pending: pendingNfse, failed: failedNfse },
                nfe: { pending: pendingNfe, failed: failedNfe }
            },
            serverTime: new Date().toISOString()
        });
    });
}
