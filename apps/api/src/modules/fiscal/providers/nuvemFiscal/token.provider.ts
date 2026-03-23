// SERVER-SIDE ONLY — client_secret never leaves this module.
import type { NuvemFiscalTokenResponse } from './types.js';
import { NuvemFiscalError } from './errors.js';

interface CachedToken {
    accessToken: string;
    expiresAt: number;   // epoch ms
}

// ── Config ────────────────────────────────────────────────────────────────────

function getConfig() {
    const authUrl = process.env.NUVEM_FISCAL_AUTH_URL;
    const clientId = process.env.NUVEM_FISCAL_CLIENT_ID;
    const clientSecret = process.env.NUVEM_FISCAL_CLIENT_SECRET;
    const scope = process.env.NUVEM_FISCAL_SCOPE ?? 'empresa nfe nfce nfse cte mdfe cep cnpj';

    if (!authUrl || !clientId || !clientSecret) {
        throw new NuvemFiscalError(
            'Credenciais da Nuvem Fiscal não configuradas ' +
            '(NUVEM_FISCAL_AUTH_URL / NUVEM_FISCAL_CLIENT_ID / NUVEM_FISCAL_CLIENT_SECRET).',
            503
        );
    }

    return { authUrl, clientId, clientSecret, scope };
}

// ── In-memory token cache ─────────────────────────────────────────────────────
// One cache per process. Sufficient for a single-server deployment.
// For multi-instance deployments, replace with a Redis-backed cache.

let cached: CachedToken | null = null;

/** 60-second buffer before actual expiry to avoid clock skew. */
const EXPIRY_BUFFER_MS = 60_000;

function isCacheValid(): boolean {
    return cached !== null && Date.now() < cached.expiresAt - EXPIRY_BUFFER_MS;
}

// ── Token fetch ───────────────────────────────────────────────────────────────

async function fetchToken(): Promise<string> {
    const cfg = getConfig();

    const body = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        scope: cfg.scope,
    });

    const timeoutMs = Number(process.env.NUVEM_FISCAL_TIMEOUT_MS ?? 30_000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
        res = await fetch(cfg.authUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
            signal: controller.signal,
        });
    } catch (err: any) {
        throw new NuvemFiscalError(
            `Erro de conexão ao obter token Nuvem Fiscal: ${err.message}`,
            503
        );
    } finally {
        clearTimeout(timer);
    }

    if (!res.ok) {
        const payload = await res.json().catch(() => ({})) as Record<string, unknown>;
        // Never log client_secret — only include status code
        throw new NuvemFiscalError(
            `Falha ao obter token OAuth2 da Nuvem Fiscal (HTTP ${res.status}).`,
            res.status,
            payload
        );
    }

    const data = await res.json() as NuvemFiscalTokenResponse;

    cached = {
        accessToken: data.access_token,
        expiresAt: Date.now() + data.expires_in * 1_000,
    };

    return cached.accessToken;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns a valid Bearer token for the Nuvem Fiscal API.
 * Caches and auto-renews as needed. Never exposes client_secret.
 */
export async function getToken(): Promise<string> {
    if (isCacheValid()) {
        return cached!.accessToken;
    }
    return fetchToken();
}

/** Force-clears the cache (useful in tests). */
export function clearTokenCache(): void {
    cached = null;
}
