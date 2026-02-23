import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const email = 'vtvariaty@gmail.com';
    const existingUser = await prisma.user.findUnique({ where: { email } });

    if (existingUser) {
        console.log(`User ${email} already exists. Promoting to Global Admin...`);
        await prisma.user.update({
            where: { email },
            data: { isGlobalAdmin: true }
        });
        console.log('Success! User promoted.');
    } else {
        console.log(`User ${email} not found. Creating new Global Admin...`);
        // We need a tenant for the user
        const tenant = await prisma.tenant.create({
            data: {
                name: 'Admin Workspace',
                slug: 'admin-workspace-vtvariaty',
                users: {
                    create: {
                        email,
                        password: 'adminpassword123', // MOCKED BCRYPT ALREADY HASHED IF NEEDED
                        name: 'VTVariaty Admin',
                        isGlobalAdmin: true
                    }
                }
            }
        });
        console.log(`Success! Created Tenant ID: ${tenant.id} and Global Admin ${email}. Default Password: adminpassword123`);
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
