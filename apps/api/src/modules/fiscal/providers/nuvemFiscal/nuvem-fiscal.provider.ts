/**
 * NuvemFiscalProvider — implements IFiscalProvider for the Nuvem Fiscal API.
 *
 * This provider sits behind the NFE_WEB backend.
 * It is NOT called directly from the frontend.
 * Future: wire into external-nfe.routes.ts as an alternative to the direct SEFAZ path.
 */
import { nuvemFiscalHttp } from './http.client.js';
import { NuvemFiscalError } from './errors.js';
import type {
    NuvemFiscalNfePayload,
    NuvemFiscalNfeResponse,
    NuvemFiscalNfeStatus,
} from './types.js';
import type { IFiscalProvider, NFePayload } from '../../fiscal.provider.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Infers tipo_destinatario from the sanitized document.
 * CPF  (11 digits) → consumidor_final
 * CNPJ (14 digits) → contribuinte_icms
 * Anything else    → consumidor_final (safe default; log-worthy if hit)
 *
 * Prefer passing tipo_destinatario explicitly in NFePayload to avoid relying
 * on this inference when the document type is ambiguous.
 */
function inferTipoDestinatario(cpfCnpj: string): 'consumidor_final' | 'contribuinte_icms' {
    const digits = cpfCnpj.replace(/\D/g, '');
    if (digits.length === 14) return 'contribuinte_icms';
    return 'consumidor_final';
}

// ── Status Mapping ────────────────────────────────────────────────────────────

const STATUS_MAP: Record<NuvemFiscalNfeStatus, string> = {
    em_processamento: 'PROCESSANDO',
    autorizado:       'AUTORIZADO',
    rejeitado:        'REJEITADO',
    cancelado:        'CANCELADO',
    denegado:         'DENEGADO',
    erro_autorizacao: 'ERRO',
};

function mapStatus(nuvemStatus: NuvemFiscalNfeStatus): string {
    return STATUS_MAP[nuvemStatus] ?? 'DESCONHECIDO';
}

// ── Provider ──────────────────────────────────────────────────────────────────

export class NuvemFiscalProvider implements IFiscalProvider {

    // ── IFiscalProvider (legacy interface compat) ─────────────────────────────

    /**
     * Issues a NF-e via Nuvem Fiscal.
     * Payload is the internal NFePayload format — adapt as needed before calling.
     */
    async issueNFe(payload: NFePayload): Promise<{ status: string; externalId: string; message?: string }> {
        const result = await this.issueNfe(this.adaptPayload(payload));
        return {
            status: mapStatus(result.status),
            externalId: result.id,
            message: result.mensagem_sefaz,
        };
    }

    async consultNFe(externalId: string): Promise<{ status: string; xmlUrl?: string; pdfUrl?: string }> {
        const result = await this.getNfeById(externalId);
        return {
            status: mapStatus(result.status),
            // XML download is a separate endpoint — see downloadXml()
        };
    }

    async cancelNFe(externalId: string, reason: string): Promise<boolean> {
        await this.cancelNfe(externalId, reason);
        return true;
    }

    // ── Extended operations ───────────────────────────────────────────────────

    /**
     * Issues a NF-e using the Nuvem Fiscal native payload format.
     * Endpoint: POST /nfe
     */
    async issueNfe(payload: NuvemFiscalNfePayload): Promise<NuvemFiscalNfeResponse> {
        return nuvemFiscalHttp.post<NuvemFiscalNfeResponse>('/nfe', payload);
    }

    /**
     * Returns the current status of a NF-e by its Nuvem Fiscal ID.
     * Endpoint: GET /nfe/{id}
     */
    async getNfeById(id: string): Promise<NuvemFiscalNfeResponse> {
        if (!id) throw new NuvemFiscalError('ID da NF-e é obrigatório.', 422);
        return nuvemFiscalHttp.get<NuvemFiscalNfeResponse>(`/nfe/${encodeURIComponent(id)}`);
    }

    /**
     * Returns the current status of a NF-e by client-provided referencia.
     * Endpoint: GET /nfe?referencia={ref}&cpf_cnpj={cpfCnpj}
     */
    async getNfeByReference(
        referencia: string,
        cpfCnpjEmitente: string
    ): Promise<NuvemFiscalNfeResponse | null> {
        if (!referencia || !cpfCnpjEmitente) {
            throw new NuvemFiscalError('referencia e cpfCnpjEmitente são obrigatórios.', 422);
        }
        const qs = new URLSearchParams({
            referencia,
            cpf_cnpj: cpfCnpjEmitente,
        }).toString();

        const result = await nuvemFiscalHttp.get<{ data: NuvemFiscalNfeResponse[] }>(`/nfe?${qs}`);
        return result.data?.[0] ?? null;
    }

    /**
     * Downloads the signed XML of an authorized NF-e.
     * Endpoint: GET /nfe/{id}/xml
     * Returns the raw XML string.
     */
    async downloadXml(id: string): Promise<string> {
        if (!id) throw new NuvemFiscalError('ID da NF-e é obrigatório para download XML.', 422);
        // The endpoint returns XML text — handled as raw string
        const result = await nuvemFiscalHttp.get<{ xml: string }>(`/nfe/${encodeURIComponent(id)}/xml`);
        return result.xml ?? '';
    }

    /**
     * Cancels an authorized NF-e.
     * Endpoint: POST /nfe/{id}/cancelamento
     *
     * @param id       Nuvem Fiscal NF-e ID
     * @param reason   Cancellation reason text (min 15 chars required by SEFAZ)
     */
    async cancelNfe(id: string, reason: string): Promise<NuvemFiscalNfeResponse> {
        if (!id) throw new NuvemFiscalError('ID da NF-e é obrigatório para cancelamento.', 422);
        if (!reason || reason.length < 15) {
            throw new NuvemFiscalError(
                'Justificativa de cancelamento deve ter no mínimo 15 caracteres.',
                422
            );
        }
        return nuvemFiscalHttp.post<NuvemFiscalNfeResponse>(
            `/nfe/${encodeURIComponent(id)}/cancelamento`,
            { justificativa: reason }
        );
    }

    // ── Internal adapter: NFePayload → NuvemFiscalNfePayload ─────────────────

    /**
     * Converts the internal NFePayload format to the Nuvem Fiscal API format.
     *
     * Validation rules:
     * - referencia: uses p.referencia if present; otherwise throws — random UUID is NOT
     *   acceptable here because the reference must be stable and traceable per business
     *   transaction across retries. The caller is responsible for supplying it.
     * - ncm: required per item; throws if any item is missing it.
     * - ibge_code_emitente / ibge_code_destinatario: required; throws if absent.
     * - tipo_destinatario: uses explicit override if provided; otherwise infers from
     *   CPF (11 sanitized digits) → consumidor_final or CNPJ (14) → contribuinte_icms.
     */
    private adaptPayload(p: NFePayload): NuvemFiscalNfePayload {
        const defaultAmbiente = (process.env.NUVEM_FISCAL_DEFAULT_AMBIENTE as 'homologacao' | 'producao') ?? 'homologacao';

        // ── referencia ────────────────────────────────────────────────────────
        // Must be stable and traceable. Never auto-generated here.
        if (!p.referencia) {
            throw new NuvemFiscalError(
                'Campo "referencia" ausente no payload. ' +
                'Forneça um identificador estável e rastreável por transação de negócio ' +
                '(ex: ID do pedido, UUID gerado pelo caller antes da emissão). ' +
                'Fonte esperada: NFePayload.referencia.',
                422
            );
        }

        // ── ibge_code_emitente ────────────────────────────────────────────────
        // Source: Company.ibgeCode — must be included when building the payload.
        if (!p.ibge_code_emitente) {
            throw new NuvemFiscalError(
                'Campo "ibge_code_emitente" ausente no payload. ' +
                'Fonte esperada: Company.ibgeCode (7 dígitos IBGE). ' +
                'Inclua este campo ao construir o NFePayload para a Nuvem Fiscal.',
                422
            );
        }

        // ── ibge_code_destinatario ────────────────────────────────────────────
        // Source: Customer.ibgeCode — must be included when building the payload.
        if (!p.ibge_code_destinatario) {
            throw new NuvemFiscalError(
                'Campo "ibge_code_destinatario" ausente no payload. ' +
                'Fonte esperada: Customer.ibgeCode (7 dígitos IBGE). ' +
                'Inclua este campo ao construir o NFePayload para a Nuvem Fiscal.',
                422
            );
        }

        // ── ncm — validate all items upfront before building ─────────────────
        const missingNcm = p.items
            .map((item, idx) => (!item.ncm ? idx + 1 : null))
            .filter((n): n is number => n !== null);

        if (missingNcm.length > 0) {
            throw new NuvemFiscalError(
                `NCM ausente nos itens de posição: ${missingNcm.join(', ')}. ` +
                'Fonte esperada: NfeItem.ncm ou Product.ncm. ' +
                'O NCM é obrigatório pela SEFAZ para emissão de NF-e.',
                422
            );
        }

        // ── tipo_destinatario ─────────────────────────────────────────────────
        // Explicit override takes precedence; otherwise infer from document length.
        const tipoDestinatario: string = p.tipo_destinatario ?? inferTipoDestinatario(p.cpf_cnpj_destinatario);

        return {
            cpf_cnpj_emitente: p.cnpj_emitente,
            ambiente: defaultAmbiente,
            natureza_operacao: p.natureza_operacao,
            tipo_operacao: p.tipo_documento === 1 ? 'saida' : 'entrada',
            tipo_destinatario: tipoDestinatario,
            data_emissao: p.data_emissao,
            referencia: p.referencia,
            destinatario: {
                cpf_cnpj: p.cpf_cnpj_destinatario,
                nome: p.nome_destinatario,
                endereco: {
                    logradouro: p.logradouro_destinatario,
                    numero: p.numero_destinatario,
                    bairro: p.bairro_destinatario,
                    codigo_municipio: p.ibge_code_destinatario,
                    cidade: p.municipio_destinatario,
                    uf: p.uf_destinatario,
                    cep: p.cep_destinatario,
                },
            },
            itens: p.items.map((item) => ({
                codigo: item.codigo_produto,
                descricao: item.descricao,
                ncm: item.ncm!,   // validated above — guaranteed non-empty
                cfop: item.cfop,
                unidade_comercial: item.unidade_comercial,
                quantidade_comercial: item.quantidade_comercial,
                valor_unitario_comercial: item.valor_unitario_comercial,
                valor_bruto: item.valor_bruto,
                icms_origem: Number(item.icms_origem) || 0,
                icms_cst: item.icms_situacao_tributaria,
                pis_cst: item.pis_situacao_tributaria,
                cofins_cst: item.cofins_situacao_tributaria,
            })),
        };
    }
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function getNuvemFiscalProvider(): NuvemFiscalProvider {
    const enabled =
        process.env.NUVEM_FISCAL_ENABLED === 'true' ||
        process.env.FISCAL_PROVIDER === 'nuvem_fiscal';

    if (!enabled) {
        throw new NuvemFiscalError(
            'Integração com Nuvem Fiscal não está habilitada. ' +
            'Defina NUVEM_FISCAL_ENABLED=true ou FISCAL_PROVIDER=nuvem_fiscal.',
            503
        );
    }
    return new NuvemFiscalProvider();
}
