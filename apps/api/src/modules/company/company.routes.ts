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
                document: z.string() // CNPJ
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

    app.post('/:id/certificate', {
        schema: {
            params: z.object({ id: z.string() }),
            body: z.object({
                pfxBase64: z.string(),
                password: z.string()
            })
        }
    }, async (request, reply) => {
        const { id } = request.params as any;
        const { pfxBase64, password } = request.body as any;
        const tenantId = (request as any).tenantId;

        // Verify ownership
        const company = await prisma.company.findFirst({ where: { id, tenantId } });
        if (!company) return reply.status(404).send();

        const cert = await prisma.certificate.upsert({
            where: { companyId: id },
            update: { pfxBase64, password },
            create: { pfxBase64, password, companyId: id }
        });

        return reply.status(200).send({ message: 'Certificate saved' });
    });
}
