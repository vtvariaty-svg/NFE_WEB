/**
 * generate-api-key.mjs
 * Gera uma API Key para o tenant informado e insere direto no banco.
 * Uso: node generate-api-key.mjs [tenantId_ou_deixe_vazio_para_listar]
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const targetTenantId = process.argv[2] || null;

    if (!targetTenantId) {
        // Lista os tenants disponíveis
        const tenants = await prisma.tenant.findMany({
            select: { id: true, name: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
            take: 20
        });
        console.log('\nTenants disponíveis:\n');
        tenants.forEach(t => console.log(`  ${t.id}  ${t.name}`));
        console.log('\nRode novamente com o tenantId desejado:');
        console.log('  node generate-api-key.mjs <tenantId>\n');
        return;
    }

    const tenant = await prisma.tenant.findUnique({ where: { id: targetTenantId } });
    if (!tenant) {
        console.error(`Tenant "${targetTenantId}" não encontrado.`);
        process.exit(1);
    }

    // Gera a chave
    const rawToken = `sk_live_${crypto.randomBytes(32).toString('hex')}`;
    const keyHash  = crypto.createHash('sha256').update(rawToken).digest('hex');
    const prefix   = rawToken.substring(0, 12);
    const hint     = rawToken.slice(-4);

    const apiKey = await prisma.apiKey.create({
        data: {
            tenantId: tenant.id,
            name:     'automation-whatsapp',
            prefix,
            hint,
            keyHash,
            scopes:   ['*']
        }
    });

    await prisma.auditLog.create({
        data: {
            tenantId:  tenant.id,
            action:    'API_KEY_CREATED',
            metadata:  JSON.stringify({ name: 'automation-whatsapp', id: apiKey.id, generatedBy: 'admin-script' })
        }
    });

    console.log('\n✅ API Key gerada com sucesso!\n');
    console.log(`Tenant:  ${tenant.name} (${tenant.id})`);
    console.log(`Key ID:  ${apiKey.id}`);
    console.log(`\n🔑 NFE_API_KEY=${rawToken}\n`);
    console.log('⚠️  Guarde esta chave. Ela não será exibida novamente.\n');
}

main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
