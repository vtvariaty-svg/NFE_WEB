import type { NuvemFiscalApiError } from './types.js';

// ── NuvemFiscalError ──────────────────────────────────────────────────────────

export class NuvemFiscalError extends Error {
    constructor(
        message: string,
        public readonly statusCode: number,
        public readonly detail?: unknown
    ) {
        super(message);
        this.name = 'NuvemFiscalError';
    }
}

// ── Error Mapper ──────────────────────────────────────────────────────────────

export function mapNuvemFiscalError(statusCode: number, body: NuvemFiscalApiError): NuvemFiscalError {
    const detail = body.errors ?? body.message ?? body.error ?? undefined;
    const base = body.message ?? body.error;

    switch (statusCode) {
        case 400:
            return new NuvemFiscalError(
                base ?? 'Requisição inválida para a Nuvem Fiscal.',
                400,
                detail
            );
        case 401:
            return new NuvemFiscalError(
                'Credenciais da Nuvem Fiscal inválidas ou token expirado.',
                401
            );
        case 403:
            return new NuvemFiscalError(
                'Acesso negado pela Nuvem Fiscal. Verifique escopos do token.',
                403
            );
        case 404:
            return new NuvemFiscalError(
                base ?? 'Recurso não encontrado na Nuvem Fiscal.',
                404
            );
        case 409:
            return new NuvemFiscalError(
                base ?? 'Conflito: recurso já existe na Nuvem Fiscal.',
                409,
                detail
            );
        case 422:
            return new NuvemFiscalError(
                base ?? 'Dados inválidos rejeitados pela Nuvem Fiscal.',
                422,
                detail
            );
        case 429:
            return new NuvemFiscalError(
                'Rate limit atingido na Nuvem Fiscal. Tente novamente em instantes.',
                429
            );
        default:
            if (statusCode >= 500) {
                return new NuvemFiscalError(
                    'Erro interno na Nuvem Fiscal. Tente novamente mais tarde.',
                    statusCode
                );
            }
            return new NuvemFiscalError(
                base ?? `Erro inesperado na Nuvem Fiscal (HTTP ${statusCode}).`,
                statusCode,
                detail
            );
    }
}

export function isRetryable(statusCode: number): boolean {
    return statusCode === 408 || statusCode === 429 || statusCode >= 500;
}
