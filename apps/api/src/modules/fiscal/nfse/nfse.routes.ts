import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../../index.js';
import { NfseEmissionService } from './services/emission.service.js';
import { nfseIssueSchema } from './validation/nfse.schema.js';

export async function nfseRoutes(app: FastifyInstance) {
    app.addHook('onRequest', app.authenticate);

    app.addHook('preHandler', async (request, reply) => {
        const { tenantId } = request.user as { tenantId: string };
        (request as any).tenantId = tenantId;
    });

    // 1. Emissão de NFS-e (Orquestrada)
    app.post(
        '/emit',
        {
            schema: {
                tags: ['NFS-e'],
                summary: 'Emitir Nova NFS-e v4/ABRASF/Nacional',
                body: nfseIssueSchema,
                querystring: z.object({ companyId: z.string().uuid() })
            }
        },
        async (request, reply) => {
            const tenantId = (request as any).tenantId;
            const { companyId } = request.query as { companyId: string };
            const payload = request.body as any;

            try {
                const result = await NfseEmissionService.issue(tenantId, companyId, payload);
                return reply.status(200).send(result);
            } catch (error: any) {
                return reply.status(400).send({ error: error.message });
            }
        }
    );

    // 2. Consulta Padrão por ID Local
    app.get(
        '/:id',
        {
            schema: {
                tags: ['NFS-e'],
                summary: 'Consultar Status da NFS-e do Banco Local',
                params: z.object({ id: z.string().uuid() })
            }
        },
        async (request, reply) => {
            const tenantId = (request as any).tenantId;
            const { id } = request.params as { id: string };

            const invoice = await prisma.nfseInvoice.findUnique({
                where: { id, tenantId },
                include: { taxes: true, items: true, events: true }
            });

            if (!invoice) return reply.status(404).send({ error: 'NFS-e não encontrada' });
            return invoice;
        }
    );

    // 3. Resgatar XML Final
    app.get(
        '/:id/xml',
        {
            schema: {
                tags: ['NFS-e'],
                summary: 'Download do XML da NFS-e autorizada',
                params: z.object({ id: z.string().uuid() })
            }
        },
        async (request, reply) => {
            const tenantId = (request as any).tenantId;
            const { id } = request.params as { id: string };

            const invoice = await prisma.nfseInvoice.findUnique({
                where: { id, tenantId, status: 'ISSUED' },
                select: { xmlNfse: true, numeroNfse: true, codigoVerificacao: true }
            });

            if (!invoice || !invoice.xmlNfse) {
                return reply.status(404).send({ error: 'XML não disponível. Certifique-se que a NFS-e está autorizada.' });
            }

            reply.header('Content-Type', 'application/xml');
            reply.header('Content-Disposition', `attachment; filename=NFSe_${invoice.numeroNfse}.xml`);
            return reply.send(invoice.xmlNfse);
        }
    );

    // 4. Consulta de Lote/Protocolo (Assíncrono Provider)
    app.get(
        '/:id/batch',
        {
            schema: {
                tags: ['NFS-e'],
                summary: 'Consultar Lote/Protocolo na Prefeitura',
                params: z.object({ id: z.string().uuid() })
            }
        },
        async (request, reply) => {
            const tenantId = (request as any).tenantId;
            const { id } = request.params as { id: string };

            // TODO: Call Adapter.queryBatch() and update DB
            return { message: 'Consulta de Lote recebida na fila ou resolvida.', id };
        }
    );

    // 5. Consulta por RPS
    app.post(
        '/query-by-rps',
        {
            schema: {
                tags: ['NFS-e'],
                summary: 'Sincronizar Status da Prefeitura via Série/Nº RPS',
                querystring: z.object({ companyId: z.string().uuid() }),
                body: z.object({ serie: z.string(), numero: z.number() })
            }
        },
        async (request, reply) => {
            const tenantId = (request as any).tenantId;
            const { companyId } = request.query as { companyId: string };
            const { serie, numero } = request.body as any;

            // TODO: Call Adapter.queryByRps() and inject responses downward
            return { message: `RPS ${serie}-${numero} consultado.` };
        }
    );

    // 6. Cancelamento
    app.post(
        '/:id/cancel',
        {
            schema: {
                tags: ['NFS-e'],
                summary: 'Cancelar NFS-e',
                params: z.object({ id: z.string().uuid() }),
                body: z.object({ codigoCancelamento: z.string(), justificativa: z.string() })
            }
        },
        async (request, reply) => {
            const tenantId = (request as any).tenantId;
            const { id } = request.params as { id: string };
            const payload = request.body as any;

            // 1. Register Event in NfseEvent
            // 2. adapter.cancelNfse()
            // 3. Update Invoice to CANCELED
            return { message: 'Processo de Cancelamento enviado ao adapter.' };
        }
    );

    // 7. Substituição
    app.post(
        '/:id/substitute',
        {
            schema: {
                tags: ['NFS-e'],
                summary: 'Substituição de NFS-e Existente',
                params: z.object({ id: z.string().uuid() }),
                body: nfseIssueSchema
            }
        },
        async (request, reply) => {
            // Emits a new NFS-e flagging the original one as substituted inside the provider payload if supported.
            return { message: 'Substituição pendente de implementação no provedor alvo.' };
        }
    );

    // 8. Status Provider
    app.get(
        '/status',
        {
            schema: {
                tags: ['NFS-e'],
                summary: 'Checar disponibilidade do WebService Municipal',
                querystring: z.object({ companyId: z.string().uuid(), cmun: z.string().length(7) })
            }
        },
        async (request, reply) => {
            // providerResolver -> adapter.status()
            return { online: true, provider: 'Simulado' };
        }
    );
}
