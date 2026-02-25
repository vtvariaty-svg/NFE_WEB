import { prisma } from '../../../../index.js';

export class NfseSequenceService {

    /**
     * Retrieves and atomically increments the RPS sequence for a given company/serie.
     * Guaranteed safe across concurrent calls via Prisma's increment payload locking strategy.
     */
    static async nextRpsNumber(tenantId: string, companyId: string, serieRps: string): Promise<number> {
        const sequence = await prisma.nfseRpsSequence.upsert({
            where: {
                tenantId_companyId_serieRps: {
                    tenantId,
                    companyId,
                    serieRps
                }
            },
            update: {
                lastRps: { increment: 1 }
            },
            create: {
                tenantId,
                companyId,
                serieRps,
                lastRps: 1
            }
        });

        return sequence.lastRps;
    }
}
