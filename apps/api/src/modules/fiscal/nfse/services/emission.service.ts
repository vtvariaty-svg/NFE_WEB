import { prisma } from '../../../../index.js';
import { nfseIssueSchema } from '../validation/nfse.schema.js';
import { NfseSequenceService } from './sequence.service.js';
import { NfseTaxService } from './tax.service.js';
import { ProviderResolver } from '../config/provider.resolver.js';
import { InvoiceRequestDTO } from '../adapters/base.adapter.js';

export class NfseEmissionService {

    static async issue(tenantId: string, companyId: string, payload: InvoiceRequestDTO) {
        const validatedPayload = nfseIssueSchema.parse(payload);

        const company = await prisma.company.findFirst({
            where: { id: companyId, tenantId },
            include: { certificates: true }
        });
        if (!company) throw new Error('Empresa(Prestador) não encontrada no Tenant.');

        const ibgeCode = company.ibgeCode;
        if (!ibgeCode) throw new Error('A empresa não possui um código IBGE municipal (cmun) configurado.');

        const config = await prisma.nfseMunicipalConfig.findFirst({
            where: { tenantId, companyId, cmun: ibgeCode },
            include: { provider: true }
        });
        if (!config) throw new Error(`Configure o município ${ibgeCode} antes de emitir NFS-e.`);

        const adapter = await ProviderResolver.resolve(tenantId, companyId, ibgeCode);

        const rpsSerie = '1';
        const rpsNumero = await NfseSequenceService.nextRpsNumber(tenantId, companyId, rpsSerie);

        const invoice = await prisma.nfseInvoice.create({
            data: {
                tenantId,
                companyId,
                providerId: config.providerId,
                cmun: ibgeCode,
                serieRps: rpsSerie,
                numeroRps: rpsNumero,
                tipoRps: '1',
                status: 'DRAFT'
            }
        });

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

        try {
            await prisma.nfseInvoice.update({ where: { id: invoice.id }, data: { status: 'SENT' } });

            const response = await adapter.issueNfse(
                { ...validatedPayload, tenantId, companyId },
                { serie: rpsSerie, numero: rpsNumero }
            );

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

            await prisma.nfseProviderLog.create({
                data: {
                    tenantId, companyId, invoiceId: invoice.id, operation: 'ISSUE',
                    requestPayload: response.rawRequest,
                    responsePayload: response.rawResponse,
                    httpStatus: 200
                }
            });

            return { success: true, invoiceId: invoice.id, status: response.status, data: response };

        } catch (error: any) {
            // Mark as ERROR and store the reason for retry
            await prisma.nfseInvoice.update({
                where: { id: invoice.id },
                data: {
                    status: 'ERROR',
                    rejectionCode: 'COM_ERR',
                    rejectionMsg: error.message
                }
            });
            await prisma.nfseProviderLog.create({
                data: {
                    tenantId, companyId, invoiceId: invoice.id, operation: 'ISSUE_ERROR',
                    requestPayload: null,
                    responsePayload: error.message,
                    httpStatus: 500
                }
            });
            throw error;
        }
    }
}

// ─── Cancel ──────────────────────────────────────────────────────────────────

export class NfseCancelService {
    static async cancel(tenantId: string, invoiceId: string, codigoCancelamento: string, justificativa: string) {
        if (justificativa.length < 15) throw new Error('Justificativa deve ter no mínimo 15 caracteres.');

        const invoice = await prisma.nfseInvoice.findFirstOrThrow({ where: { id: invoiceId, tenantId } });
        if (invoice.status !== 'ISSUED') throw new Error('Apenas NFS-e com status ISSUED podem ser canceladas.');
        if (!invoice.numeroNfse) throw new Error('Número da NFS-e não encontrado. Aguarde autorização.');

        const companyId: string = invoice.companyId;
        const cmun: string = invoice.cmun;

        const adapter = await ProviderResolver.resolve(tenantId, companyId, cmun);
        const response = await adapter.cancelNfse(invoice.numeroNfse, codigoCancelamento, justificativa);

        if (response.success) {
            await prisma.nfseInvoice.update({
                where: { id: invoiceId },
                data: { status: 'CANCELED' }
            });
            await prisma.nfseEvent.create({
                data: {
                    tenantId, companyId, invoiceId,
                    eventType: 'CANCEL',
                    eventPayloadSent: JSON.stringify({ codigoCancelamento, justificativa }),
                    eventPayloadResp: response.rawResponse ?? null,
                    status: 'OK'
                }
            });
        } else {
            await prisma.nfseEvent.create({
                data: {
                    tenantId, companyId, invoiceId,
                    eventType: 'CANCEL_FAILED',
                    eventPayloadSent: JSON.stringify({ codigoCancelamento, justificativa }),
                    eventPayloadResp: response.rawResponse ?? null,
                    status: 'ERROR'
                }
            });
        }

        return response;
    }
}

// ─── Substituição ─────────────────────────────────────────────────────────────

export class NfseSubstitutionService {
    /**
     * Cancela a NFS-e original e emite uma nova em seu lugar.
     * Returns both the cancellation result and the new invoice.
     */
    static async substitute(
        tenantId: string,
        originalInvoiceId: string,
        codigoCancelamento: string,
        justificativa: string,
        newPayload: InvoiceRequestDTO
    ) {
        // 1. Cancel the original
        const cancelResult = await NfseCancelService.cancel(tenantId, originalInvoiceId, codigoCancelamento, justificativa);
        if (!cancelResult.success) {
            return { success: false, error: `Cancelamento falhou: ${cancelResult.rejectionMessage}`, cancelResult };
        }

        // 2. Get original invoice info to copy companyId
        const original = await prisma.nfseInvoice.findFirstOrThrow({ where: { id: originalInvoiceId, tenantId } });

        // 3. Issue new NFS-e
        const issueResult = await NfseEmissionService.issue(tenantId, original.companyId, newPayload);

        // 4. Link substitution
        if (issueResult.invoiceId) {
            await prisma.nfseInvoice.update({
                where: { id: issueResult.invoiceId },
                data: { substituteOfId: originalInvoiceId }
            });
        }

        return { success: true, cancelResult, newInvoice: issueResult };
    }
}
