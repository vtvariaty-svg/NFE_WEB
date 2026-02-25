export interface InvoiceRequestDTO {
    tenantId: string;
    companyId: string;
    orderId?: string;
    // Basic service details
    servico: {
        descricao: string;
        codigoServicoMunicipal?: string;
        itemListaServico?: string;
        cnae?: string;
        cmunIncidencia: string;
        valores: {
            valorServicos: number;
            valorDeducoes: number;
            descontoIncondicionado: number;
            descontoCondicionado: number;
            baseCalculo: number;
            aliquota: number;
            valorIss: number;
            issRetido: boolean;
            valorLiquido: number;
        };
    };
    tomador: {
        documento: string; // CPF/CNPJ
        nomeRazao: string;
        im?: string;
        email?: string;
        telefone?: string;
        endereco: {
            logradouro: string;
            numero: string;
            complemento?: string;
            bairro: string;
            cmun: string;
            uf: string;
            cep: string;
        };
    };
}

export interface NfseAdapterResponse {
    success: boolean;
    numeroNfse?: string;
    codigoVerificacao?: string;
    protocolo?: string;
    loteId?: string;
    status: 'ISSUED' | 'PROCESSING' | 'REJECTED' | 'DRAFT' | 'SENT';
    xmlNfse?: string;
    rejectionCode?: string;
    rejectionMessage?: string;
    rawRequest?: string;
    rawResponse?: string;
}

/**
 * Base abstract interface defining the contract that every municipal adapter (ABRASF, Nacional, etc) must respect.
 */
export interface INfseAdapter {
    /**
     * Executes the generation, optional signing and network communication to transmit a new NFS-e.
     */
    issueNfse(payload: InvoiceRequestDTO, sequence: { serie: string; numero: number }): Promise<NfseAdapterResponse>;

    /**
     * Cancels an already issued NFS-e.
     */
    cancelNfse(numeroNfse: string, codigoCancelamento: string, justificativa: string): Promise<NfseAdapterResponse>;

    /**
     * Queries an asynchronous protocol or batch id.
     */
    queryBatch(protocolo: string): Promise<NfseAdapterResponse>;

    /**
     * Fallback to query status specifically by RPS Number when the city doesn't provide protocols properly.
     */
    queryByRps(serie: string, numero: number): Promise<NfseAdapterResponse>;

    /**
     * Checks if the WebService for this provider is online.
     */
    status(): Promise<{ online: boolean; message: string }>;
}
