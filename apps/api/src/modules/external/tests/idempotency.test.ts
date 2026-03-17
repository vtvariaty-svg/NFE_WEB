import { test, expect, describe, beforeAll, afterAll, vi } from 'vitest';
import Fastify from 'fastify';
import crypto from 'crypto';
import { prisma } from '../../../index.js'; // Prisma client
import { verifyApiKey } from '../api-key.middleware.js';
import { idempotencyMiddleware, cacheIdempotencyResponseHook } from '../idempotency.middleware.js';

// Setup Mock App with Middlewares
const buildApp = () => {
    const app = Fastify();
    
    app.addHook('onRequest', verifyApiKey);
    app.addHook('onSend', cacheIdempotencyResponseHook);

    app.post('/test/idempotent-endpoint', {
        preHandler: [idempotencyMiddleware]
    }, async (request, reply) => {
        const body = request.body as any;

        // Mock a 500 transient error
        if (body.simulateCrash) {
            throw new Error('Sefaz Offline Transient Error');
        }

        return reply.status(200).send({
            message: 'Success',
            processed_data: body.data
        });
    });

    return app;
};

describe('M2M API & Idempotency Integration Tests', () => {
    let app: ReturnType<typeof buildApp>;
    let mockTenantId: string;
    let validRawApiKey: string;
    
    beforeAll(async () => {
        app = buildApp();
        await app.ready();

        // 1. Create a dummy tenant
        const tenant = await prisma.tenant.create({
            data: { name: 'Test Tenant M2M', slug: `test_m2m_${Date.now()}` }
        });
        mockTenantId = tenant.id;

        // 2. Generate a valid API Key for the test
        const randomHex = crypto.randomBytes(32).toString('hex');
        validRawApiKey = `sk_live_${randomHex}`;
        const keyHash = crypto.createHash('sha256').update(validRawApiKey).digest('hex');

        await prisma.apiKey.create({
            data: {
                tenantId: mockTenantId,
                name: 'Test Key',
                prefix: validRawApiKey.substring(0, 12),
                hint: validRawApiKey.slice(-4),
                keyHash,
                scopes: ['*']
            }
        });
    });

    afterAll(async () => {
        // Cleanup
        await prisma.idempotencyKey.deleteMany({ where: { tenantId: mockTenantId } });
        await prisma.apiKey.deleteMany({ where: { tenantId: mockTenantId } });
        await prisma.tenant.delete({ where: { id: mockTenantId } });
        await app.close();
    });

    test('1. Rejects request without API Key', async () => {
        const response = await app.inject({
            method: 'POST',
            url: '/test/idempotent-endpoint',
            headers: { 'Idempotency-Key': 'idx_123' },
            payload: { data: 'hello' }
        });
        expect(response.statusCode).toBe(401);
        expect(response.json().error).toMatch(/Missing API Key/i);
    });

    test('2. Processes initial request and locks idempotency key', async () => {
        const idempotencyKey = `idx_${Date.now()}`;
        const response = await app.inject({
            method: 'POST',
            url: '/test/idempotent-endpoint',
            headers: { 
                'Authorization': `Bearer ${validRawApiKey}`,
                'Idempotency-Key': idempotencyKey
            },
            payload: { data: 'first_run' }
        });

        expect(response.statusCode).toBe(200);
        expect(response.json().processed_data).toBe('first_run');

        // Verify it was cached in DB
        const dbRecord = await prisma.idempotencyKey.findUnique({
            where: { tenantId_key: { tenantId: mockTenantId, key: idempotencyKey } }
        });
        expect(dbRecord).not.toBeNull();
        expect(dbRecord?.responseStatus).toBe(200);
    });

    test('3. Replays exact cached response for the same Idempotency Key', async () => {
        const idempotencyKey = `idx_replay_test`;
        
        // First request
        await app.inject({
            method: 'POST',
            url: '/test/idempotent-endpoint',
            headers: { 
                'Authorization': `Bearer ${validRawApiKey}`,
                'Idempotency-Key': idempotencyKey
            },
            payload: { data: 'valuable_payload' }
        });

        // Second request (Replay)
        const replay = await app.inject({
            method: 'POST',
            url: '/test/idempotent-endpoint',
            headers: { 
                'Authorization': `Bearer ${validRawApiKey}`,
                'Idempotency-Key': idempotencyKey
            },
            payload: { data: 'valuable_payload' } // identical payload
        });

        expect(replay.statusCode).toBe(200);
        expect(replay.headers['x-idempotency-cache']).toBe('HIT');
        expect(replay.json().processed_data).toBe('valuable_payload');
    });

    test('4. Rejects request with same Idempotency Key but DIFFERENT payload', async () => {
        const idempotencyKey = `idx_mutated_test`;
        
        // Initial request
        await app.inject({
            method: 'POST',
            url: '/test/idempotent-endpoint',
            headers: { 
                'Authorization': `Bearer ${validRawApiKey}`,
                'Idempotency-Key': idempotencyKey
            },
            payload: { data: 'original' }
        });

        // Mutated request
        const mutated = await app.inject({
            method: 'POST',
            url: '/test/idempotent-endpoint',
            headers: { 
                'Authorization': `Bearer ${validRawApiKey}`,
                'Idempotency-Key': idempotencyKey
            },
            payload: { data: 'hacked_original' }
        });

        expect(mutated.statusCode).toBe(400);
        expect(mutated.json().code).toBe('idempotency_payload_mismatch');
    });

    test('5. Drops lock and DOES NOT cache on transient 500 errors', async () => {
        const idempotencyKey = `idx_500_test`;
        
        // Simulate crash
        const crashReq = await app.inject({
            method: 'POST',
            url: '/test/idempotent-endpoint',
            headers: { 
                'Authorization': `Bearer ${validRawApiKey}`,
                'Idempotency-Key': idempotencyKey
            },
            payload: { data: 'retry_me_later', simulateCrash: true }
        });

        expect(crashReq.statusCode).toBe(500);

        // Verify lock is destroyed in DB allowing future retries
        const dbRecord = await prisma.idempotencyKey.findUnique({
            where: { tenantId_key: { tenantId: mockTenantId, key: idempotencyKey } }
        });
        
        expect(dbRecord).toBeNull(); // Should have been deleted by the onSend hook
    });
});
