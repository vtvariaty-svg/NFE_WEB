import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Seeding database...');

    // Create default plans
    const freePlan = await prisma.plan.upsert({
        where: { id: 'plan_free' },
        update: {},
        create: {
            id: 'plan_free',
            name: 'FREE',
            price: 0.0,
            maxInvoices: 50,
            maxIntegrations: 1
        }
    });

    const proPlan = await prisma.plan.upsert({
        where: { id: 'plan_pro' },
        update: {},
        create: {
            id: 'plan_pro',
            name: 'PRO',
            price: 99.90,
            maxInvoices: 5000,
            maxIntegrations: 10
        }
    });

    // Create a default tenant and user if they don't exist
    // We avoid breaking unique constraints by catching errors
    try {
        const adminUser = await prisma.user.upsert({
            where: { email: 'admin@seudominio.com' },
            update: {},
            create: {
                email: 'admin@seudominio.com',
                password: 'admin', // in a real app, hash this!
                name: 'Admin User',
                tenant: {
                    create: {
                        name: 'Minha Empresa Matriz',
                        slug: 'minha-empresa-matriz',
                        subscription: {
                            create: {
                                planId: proPlan.id,
                                currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year PRO
                            }
                        }
                    }
                }
            }
        });
        console.log(`Created admin user: ${adminUser.email}`);
    } catch (err) {
        console.log('Admin user might already exist. Skipping.');
    }

    console.log('Seed completed successfully.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
