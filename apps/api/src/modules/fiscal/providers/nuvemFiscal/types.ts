// ── Nuvem Fiscal API — Contracts ─────────────────────────────────────────────
// SERVER-SIDE ONLY. Never import in client components.
// Reference: https://dev.nuvemfiscal.com.br/docs/api

// ── OAuth2 ────────────────────────────────────────────────────────────────────

export interface NuvemFiscalTokenResponse {
    access_token: string;
    token_type: string;
    expires_in: number;   // seconds
    scope: string;
}

// ── Empresa ───────────────────────────────────────────────────────────────────

export interface NuvemFiscalEndereco {
    logradouro: string;
    numero: string;
    complemento?: string;
    bairro: string;
    codigo_municipio: string;   // IBGE 7-digit code
    cidade: string;
    uf: string;                 // 2-letter state
    cep: string;
    codigo_pais?: string;       // default: '1058' (Brazil)
    pais?: string;              // default: 'Brasil'
}

export type NuvemFiscalRegimeTributario =
    | 'simples_nacional'
    | 'simples_nacional_excesso_receita'
    | 'regime_normal'
    | 'mei';

export interface NuvemFiscalEmpresaPayload {
    cpf_cnpj: string;           // digits only
    inscricao_estadual?: string;
    inscricao_municipal?: string;
    nome_razao_social: string;
    nome_fantasia?: string;
    fone?: string;
    email?: string;
    endereco: NuvemFiscalEndereco;
    regime_tributario: NuvemFiscalRegimeTributario;
}

export interface NuvemFiscalEmpresaResponse {
    id: string;
    cpf_cnpj: string;
    nome_razao_social: string;
    nome_fantasia?: string;
    created_at: string;
    updated_at: string;
}

// ── Certificado ───────────────────────────────────────────────────────────────

export interface NuvemFiscalCertificadoPayload {
    certificado: string;   // PFX in Base64
    password: string;
}

export interface NuvemFiscalCertificadoResponse {
    /** ISO 8601 — certificate validity start */
    validade_inicio: string;
    /** ISO 8601 — certificate validity end */
    validade_fim: string;
    titular_nome: string;
    titular_documento: string;   // CPF/CNPJ digits
}

// ── NF-e Service Configuration ────────────────────────────────────────────────
// Endpoint: PUT /empresas/{cpf_cnpj}/nfe
// Confirmed via official Nuvem Fiscal docs on 2026-03-18.

export type NuvemFiscalNfeAmbiente = 'homologacao' | 'producao';

/**
 * Código de Regime Tributário (CRT) for NF-e.
 * 1 = Simples Nacional
 * 2 = Simples Nacional — excesso receita
 * 3 = Regime Normal
 * 4 = Simples Nacional — MEI
 */
export type NuvemFiscalCrt = 1 | 2 | 3 | 4;

export interface NuvemFiscalNfeConfigPayload {
    ambiente: NuvemFiscalNfeAmbiente;
    crt?: NuvemFiscalCrt;
}

export interface NuvemFiscalNfeConfigResponse {
    ambiente: NuvemFiscalNfeAmbiente;
    crt: NuvemFiscalCrt | null;
}

// ── NF-e Emission ─────────────────────────────────────────────────────────────

export interface NuvemFiscalNfeItem {
    codigo: string;
    descricao: string;
    ncm: string;
    cfop: string;
    unidade_comercial: string;
    quantidade_comercial: number;
    valor_unitario_comercial: number;
    valor_bruto: number;
    icms_origem: number;           // 0-8
    icms_cst: string;
    pis_cst: string;
    cofins_cst: string;
}

export interface NuvemFiscalNfePayload {
    /** CNPJ do emitente (digits only) */
    cpf_cnpj_emitente: string;
    ambiente: NuvemFiscalNfeAmbiente;
    natureza_operacao: string;
    /** 'saida' | 'entrada' */
    tipo_operacao: 'saida' | 'entrada';
    /** 'consumidor_final' | 'produtor_rural' | 'contribuinte_icms' */
    tipo_destinatario?: string;
    data_emissao: string;           // ISO 8601
    /** Client-side unique reference for idempotency */
    referencia?: string;
    destinatario: {
        cpf_cnpj?: string;
        nome: string;
        email?: string;
        fone?: string;
        endereco: NuvemFiscalEndereco;
    };
    itens: NuvemFiscalNfeItem[];
    informacoes_adicionais_contribuinte?: string;
}

export type NuvemFiscalNfeStatus =
    | 'em_processamento'
    | 'autorizado'
    | 'rejeitado'
    | 'cancelado'
    | 'denegado'
    | 'erro_autorizacao';

export interface NuvemFiscalNfeResponse {
    id: string;
    status: NuvemFiscalNfeStatus;
    ambiente: NuvemFiscalNfeAmbiente;
    referencia?: string;
    /** SEFAZ authorization key (chave de acesso 44 digits) */
    chave?: string;
    /** SEFAZ protocol number */
    numero_protocolo?: string;
    /** SEFAZ authorization date */
    data_autorizacao?: string;
    /** SEFAZ rejection/error reason */
    mensagem_sefaz?: string;
    codigo_sefaz?: string;
    created_at: string;
    updated_at: string;
}

// ── Generic Error Shape ───────────────────────────────────────────────────────

export interface NuvemFiscalApiError {
    /** HTTP status code from Nuvem Fiscal */
    status?: number;
    error?: string;
    message?: string;
    errors?: Record<string, string[]>;
}
