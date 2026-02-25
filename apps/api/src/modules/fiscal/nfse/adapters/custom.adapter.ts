import { INfseAdapter, InvoiceRequestDTO, NfseAdapterResponse } from './base.adapter.js';

export class CustomAdapter implements INfseAdapter {
    private config: any;

    constructor(municipalConfig: any) {
        this.config = municipalConfig;
    }

    async issueNfse(payload: InvoiceRequestDTO, sequence: { serie: string; numero: number }): Promise<NfseAdapterResponse> {
        throw new Error('Emissão Proprietária Customizada (WebISS/Ginfes/Betha) ainda não mapeada no builder.');
    }

    async cancelNfse(numeroNfse: string, codigoCancelamento: string, justificativa: string): Promise<NfseAdapterResponse> {
        throw new Error('Method not implemented.');
    }

    async queryBatch(protocolo: string): Promise<NfseAdapterResponse> {
        throw new Error('Method not implemented.');
    }

    async queryByRps(serie: string, numero: number): Promise<NfseAdapterResponse> {
        throw new Error('Method not implemented.');
    }

    async status(): Promise<{ online: boolean; message: string; }> {
        throw new Error('Method not implemented.');
    }
}
