/**
 * Bootstrap operations for onboarding a company in Nuvem Fiscal.
 *
 * Order required before first NF-e emission:
 *   1. createOrUpdateCompany()
 *   2. uploadCertificate()
 *   3. configureNfeService()
 *
 * All functions are idempotent — safe to call multiple times.
 */
import { nuvemFiscalHttp } from './http.client.js';
import { NuvemFiscalError } from './errors.js';
import type {
    NuvemFiscalEmpresaPayload,
    NuvemFiscalEmpresaResponse,
    NuvemFiscalCertificadoPayload,
    NuvemFiscalCertificadoResponse,
    NuvemFiscalNfeConfigPayload,
    NuvemFiscalNfeConfigResponse,
} from './types.js';

// ── 1. Company ────────────────────────────────────────────────────────────────

/**
 * Registers a new company in Nuvem Fiscal, or updates it if it already exists
 * (409 Conflict → falls through to PATCH).
 *
 * Endpoint: POST /empresas
 * On 409:  PATCH /empresas/{cpf_cnpj}
 */
export async function createOrUpdateCompany(
    data: NuvemFiscalEmpresaPayload
): Promise<NuvemFiscalEmpresaResponse> {
    try {
        return await nuvemFiscalHttp.post<NuvemFiscalEmpresaResponse>('/empresas', data);
    } catch (err) {
        if (err instanceof NuvemFiscalError && err.statusCode === 409) {
            // Company already exists — update it
            const cpfCnpj = encodeURIComponent(data.cpf_cnpj);
            return nuvemFiscalHttp.patch<NuvemFiscalEmpresaResponse>(
                `/empresas/${cpfCnpj}`,
                data
            );
        }
        throw err;
    }
}

// ── 2. Certificate ────────────────────────────────────────────────────────────

/**
 * Uploads or renews the A1 digital certificate for a company.
 * The PFX must be passed as a Base64 string.
 *
 * Endpoint: PUT /empresas/{cpf_cnpj}/certificado
 * This endpoint is idempotent — a new call replaces the previous certificate.
 *
 * @param cpfCnpj  CNPJ/CPF digits only (no formatting)
 * @param pfxBase64  PFX file encoded as Base64
 * @param password   PFX password (never logged)
 */
export async function uploadCertificate(
    cpfCnpj: string,
    pfxBase64: string,
    password: string
): Promise<NuvemFiscalCertificadoResponse> {
    if (!cpfCnpj) {
        throw new NuvemFiscalError('cpfCnpj é obrigatório para upload de certificado.', 422);
    }
    if (!pfxBase64) {
        throw new NuvemFiscalError('pfxBase64 é obrigatório para upload de certificado.', 422);
    }
    if (!password) {
        throw new NuvemFiscalError('Senha do certificado é obrigatória.', 422);
    }

    const payload: NuvemFiscalCertificadoPayload = {
        certificado: pfxBase64,
        password,
    };

    const encoded = encodeURIComponent(cpfCnpj);
    return nuvemFiscalHttp.put<NuvemFiscalCertificadoResponse>(
        `/empresas/${encoded}/certificado`,
        payload
    );
}

// ── 3. NF-e Service Configuration ────────────────────────────────────────────

/**
 * Configures the NF-e service for a company.
 * Must be called after createOrUpdateCompany and uploadCertificate.
 *
 * Endpoint: PUT /empresas/{cpf_cnpj}/nfe
 * Confirmed via official Nuvem Fiscal docs on 2026-03-18.
 *
 * @param cpfCnpj  CNPJ/CPF digits only (no formatting)
 * @param config   { ambiente: 'homologacao' | 'producao', crt?: 1|2|3|4 }
 */
export async function configureNfeService(
    cpfCnpj: string,
    config: NuvemFiscalNfeConfigPayload
): Promise<NuvemFiscalNfeConfigResponse> {
    if (!cpfCnpj) {
        throw new NuvemFiscalError('cpfCnpj é obrigatório para configurar o serviço NF-e.', 422);
    }

    const defaultAmbiente = (process.env.NUVEM_FISCAL_DEFAULT_AMBIENTE as 'homologacao' | 'producao') ?? 'homologacao';

    const payload: NuvemFiscalNfeConfigPayload = {
        ambiente: config.ambiente ?? defaultAmbiente,
        ...(config.crt !== undefined ? { crt: config.crt } : {}),
    };

    const encoded = encodeURIComponent(cpfCnpj);
    return nuvemFiscalHttp.put<NuvemFiscalNfeConfigResponse>(
        `/empresas/${encoded}/nfe`,
        payload
    );
}

// ── Convenience: full onboarding in one call ──────────────────────────────────

export interface BootstrapInput {
    empresa: NuvemFiscalEmpresaPayload;
    certificado: {
        pfxBase64: string;
        password: string;
    };
    nfeConfig: NuvemFiscalNfeConfigPayload;
}

export interface BootstrapResult {
    empresa: NuvemFiscalEmpresaResponse;
    certificado: NuvemFiscalCertificadoResponse;
    nfeConfig: NuvemFiscalNfeConfigResponse;
}

/**
 * Runs all three bootstrap steps sequentially.
 * Safe to call multiple times — all steps are idempotent.
 */
export async function bootstrapEmpresa(input: BootstrapInput): Promise<BootstrapResult> {
    const empresa = await createOrUpdateCompany(input.empresa);

    const certificado = await uploadCertificate(
        input.empresa.cpf_cnpj,
        input.certificado.pfxBase64,
        input.certificado.password
    );

    const nfeConfig = await configureNfeService(input.empresa.cpf_cnpj, input.nfeConfig);

    return { empresa, certificado, nfeConfig };
}
