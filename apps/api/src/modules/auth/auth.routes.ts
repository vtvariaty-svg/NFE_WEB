import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../index.js';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

const ACCESS_TOKEN_EXPIRY = '15m';    // Short-lived access token
const REFRESH_TOKEN_EXPIRY_DAYS = 30; // Long-lived refresh token

export async function authRoutes(app: FastifyInstance) {

    // ── POST /auth/register ───────────────────────────────────────────────────
    app.post('/register', {
        schema: {
            body: z.object({
                email: z.string().email(),
                password: z.string().min(6),
                name: z.string(),
                tenantName: z.string(),
            })
        }
    }, async (request, reply) => {
        const { email, password, name, tenantName } = request.body as any;

        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return reply.status(400).send({ message: 'User already exists' });
        }

        // ✅ Hash password with bcrypt (salt rounds = 12)
        const hashedPassword = await bcrypt.hash(password, 12);

        const tenant = await prisma.tenant.create({
            data: {
                name: tenantName,
                slug: tenantName.toLowerCase().replace(/[^a-z0-9]/g, '-'),
                users: {
                    create: {
                        email,
                        password: hashedPassword,
                        name
                    }
                },
                // Auto-create FREE subscription
                subscription: {
                    create: {
                        planId: await getOrCreateFreePlanId(),
                        status: 'ACTIVE',
                        currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
                    }
                }
            },
            include: { users: true }
        });

        const user = tenant.users[0];

        // Generate tokens
        const { accessToken, refreshToken } = await generateTokens(app, user.id, user.email, tenant.id);

        return reply.status(201).send({
            message: 'Tenant and User created',
            token: accessToken,
            refreshToken,
            user: { id: user.id, name: user.name, email: user.email, tenantId: tenant.id }
        });
    });

    // ── POST /auth/login ──────────────────────────────────────────────────────
    app.post('/login', {
        schema: {
            body: z.object({
                email: z.string().email(),
                password: z.string(),
            })
        }
    }, async (request, reply) => {
        const { email, password } = request.body as any;

        const user = await prisma.user.findUnique({
            where: { email },
            include: { tenant: { include: { subscription: true } } }
        });

        if (!user) {
            return reply.status(401).send({ message: 'Invalid credentials' });
        }

        // ✅ Compare with bcrypt hash
        const passwordValid = await bcrypt.compare(password, user.password);

        // Fallback: support legacy plain-text passwords (migrate on login)
        const legacyMatch = !passwordValid && user.password === password;

        if (!passwordValid && !legacyMatch) {
            return reply.status(401).send({ message: 'Invalid credentials' });
        }

        // Migrate legacy plain-text password to hash on successful login
        if (legacyMatch) {
            const newHash = await bcrypt.hash(password, 12);
            await prisma.user.update({ where: { id: user.id }, data: { password: newHash } });
        }

        // Promote admin
        let isAdmin = (user as any).isGlobalAdmin;
        if (user.email === 'vtvariaty@gmail.com' && !isAdmin) {
            await prisma.user.update({ where: { id: user.id }, data: { isGlobalAdmin: true } as any });
            isAdmin = true;
        }

        // ✅ Generate access + refresh tokens
        const { accessToken, refreshToken } = await generateTokens(app, user.id, user.email, user.tenantId);

        // Audit log
        await prisma.auditLog.create({
            data: { tenantId: user.tenantId, userId: user.id, action: 'LOGIN', metadata: JSON.stringify({ ip: request.ip }) }
        }).catch(() => { });

        return {
            token: accessToken,
            refreshToken,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                tenantId: user.tenantId,
                isGlobalAdmin: isAdmin,
                subscriptionStatus: user.tenant?.subscription?.status || null
            }
        };
    });

    // ── POST /auth/refresh — Refresh token rotation ───────────────────────────
    app.post('/refresh', {
        schema: {
            body: z.object({ refreshToken: z.string() })
        }
    }, async (request, reply) => {
        const { refreshToken } = request.body as any;

        // Hash the incoming token to compare
        const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

        const stored = await prisma.refreshToken.findFirst({
            where: { tokenHash, revoked: false }
        });

        if (!stored) {
            return reply.status(401).send({ message: 'Invalid or expired refresh token' });
        }

        if (new Date(stored.expiresAt) < new Date()) {
            // Expired — revoke and deny
            await prisma.refreshToken.update({ where: { id: stored.id }, data: { revoked: true } });
            return reply.status(401).send({ message: 'Refresh token expired. Please login again.' });
        }

        // ✅ Rotation: revoke old, issue new pair
        await prisma.refreshToken.update({ where: { id: stored.id }, data: { revoked: true } });

        const user = await prisma.user.findUnique({ where: { id: stored.userId } });
        if (!user) return reply.status(401).send({ message: 'User not found' });

        const tokens = await generateTokens(app, user.id, user.email, user.tenantId);

        return { token: tokens.accessToken, refreshToken: tokens.refreshToken };
    });

    // ── POST /auth/logout — Revoke refresh token ─────────────────────────────
    app.post('/logout', {
        onRequest: [app.authenticate],
        schema: { body: z.object({ refreshToken: z.string().optional() }) }
    }, async (request, reply) => {
        const { refreshToken } = request.body as any;
        const userId = (request as any).user.sub;

        if (refreshToken) {
            const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
            await prisma.refreshToken.updateMany({
                where: { tokenHash, userId },
                data: { revoked: true }
            });
        } else {
            // Revoke ALL refresh tokens for this user
            await prisma.refreshToken.updateMany({
                where: { userId },
                data: { revoked: true }
            });
        }

        return { message: 'Logged out successfully' };
    });

    // ── GET /auth/me ──────────────────────────────────────────────────────────
    app.get('/me', {
        onRequest: [app.authenticate]
    }, async (request, reply) => {
        return (request as any).user;
    });
}

// ── Token Generation Helpers ──────────────────────────────────────────────────

async function generateTokens(app: any, userId: string, email: string, tenantId: string) {
    // Short-lived access token (15 min)
    const accessToken = app.jwt.sign(
        { sub: userId, email, tenantId },
        { expiresIn: ACCESS_TOKEN_EXPIRY }
    );

    // Long-lived refresh token (opaque, stored hashed in DB)
    const rawRefreshToken = crypto.randomBytes(48).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');

    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    await prisma.refreshToken.create({
        data: { userId, tokenHash, expiresAt }
    });

    return { accessToken, refreshToken: rawRefreshToken };
}

async function getOrCreateFreePlanId(): Promise<string> {
    const existing = await prisma.plan.findFirst({ where: { name: 'FREE' } });
    if (existing) return existing.id;

    const plan = await prisma.plan.create({
        data: { name: 'FREE', price: 0, maxInvoices: 50, maxIntegrations: 1 }
    });
    return plan.id;
}
