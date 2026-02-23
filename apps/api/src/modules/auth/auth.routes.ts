import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../index.js';

export async function authRoutes(app: FastifyInstance) {
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

        // Check if user exists
        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return reply.status(400).send({ message: 'User already exists' });
        }

        // In a real app, hash password here (e.g. bcrypt)
        const hashedPassword = password;

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
                }
            }
        });

        return reply.status(201).send({ message: 'Tenant and User created', tenant });
    });

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
            include: {
                tenant: {
                    include: { subscription: true }
                }
            }
        });

        if (!user || user.password !== password) {
            return reply.status(401).send({ message: 'Invalid credentials' });
        }

        const token = app.jwt.sign({
            sub: user.id,
            email: user.email,
            tenantId: user.tenantId
        });

        return {
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                tenantId: user.tenantId,
                isGlobalAdmin: user.isGlobalAdmin,
                subscriptionStatus: user.tenant.subscription?.status || null
            }
        };
    });

    app.get('/me', {
        onRequest: [app.authenticate]
    }, async (request, reply) => {
        return (request as any).user;
    });
}
