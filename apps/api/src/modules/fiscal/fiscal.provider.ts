export interface NFePayload {
    natureza_operacao: string;
    data_emissao: string;
    tipo_documento: number; // 1 = Saída, 0 = Entrada
    finalidade_emissao: number; // 1 = Normal
    cnpj_emitente: string;
    inscricao_estadual_emitente: string;
    nome_emitente: string;
    nome_fantasia_emitente: string;
    logradouro_emitente: string;
    numero_emitente: string;
    bairro_emitente: string;
    municipio_emitente: string;
    uf_emitente: string;
    cep_emitente: string;
    ie_emitente?: string;   // Inscrição Estadual do emitente (SEFAZ tag IE)

    // Destinatário
    nome_destinatario: string;
    cpf_cnpj_destinatario: string;
    inscricao_estadual_destinatario?: string;
    logradouro_destinatario: string;
    numero_destinatario: string;
    bairro_destinatario: string;
    municipio_destinatario: string;
    uf_destinatario: string;
    cep_destinatario: string;

    items: Array<{
        numero_item: number;
        codigo_produto: string;
        descricao: string;
        cfop: string;
        unidade_comercial: string;
        quantidade_comercial: number;
        valor_unitario_comercial: number;
        valor_bruto: number;
        icms_origem: string;
        icms_situacao_tributaria: string;
        pis_situacao_tributaria: string;
        cofins_situacao_tributaria: string;
        /** NCM/SH code — required by Nuvem Fiscal and SEFAZ for NF-e emission. */
        ncm?: string;
    }>;

    // ── Extended fields required for Nuvem Fiscal emission ───────────────────
    // These fields exist in the domain (Company.ibgeCode, Customer.ibgeCode)
    // but are not always carried through the legacy FocusNFe payload.
    // All optional here to remain backward-compatible with FocusNfeProvider.

    /** IBGE 7-digit city code for the emitente address. Source: Company.ibgeCode */
    ibge_code_emitente?: string;
    /** IBGE 7-digit city code for the destinatário address. Source: Customer.ibgeCode */
    ibge_code_destinatario?: string;
    /**
     * Stable business reference for idempotency and traceability.
     * Must be unique per business transaction and stable across retries.
     * Required by Nuvem Fiscal. If absent, adaptPayload() will throw.
     */
    referencia?: string;
    /**
     * Indicador do tipo de destinatário:
     *   'consumidor_final' — CPF / non-IE contributor
     *   'contribuinte_icms' — CNPJ with IE
     * If absent, adaptPayload() will infer from CPF (11 digits) vs CNPJ (14 digits).
     * Provide explicitly to override inference.
     */
    tipo_destinatario?: 'consumidor_final' | 'contribuinte_icms' | 'produtor_rural';
}

export interface IFiscalProvider {
    issueNFe(payload: NFePayload): Promise<{ status: string, externalId: string, message?: string }>;
    consultNFe(externalId: string): Promise<{ status: string, xmlUrl?: string, pdfUrl?: string }>;
    cancelNFe(externalId: string, reason: string): Promise<boolean>;

    // Optional extended operations — providers may implement these
    downloadXml?(externalId: string): Promise<string>;
    sendEmail?(externalId: string, email: string): Promise<void>;
}

export class FocusNfeProvider implements IFiscalProvider {
    private apiKey: string;
    private isSandbox: boolean;

    constructor(apiKey: string, isSandbox = true) {
        this.apiKey = apiKey;
        this.isSandbox = isSandbox;
    }

    async issueNFe(payload: NFePayload) {
        console.log(`[FocusNFeProvider] Sending NFe for ${payload.nome_emitente} to API...`);
        // Real implementation would do:
        // const response = await axios.post('https://api.focusnfe.com.br/v2/nfe', payload, { auth: { username: this.apiKey, password: '' } });

        return {
            status: 'PROCESSANDO', // FocusNFe is asynchronous
            externalId: `fcs-${Date.now()}`
        };
    }

    async consultNFe(externalId: string) {
        console.log(`[FocusNFeProvider] Consulting NFe ${externalId}`);
        // Real implementation polls FocusNFe API for 'autorizado'
        return {
            status: 'AUTORIZADO',
            xmlUrl: 'https://cdn.focusnfe.com.br/arquivos/mock-xml.xml',
            pdfUrl: 'https://cdn.focusnfe.com.br/arquivos/mock-danfe.pdf'
        };
    }

    async cancelNFe(externalId: string, reason: string) {
        console.log(`[FocusNFeProvider] Canceling NFe ${externalId} for reason: ${reason}`);
        return true;
    }
}

export function getFiscalProvider(tenantId: string): IFiscalProvider {
    const isNuvemFiscal = process.env.NUVEM_FISCAL_ENABLED === 'true' || process.env.FISCAL_PROVIDER === 'nuvem_fiscal';
    if (isNuvemFiscal) {
        const { getNuvemFiscalProvider } = require('./providers/nuvemFiscal/index.js');
        return getNuvemFiscalProvider();
    }
    const focusApiKey = process.env.FOCUSNFE_API_KEY || 'mock-key';
    return new FocusNfeProvider(focusApiKey, true);
}
