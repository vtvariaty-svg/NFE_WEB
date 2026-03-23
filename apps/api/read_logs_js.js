const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.certificateLog.findMany({
  orderBy: { createdAt: 'desc' },
  take: 5
}).then(logs => {
  console.log(JSON.stringify(logs, null, 2));
}).catch(console.error).finally(() => prisma.$disconnect());
