import { prisma } from '../../../../index.js';
import { nfseIssueSchema } from '../validation/nfse.schema.js';
import { NfseSequenceService } from './sequence.service.js';
import { NfseTaxService } from './tax.service.js';
import { ProviderResolver } from '../config/provider.resolver.js';
import { InvoiceRequestDTO } from '../adapters/base.adapter.js';

export class NfseEmissionService {

    /**
     * The master orchestrator for issuing a new NFS-e from the SaaS environment to the city provider.
     */
    static async issue(tenantId: string, companyId: string, payload: InvoiceRequestDTO) {
        // 1. Validate payload structure and ISS math via Zod
        const validatedPayload = nfseIssueSchema.parse(payload);

        // 2. Resolve target company
        const company = await prisma.company.findFirst({
            where: { id: companyId, tenantId },
            include: { certificate: true }
        });

        if (!company) throw new Error('Empresa(Prestador) não encontrada no Tenant.');

        // 3. Resolve target Provider Adapter (dynamically fetches configs and decrypts credentials)
        // cmunIncidencia is where the service occurred, but for ABRASF we usually send to the Prestador's city.
        // The rule depends on the city, but here we'll use the Prestador's IBGE code.
        const ibgeCode = company.ibgeCode;
        if (!ibgeCode) throw new Error('A empresa não possui um código IBGE municipal (cmun) configurado.');

        const adapter = await ProviderResolver.resolve(tenantId, companyId, ibgeCode);

        // 4. Generate next RPS Sequence atomically
        const rpsSerie = '1'; // Defaulting for simplicity, could be dynamic
        const rpsNumero = await NfseSequenceService.nextRpsNumber(tenantId, companyId, rpsSerie);

        // 5. Create Draft Invoice Record
        const invoice = await prisma.nfseInvoice.create({
            data: {
                tenantId,
                companyId,
                providerId: (await prisma.nfseProvider.findFirst())?.id || 'unknown', // Fallback, normally you get this from config
                cmun: ibgeCode,
                serieRps: rpsSerie,
                numeroRps: rpsNumero,
                tipoRps: '1',
                status: 'DRAFT'
            }
        });

        // 6. Record Computed Taxes
        await NfseTaxService.recordTaxes(invoice.id, {
            issRetido: validatedPayload.servico.valores.issRetido,
            baseCalculo: validatedPayload.servico.valores.baseCalculo,
            aliquota: validatedPayload.servico.valores.aliquota,
            valorIss: validatedPayload.servico.valores.valorIss,
            deducoes: validatedPayload.servico.valores.valorDeducoes,
            descontoIncondicionado: validatedPayload.servico.valores.descontoIncondicionado,
            descontoCondicionado: validatedPayload.servico.valores.descontoCondicionado,
            valorLiquido: validatedPayload.servico.valores.valorLiquido
        });

        // 7. Hand over to Adapter for Building, Signing and Transmission
        try {
            const response = await adapter.issueNfse({ ...validatedPayload, tenantId, companyId }, { serie: rpsSerie, numero: rpsNumero });

            // 8. Update DB with result
            await prisma.nfseInvoice.update({
                where: { id: invoice.id },
                data: {
                    status: response.status,
                    numeroNfse: response.numeroNfse,
                    codigoVerificacao: response.codigoVerificacao,
                    protocolo: response.protocolo,
                    loteId: response.loteId,
                    xmlNfse: response.xmlNfse,
                    payloadSent: response.rawRequest,
                    payloadResponse: response.rawResponse,
                    rejectionCode: response.rejectionCode,
                    rejectionMsg: response.rejectionMessage
                }
            });

            // 9. Log Operation
            await prisma.nfseProviderLog.create({
                data: {
                    tenantId, companyId, invoiceId: invoice.id, operation: 'ISSUE',
                    requestPayload: response.rawRequest,
                    responsePayload: response.rawResponse,
                    httpStatus: 200 // Mocking, adapter would return this
                }
            });

            return { success: true, invoiceId: invoice.id, status: response.status, data: response };

        } catch (error: any) {
            // 8b. Capture critical failure
            await prisma.nfseInvoice.update({
                where: { id: invoice.id },
                data: {
                    status: 'REJECTED',
                    rejectionMsg: error.message
                }
            });

            throw error;
        }
    }
}
