import { INfseAdapter, InvoiceRequestDTO, NfseAdapterResponse } from './base.adapter.js';
import { NfseRestClient } from '../clients/rest.client.js';

export class NacionalAdapter implements INfseAdapter {
    private client: NfseRestClient;
    private config: any;

    constructor(municipalConfig: any) {
        this.config = municipalConfig;

        let token = undefined;
        if (municipalConfig.credentials && municipalConfig.credentials.token) {
            token = municipalConfig.credentials.token;
        }

        this.client = new NfseRestClient({
            baseURL: municipalConfig.endpointBase || 'https://api.nfse.gov.br/v1',
            token
        });
    }

    async issueNfse(payload: InvoiceRequestDTO, sequence: { serie: string; numero: number }): Promise<NfseAdapterResponse> {
        // TODO: Map to Padrão Nacional JSON Schema DPS (Declaração de Prestação de Serviço)
        // TODO: Send via REST
        throw new Error('Emissão Padrão Nacional (Sefin Nacional) não implementada completamente.');
    }

    async cancelNfse(numeroNfse: string, codigoCancelamento: string, justificativa: string): Promise<NfseAdapterResponse> {
        throw new Error('Cancelamento Nacional ainda não implementado.');
    }

    async queryBatch(protocolo: string): Promise<NfseAdapterResponse> {
        throw new Error('Consulta de Lote Padrão Nacional não aplicável/implementada.');
    }

    async queryByRps(serie: string, numero: number): Promise<NfseAdapterResponse> {
        throw new Error('Consulta de DPS Nacional ainda não implementada.');
    }

    async status(): Promise<{ online: boolean; message: string; }> {
        return { online: true, message: 'Simulated Fast Status' };
    }
}
