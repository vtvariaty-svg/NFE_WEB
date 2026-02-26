import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../index.js';
import tenantMiddleware from '../tenant/tenant.middleware.js';

export async function fiscalOpsRoutes(app: FastifyInstance) {
    app.addHook('onRequest', app.authenticate);
    app.addHook('onRequest', tenantMiddleware);

    // ── 1. Enhanced Audit Logs (filterable) ───────────────────────────────────
    app.get('/audit', {
        schema: {
            querystring: z.object({
                action: z.string().optional(),
                userId: z.string().optional(),
                from: z.string().optional(),
                to: z.string().optional(),
                limit: z.string().optional()
            }).passthrough()
        }
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        const tenantId = (request as any).tenantId;
        const q = request.query as any;

        const where: any = { tenantId };
        if (q.action) where.action = q.action;
        if (q.userId) where.userId = q.userId;
        if (q.from || q.to) {
            where.createdAt = {};
            if (q.from) where.createdAt.gte = new Date(q.from);
            if (q.to) where.createdAt.lte = new Date(q.to);
        }

        const logs = await prisma.auditLog.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: parseInt(q.limit || '200')
        });

        return { data: logs, total: logs.length };
    });

    // ── 2. XML Backup — Download specific invoice XML ─────────────────────────
    app.get('/xml-backup/:invoiceId', async (request: FastifyRequest, reply: FastifyReply) => {
        const { invoiceId } = request.params as any;
        const tenantId = (request as any).tenantId;

        const archive = await prisma.legalArchive.findFirst({
            where: { invoiceId, tenantId }
        });

        if (!archive) return reply.status(404).send({ error: 'XML não encontrado para esta nota.' });

        // Return XML as downloadable file
        reply.header('Content-Type', 'application/xml');
        reply.header('Content-Disposition', `attachment; filename="nfe_${invoiceId}.xml"`);
        return Buffer.from(archive.xmlBase64, 'base64').toString('utf-8');
    });

    // ── 3. XML Backup — Bulk export (date range) ──────────────────────────────
    app.get('/xml-backup', {
        schema: {
            querystring: z.object({
                from: z.string().optional(),
                to: z.string().optional()
            }).passthrough()
        }
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        const tenantId = (request as any).tenantId;
        const q = request.query as any;

        const where: any = { tenantId };
        if (q.from || q.to) {
            where.createdAt = {};
            if (q.from) where.createdAt.gte = new Date(q.from);
            if (q.to) where.createdAt.lte = new Date(q.to);
        }

        const archives = await prisma.legalArchive.findMany({
            where,
            include: { invoice: { select: { id: true, type: true, status: true, chave44: true, nnf: true, createdAt: true } } },
            orderBy: { createdAt: 'desc' }
        });

        return {
            data: archives.map(a => ({
                id: a.id,
                invoiceId: a.invoiceId,
                chave44: a.invoice?.chave44,
                nnf: a.invoice?.nnf,
                type: a.invoice?.type,
                status: a.invoice?.status,
                createdAt: a.createdAt,
                hasXml: !!a.xmlBase64,
                hasPdf: !!a.pdfUrl
            })),
            total: archives.length
        };
    });

    // ── 4. SPED / Fiscal Reports ──────────────────────────────────────────────
    app.get('/sped', {
        schema: {
            querystring: z.object({
                month: z.string(), // MM
                year: z.string(),  // YYYY
                companyId: z.string().uuid()
            }).passthrough()
        }
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        const tenantId = (request as any).tenantId;
        const { month, year, companyId } = request.query as any;

        const startDate = new Date(`${year}-${month}-01`);
        const endDate = new Date(startDate);
        endDate.setMonth(endDate.getMonth() + 1);

        // Get company data
        const company = await prisma.company.findFirst({
            where: { id: companyId, tenantId }
        });
        if (!company) return reply.status(404).send({ error: 'Empresa não encontrada.' });

        // Get all authorized invoices for the period
        const invoices = await prisma.invoice.findMany({
            where: {
                tenantId,
                companyId,
                status: 'AUTHORIZED',
                createdAt: { gte: startDate, lt: endDate }
            },
            include: { items: true },
            orderBy: { nnf: 'asc' }
        });

        // Build SPED Fiscal structure (simplified EFD-ICMS/IPI format)
        const lines: string[] = [];

        // Block 0 — File identification
        lines.push(`|0000|016|0|${month}${year}|${startDate.toISOString().split('T')[0]}|${endDate.toISOString().split('T')[0]}|${company.name}|${company.document}|${company.state || ''}|${company.ibgeCode || ''}|${company.ie || ''}||||A|1|`);
        lines.push(`|0001|0|`); // Opening block 0
        lines.push(`|0005|${company.name}|${company.cPais}|${company.zipCode || ''}|${company.street || ''}|${company.number || ''}|${company.complement || ''}|${company.district || ''}|${company.phone || ''}|||`);

        // Block C — Fiscal documents (NF-e)
        lines.push(`|C001|0|`); // Opening block C
        for (const inv of invoices) {
            lines.push(`|C100|0|1|${company.document}|55|00|${inv.serie || ''}|${inv.nnf || ''}|${inv.chave44 || ''}|${inv.createdAt.toISOString().split('T')[0]}|${inv.createdAt.toISOString().split('T')[0]}|${(inv as any).total || 0}|0|0|${(inv as any).total || 0}|9|0|0|0|0|0|0|0|0|0|0|0|0|0|`);

            // C170 — Items
            if (inv.items) {
                for (let i = 0; i < inv.items.length; i++) {
                    const item = inv.items[i] as any;
                    lines.push(`|C170|${i + 1}|${item.code || item.productId || ''}|${item.description || ''}|${item.quantity || 0}|${item.unit || 'UN'}|${item.unitPrice || 0}|0|${item.cfop || '5102'}|${item.ncm || ''}|${item.total || 0}|0|0|0|0|0|0|0|0|0|0|0|`);
                }
            }
        }
        lines.push(`|C990|${invoices.length + 2}|`); // Closing block C

        // Block H — Physical inventory (stub)
        lines.push(`|H001|1|`); // No inventory data
        lines.push(`|H990|2|`);

        // Block 9 — Control & totals
        lines.push(`|9001|0|`);
        lines.push(`|9900|0000|1|`);
        lines.push(`|9900|C100|${invoices.length}|`);
        lines.push(`|9990|${lines.length + 2}|`);
        lines.push(`|9999|${lines.length + 1}|`);

        const spedContent = lines.join('\r\n');

        // Log the export
        await prisma.auditLog.create({
            data: {
                tenantId,
                userId: (request as any).user?.sub,
                action: 'SPED_EXPORT',
                resourceId: companyId,
                metadata: JSON.stringify({ month, year, invoiceCount: invoices.length })
            }
        });

        // Return as downloadable TXT file
        reply.header('Content-Type', 'text/plain; charset=utf-8');
        reply.header('Content-Disposition', `attachment; filename="SPED_${company.document}_${year}${month}.txt"`);
        return spedContent;
    });

    // ── 5. Fiscal Summary Report (JSON) ───────────────────────────────────────
    app.get('/report', {
        schema: {
            querystring: z.object({
                month: z.string(),
                year: z.string(),
                companyId: z.string().uuid().optional()
            }).passthrough()
        }
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        const tenantId = (request as any).tenantId;
        const { month, year, companyId } = request.query as any;

        const startDate = new Date(`${year}-${month}-01`);
        const endDate = new Date(startDate);
        endDate.setMonth(endDate.getMonth() + 1);

        const where: any = {
            tenantId,
            createdAt: { gte: startDate, lt: endDate }
        };
        if (companyId) where.companyId = companyId;

        const invoices = await prisma.invoice.findMany({
            where,
            select: { id: true, type: true, status: true, nnf: true, chave44: true, createdAt: true }
        });

        const summary = {
            period: `${month}/${year}`,
            totalInvoices: invoices.length,
            byStatus: {
                authorized: invoices.filter(i => i.status === 'AUTHORIZED').length,
                canceled: invoices.filter(i => i.status === 'CANCELED').length,
                rejected: invoices.filter(i => i.status === 'REJECTED').length,
                processing: invoices.filter(i => i.status === 'PROCESSING').length,
                draft: invoices.filter(i => i.status === 'DRAFT').length
            },
            byType: {
                nfe: invoices.filter(i => i.type === 'NFE').length,
                nfse: invoices.filter(i => i.type === 'NFSE').length
            },
            invoices
        };

        return summary;
    });

    // ── 6. Environment Toggle (Homologação ↔ Produção) ────────────────────────
    app.get('/environment/:companyId', async (request: FastifyRequest, reply: FastifyReply) => {
        const { companyId } = request.params as any;
        const tenantId = (request as any).tenantId;

        const company = await prisma.company.findFirst({
            where: { id: companyId, tenantId }
        }) as any;
        if (!company) return reply.status(404).send({ error: 'Empresa não encontrada.' });

        return {
            companyId: company.id,
            companyName: company.name,
            environment: company.tpAmbDefault === '1' ? 'PRODUÇÃO' : 'HOMOLOGAÇÃO',
            tpAmb: company.tpAmbDefault,
            contingencia: company.contingenciaAtiva,
            tpEmisContingencia: company.tpEmisContingencia
        };
    });

    app.put('/environment/:companyId', {
        schema: {
            params: z.object({ companyId: z.string().uuid() }),
            body: z.object({
                tpAmb: z.enum(['1', '2']), // 1=Produção, 2=Homologação
            })
        }
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        const { companyId } = request.params as any;
        const { tpAmb } = request.body as any;
        const tenantId = (request as any).tenantId;

        const company = await prisma.company.findFirst({ where: { id: companyId, tenantId } });
        if (!company) return reply.status(404).send({ error: 'Empresa não encontrada.' });

        await prisma.company.update({
            where: { id: companyId },
            data: { tpAmbDefault: tpAmb }
        });

        // Audit log
        await prisma.auditLog.create({
            data: {
                tenantId,
                userId: (request as any).user?.sub,
                action: 'ENVIRONMENT_CHANGE',
                resourceId: companyId,
                metadata: JSON.stringify({
                    from: company.tpAmbDefault === '1' ? 'PRODUÇÃO' : 'HOMOLOGAÇÃO',
                    to: tpAmb === '1' ? 'PRODUÇÃO' : 'HOMOLOGAÇÃO'
                })
            }
        });

        return {
            message: `Ambiente alterado para ${tpAmb === '1' ? 'PRODUÇÃO' : 'HOMOLOGAÇÃO'}`,
            tpAmb,
            warning: tpAmb === '1' ? '⚠️ ATENÇÃO: Notas emitidas em PRODUÇÃO têm validade fiscal real!' : null
        };
    });
}
