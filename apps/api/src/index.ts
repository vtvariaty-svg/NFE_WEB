import Fastify from 'fastify';
import cors from '@fastify/cors';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import fastifyJwt from '@fastify/jwt';

// Load environment variables
dotenv.config();

export const prisma = new PrismaClient();
const fastify = Fastify({ logger: true });

async function buildServer() {
    await fastify.register(cors, {
        origin: '*',
    });

    await fastify.register(fastifyJwt, {
        secret: process.env.JWT_SECRET || 'supersecret'
    });

    fastify.get('/health', async (request, reply) => {
        return { status: 'ok', time: new Date().toISOString() };
    });

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
