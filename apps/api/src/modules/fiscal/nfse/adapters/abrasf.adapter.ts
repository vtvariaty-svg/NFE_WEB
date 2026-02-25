import { INfseAdapter, InvoiceRequestDTO, NfseAdapterResponse } from './base.adapter.js';
import { NfseSoapClient } from '../clients/soap.client.js';

export class AbrasfAdapter implements INfseAdapter {
    private client: NfseSoapClient;
    private config: any;

    constructor(municipalConfig: any) {
        this.config = municipalConfig;
        this.client = new NfseSoapClient({
            wsdlUrl: municipalConfig.wsdlUrl,
            // PFX will be injected here during the emission orchestration
        });
    }

    async issueNfse(payload: InvoiceRequestDTO, sequence: { serie: string; numero: number }): Promise<NfseAdapterResponse> {
        // TODO: Implement ABRASF specific XML generation (RecepcionarLoteRps)
        // TODO: Implement XMLDSIG signing using Certificate
        // TODO: Wrap into SOAP Envelope and call this.client.send()
        throw new Error('Emissão ABRASF ainda não implementada completamente.');
    }

    async cancelNfse(numeroNfse: string, codigoCancelamento: string, justificativa: string): Promise<NfseAdapterResponse> {
        throw new Error('Cancelamento ABRASF ainda não implementado.');
    }

    async queryBatch(protocolo: string): Promise<NfseAdapterResponse> {
        throw new Error('Consulta de Lote ABRASF ainda não implementada.');
    }

    async queryByRps(serie: string, numero: number): Promise<NfseAdapterResponse> {
        throw new Error('Consulta de RPS ABRASF ainda não implementada.');
    }

    async status(): Promise<{ online: boolean; message: string; }> {
        return { online: true, message: 'Simulated Fast Status' };
    }
}
