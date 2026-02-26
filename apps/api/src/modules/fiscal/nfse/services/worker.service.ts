import { prisma } from '../../../../index.js';
import { ProviderResolver } from '../config/provider.resolver.js';

// ── Structured log helper ─────────────────────────────────────────────────────
function workerLog(level: string, msg: string, data?: Record<string, any>) {
    console.log(JSON.stringify({ ts: new Date().toISOString(), level, service: 'NfsePollWorker', msg, ...data }));
}

// ── Worker state (exposed for monitoring) ─────────────────────────────────────
export const NFSE_WORKER_STATE = {
    lastRunAt: null as string | null,
    lastRunDurationMs: 0,
    processed: 0,
    errors: 0,
    totalRuns: 0,
    isRunning: false
};

export class NfsePollWorkerService {

    /**
     * Periodically queries the database for 'PROCESSING' NFS-e invoices
     * to resolve asynchronous batches/protocols against municipal endpoints.
     */
    static async processPendingBatches() {
        if (NFSE_WORKER_STATE.isRunning) return; // prevent overlap
        NFSE_WORKER_STATE.isRunning = true;
        const start = Date.now();
        let processed = 0;
        let errors = 0;

        try {
            const pendingInvoices = await prisma.nfseInvoice.findMany({
                where: { status: 'PROCESSING', protocolo: { not: null } },
                take: 50
            });

            workerLog('info', `Found ${pendingInvoices.length} pending NFS-e invoices`);

            for (const invoice of pendingInvoices) {
                try {
                    const adapter = await ProviderResolver.resolve(invoice.tenantId, invoice.companyId, invoice.cmun);
                    const queryResult = await adapter.queryBatch(invoice.protocolo!);

                    if (queryResult.status !== 'PROCESSING') {
                        await prisma.nfseInvoice.update({
                            where: { id: invoice.id },
                            data: {
                                status: queryResult.status,
                                numeroNfse: queryResult.numeroNfse,
                                codigoVerificacao: queryResult.codigoVerificacao,
                                xmlNfse: queryResult.xmlNfse,
                                rejectionCode: queryResult.rejectionCode,
                                rejectionMsg: queryResult.rejectionMessage
                            }
                        });

                        await prisma.nfseProviderLog.create({
                            data: {
                                tenantId: invoice.tenantId, companyId: invoice.companyId,
                                invoiceId: invoice.id, operation: 'QUERY_BATCH',
                                requestPayload: queryResult.rawRequest,
                                responsePayload: queryResult.rawResponse,
                                httpStatus: 200
                            }
                        });

                        processed++;
                        workerLog('info', `NFS-e ${invoice.id} resolved`, { status: queryResult.status, tenantId: invoice.tenantId });
                    }

                } catch (err: any) {
                    errors++;
                    workerLog('error', `Failed to query NFS-e ${invoice.id}`, { error: err.message, tenantId: invoice.tenantId });
                }
            }
        } catch (err: any) {
            errors++;
            workerLog('error', 'Worker batch query failed', { error: err.message });
        } finally {
            const durationMs = Date.now() - start;
            NFSE_WORKER_STATE.lastRunAt = new Date().toISOString();
            NFSE_WORKER_STATE.lastRunDurationMs = durationMs;
            NFSE_WORKER_STATE.processed += processed;
            NFSE_WORKER_STATE.errors += errors;
            NFSE_WORKER_STATE.totalRuns++;
            NFSE_WORKER_STATE.isRunning = false;

            workerLog('info', 'Worker run completed', { durationMs, processed, errors });
        }
    }
}

// ── Auto-start polling every 60 seconds on server boot ────────────────────────
setInterval(() => {
    NfsePollWorkerService.processPendingBatches().catch(console.error);
}, 60_000);

workerLog('info', 'Auto-status polling started (60s interval)');
