const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const jwt = require('jsonwebtoken');

async function test() {
    // get a global admin
    const admin = await prisma.user.findFirst({ where: { isGlobalAdmin: true } });
    if (!admin) {
        console.log("No admin found");
        return;
    }
    const token = jwt.sign({ sub: admin.id }, process.env.JWT_SECRET || 'supersecret');
    
    // get a tenant
    const tenant = await prisma.tenant.findFirst();
    const plan = await prisma.plan.findFirst();
    
    try {
        const res = await axios.put(`http://127.0.0.1:3333/admin/tenants/${tenant.id}/plan`, {
            planId: plan.id
        }, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });
        console.log("SUCCESS:", res.data);
    } catch (e) {
        console.error("ERROR:");
        console.error(e.response ? e.response.data : e.message);
    }
}
test();
