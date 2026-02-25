import { prisma } from '../../../../index.js';

export class NfseTaxService {

    /**
     * Records the calculated taxes into the Invoice after successful math validation.
     * This creates the relational persistence required for future reporting and exports.
     */
    static async recordTaxes(invoiceId: string, taxData: {
        issRetido: boolean;
        baseCalculo: number;
        aliquota: number;
        valorIss: number;
        deducoes: number;
        descontoIncondicionado: number;
        descontoCondicionado: number;
        valorLiquido: number;
    }) {
        return prisma.nfseTax.create({
            data: {
                invoiceId,
                issRetido: taxData.issRetido,
                baseCalculo: taxData.baseCalculo,
                aliquota: taxData.aliquota,
                valor: taxData.valorIss,
                deducoes: taxData.deducoes,
                descontoIncondicionado: taxData.descontoIncondicionado,
                descontoCondicionado: taxData.descontoCondicionado,
                valorLiquido: taxData.valorLiquido
            }
        });
    }
}
