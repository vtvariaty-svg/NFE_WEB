import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

export default async function tenantMiddleware(
    request: FastifyRequest,
    reply: FastifyReply
) {
    const tenantId = request.headers['x-tenant-id'];
    if (!tenantId) {
        return reply.status(400).send({ error: 'x-tenant-id header is required' });
    }

    // In a real scenario, we might validate the tenantId against the DB here
    // or attach it to the request context
    (request as any).tenantId = tenantId;
}
