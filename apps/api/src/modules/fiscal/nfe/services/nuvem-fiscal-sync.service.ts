/**
 * NuvemFiscalSyncService — background worker for async status resolution.
 *
 * Polls Invoice records whose emission was handled by Nuvem Fiscal and whose
 * status is still SENT (i.e., em_processamento / not yet resolved).
 *
 * Pattern mirrors NfsePollWorkerService (worker.service.ts).
 * Auto-starts via setInterval at module load — import once in index.ts.
 */
import { prisma } from '../../../../index.js';
import { NuvemFiscalProvider } from '../../providers/nuvemFiscal/index.js';

// ── Status mapping (Nuvem Fiscal raw → Invoice.status) ────────────────────────

const NF_STATUS_TO_INVOICE: Record<string, string> = {
    em_processamento: 'SENT',
    autorizado:       'AUTHORIZED',
    rejeitado:        'REJECTED',
    cancelado:        'CANCELED',
    denegado:         'REJECTED',   // SEFAZ denial — treat as rejected
    erro_autorizacao: 'ERROR',
};

function mapToInvoiceStatus(raw: string): string {
    return NF_STATUS_TO_INVOICE[raw] ?? 'SENT';
}

/** Returns true when the status is final and should not be polled again. */
function isFinalStatus(invoiceStatus: string): boolean {
    return ['AUTHORIZED', 'REJECTED', 'CANCELED', 'ERROR'].includes(invoiceStatus);
}

// ── Structured logger ─────────────────────────────────────────────────────────

function syncLog(level: string, msg: string, data?: Record<string, unknown>) {
    console.log(JSON.stringify({
        ts:      new Date().toISOString(),
        level,
        service: 'NuvemFiscalSyncWorker',
        msg,
        ...data
    }));
}

// ── Worker state ──────────────────────────────────────────────────────────────

export const NUVEM_FISCAL_SYNC_STATE = {
    lastRunAt:        null as string | null,
    lastRunDurationMs: 0,
    processed:        0,
    errors:           0,
    totalRuns:        0,
    isRunning:        false
};

// ── Sync service ──────────────────────────────────────────────────────────────

export class NuvemFiscalSyncService {

    /**
     * Finds all Invoice records with providerName='nuvem_fiscal' and status='SENT',
     * queries Nuvem Fiscal for each, and updates the local record when the status
     * has moved to a final state.
     *
     * Processes up to 50 invoices per run to avoid overloading the API.
     * Overlap-safe: skips if a run is already in progress.
     */
    static async syncPendingInvoices(): Promise<void> {
        if (NUVEM_FISCAL_SYNC_STATE.isRunning) return;
        NUVEM_FISCAL_SYNC_STATE.isRunning = true;

        const start = Date.now();
        let processed = 0;
        let errors    = 0;

        try {
            const pending = await prisma.invoice.findMany({
                where: {
                    providerName:      'nuvem_fiscal',
                    status:            'SENT',
                    providerInvoiceId: { not: null }
                },
                select: {
                    id:                true,
                    tenantId:          true,
                    companyId:         true,
                    providerInvoiceId: true,
                    providerReference: true,
                },
                take: 50,
                orderBy: { createdAt: 'asc' }
            });

            if (pending.length > 0) {
                syncLog('info', `Syncing ${pending.length} pending Nuvem Fiscal invoice(s)`);
            }

            const provider = new NuvemFiscalProvider();

            for (const invoice of pending) {
                try {
                    const nfResult = await provider.getNfeById(invoice.providerInvoiceId!);

                    const newInvoiceStatus = mapToInvoiceStatus(nfResult.status);

                    // Only write if status changed (avoids unnecessary DB writes)
                    if (!isFinalStatus(newInvoiceStatus)) continue;

                    await prisma.invoice.update({
                        where: { id: invoice.id },
                        data: {
                            status:          newInvoiceStatus,
                            providerStatus:  nfResult.status,
                            // Populate SEFAZ fields when provider returns them
                            ...(nfResult.chave              ? { chave44:      nfResult.chave              } : {}),
                            ...(nfResult.numero_protocolo   ? { protNprot:    nfResult.numero_protocolo   } : {}),
                            ...(nfResult.data_autorizacao   ? { protDhrecbto: nfResult.data_autorizacao   } : {}),
                            ...(nfResult.mensagem_sefaz && newInvoiceStatus !== 'AUTHORIZED'
                                ? { rejectionMsg: nfResult.mensagem_sefaz }
                                : {}),
                            ...(nfResult.codigo_sefaz && newInvoiceStatus !== 'AUTHORIZED'
                                ? { rejectionCode: nfResult.codigo_sefaz }
                                : {}),
                        }
                    });

                    processed++;
                    syncLog('info', `Invoice ${invoice.id} resolved`, {
                        tenantId:          invoice.tenantId,
                        providerInvoiceId: invoice.providerInvoiceId,
                        oldStatus:         'SENT',
                        newStatus:         newInvoiceStatus,
                        providerStatus:    nfResult.status
                    });

                } catch (err: any) {
                    errors++;
                    syncLog('error', `Failed to sync invoice ${invoice.id}`, {
                        tenantId:          invoice.tenantId,
                        providerInvoiceId: invoice.providerInvoiceId,
                        error:             err.message
                    });
                }
            }

        } catch (err: any) {
            errors++;
            syncLog('error', 'Sync worker batch query failed', { error: err.message });
        } finally {
            const durationMs = Date.now() - start;

            NUVEM_FISCAL_SYNC_STATE.lastRunAt         = new Date().toISOString();
            NUVEM_FISCAL_SYNC_STATE.lastRunDurationMs = durationMs;
            NUVEM_FISCAL_SYNC_STATE.processed        += processed;
            NUVEM_FISCAL_SYNC_STATE.errors           += errors;
            NUVEM_FISCAL_SYNC_STATE.totalRuns++;
            NUVEM_FISCAL_SYNC_STATE.isRunning         = false;

            if (processed > 0 || errors > 0) {
                syncLog('info', 'Sync run completed', { durationMs, processed, errors });
            }
        }
    }
}

// ── Auto-start polling ────────────────────────────────────────────────────────
// Interval controlled by NUVEM_FISCAL_SYNC_INTERVAL_MS (default: 60 s).
// Only activates when Nuvem Fiscal is enabled.

const isNuvemFiscalActive =
    process.env.NUVEM_FISCAL_ENABLED === 'true' ||
    process.env.FISCAL_PROVIDER === 'nuvem_fiscal';

const SYNC_INTERVAL_MS = Number(process.env.NUVEM_FISCAL_SYNC_INTERVAL_MS ?? 60_000);

if (isNuvemFiscalActive) {
    setInterval(() => {
        NuvemFiscalSyncService.syncPendingInvoices().catch((err) => {
            syncLog('error', 'Unhandled sync worker error', { error: err.message });
        });
    }, SYNC_INTERVAL_MS);

    syncLog('info', `Nuvem Fiscal sync polling started (${SYNC_INTERVAL_MS}ms interval)`);
}
