// SERVER-SIDE ONLY — injects Bearer token automatically.
import { getToken } from './token.provider.js';
import { NuvemFiscalError, mapNuvemFiscalError } from './errors.js';
import type { NuvemFiscalApiError } from './types.js';

// ── Config ────────────────────────────────────────────────────────────────────

function getBaseUrl(): string {
    const url = process.env.NUVEM_FISCAL_BASE_URL;
    if (!url) {
        throw new NuvemFiscalError(
            'NUVEM_FISCAL_BASE_URL não configurada.',
            503
        );
    }
    return url.replace(/\/$/, '');
}

function getTimeoutMs(): number {
    return Number(process.env.NUVEM_FISCAL_TIMEOUT_MS ?? 30_000);
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

async function request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown
): Promise<T> {
    const baseUrl = getBaseUrl();
    const token = await getToken();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), getTimeoutMs());

    const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
    };

    let res: Response;
    try {
        res = await fetch(`${baseUrl}${path}`, {
            method,
            headers,
            body: body !== undefined ? JSON.stringify(body) : undefined,
            signal: controller.signal,
        });
    } catch (err: any) {
        if (err.name === 'AbortError') {
            throw new NuvemFiscalError(
                `Timeout ao chamar Nuvem Fiscal (${getTimeoutMs()}ms): ${path}`,
                408
            );
        }
        throw new NuvemFiscalError(
            `Erro de conexão com a Nuvem Fiscal: ${err.message}`,
            503
        );
    } finally {
        clearTimeout(timer);
    }

    // 204 No Content — return empty object
    if (res.status === 204) return {} as T;

    const data = await res.json().catch(() => ({})) as NuvemFiscalApiError & T;

    if (!res.ok) {
        throw mapNuvemFiscalError(res.status, data as NuvemFiscalApiError);
    }

    return data as T;
}

// ── Public client ─────────────────────────────────────────────────────────────

export const nuvemFiscalHttp = {
    get<T>(path: string): Promise<T> {
        return request<T>('GET', path);
    },

    post<T>(path: string, body: unknown): Promise<T> {
        return request<T>('POST', path, body);
    },

    put<T>(path: string, body: unknown): Promise<T> {
        return request<T>('PUT', path, body);
    },

    patch<T>(path: string, body: unknown): Promise<T> {
        return request<T>('PATCH', path, body);
    },

    delete<T>(path: string): Promise<T> {
        return request<T>('DELETE', path);
    },
};
