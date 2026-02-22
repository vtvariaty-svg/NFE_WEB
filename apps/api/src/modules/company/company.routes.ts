import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../index.js';
import tenantMiddleware from '../tenant/tenant.middleware.js';

export async function companyRoutes(app: FastifyInstance) {
    app.addHook('onRequest', app.authenticate);
    app.addHook('onRequest', tenantMiddleware);

    app.post('/', {
        schema: {
            body: z.object({
                name: z.string(),
                document: z.string(), // CNPJ
                ie: z.string().optional(),
                cnae: z.string().optional(),
                crt: z.string().optional(),
                street: z.string().optional(),
                number: z.string().optional(),
                complement: z.string().optional(),
                district: z.string().optional(),
                city: z.string().optional(),
                state: z.string().optional(),
                zipCode: z.string().optional(),
                ibgeCode: z.string().optional(),
                phone: z.string().optional()
            })
        }
    }, async (request, reply) => {
        const data = request.body as any;
        const tenantId = (request as any).tenantId;

        const company = await prisma.company.create({
            data: { ...data, tenantId }
        });
        return reply.status(201).send(company);
    });

    app.get('/', async (request, reply) => {
        const tenantId = (request as any).tenantId;
        const companies = await prisma.company.findMany({ where: { tenantId } });
        return { data: companies };
    });

}
