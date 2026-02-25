import { prisma } from '../../../../index.js';
import { ProviderResolver } from '../config/provider.resolver.js';

export class NfsePollWorkerService {

    /**
     * Periodically queries the database for 'PROCESSING' NFS-e invoices
     * to resolve asynchronous batches/protocols against municipal endpoints.
     */
    static async processPendingBatches() {
        const pendingInvoices = await prisma.nfseInvoice.findMany({
            where: { status: 'PROCESSING', protocolo: { not: null } },
            take: 50
        });

        for (const invoice of pendingInvoices) {
            try {
                // 1. Resolve targeting variables explicitly
                const adapter = await ProviderResolver.resolve(invoice.tenantId, invoice.companyId, invoice.cmun);

                // 2. Transmit consultation to provider asynchronously
                const queryResult = await adapter.queryBatch(invoice.protocolo!);

                // 3. Update locally when resolved
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

                    // Register final event log
                    await prisma.nfseProviderLog.create({
                        data: {
                            tenantId: invoice.tenantId, companyId: invoice.companyId,
                            invoiceId: invoice.id, operation: 'QUERY_BATCH',
                            requestPayload: queryResult.rawRequest,
                            responsePayload: queryResult.rawResponse,
                            httpStatus: 200
                        }
                    });
                }

            } catch (err: any) {
                console.error(`Falha ao consultar lote da NFSe ${invoice.id}:`, err);
            }
        }
    }
}

// In a real environment, you'd mount this to a cron-scheduler or a persistent running loop
// setInterval(() => NfsePollWorkerService.processPendingBatches(), 60000); // 1 minute
