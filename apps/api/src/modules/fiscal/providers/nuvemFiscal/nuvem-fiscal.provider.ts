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
        // Derive UF code (cUF) from UF name — SEFAZ table mapping
        const cUF_MAP: Record<string, number> = {
            AC: 12, AL: 27, AP: 16, AM: 13, BA: 29, CE: 23, DF: 53,
            ES: 32, GO: 52, MA: 21, MT: 51, MS: 50, MG: 31, PA: 15,
            PB: 25, PR: 41, PE: 26, PI: 22, RJ: 33, RN: 24, RS: 43,
            RO: 11, RR: 14, SC: 42, SP: 35, SE: 28, TO: 17
        };
        const cUF = cUF_MAP[p.uf_emitente?.toUpperCase()] ?? 35; // fallback SP

        // NCM must be exactly 2 or 8 digits — pad to 8 if shorter
        const formatNCM = (ncm: string | undefined): string => {
            const digits = (ncm || '00000000').replace(/\D/g, '');
            return digits.length < 8 ? digits.padStart(8, '0') : digits.substring(0, 8);
        };

        // cMun must be exactly 7 digits
        const formatCMun = (code: string | undefined): string => {
            const digits = (code || '0000000').replace(/\D/g, '');
            return digits.padStart(7, '0').substring(0, 7);
        };

        const totalVProd = p.items.reduce((acc, curr) => acc + curr.valor_bruto, 0);

        // Determine CSOSN — must be one of 102, 103, 300, 400 for ICMSSN102 group
        const validCSO102 = ['102', '103', '300', '400'];
        const csosn = validCSO102.includes(String(p.items[0]?.icms_situacao_tributaria)) 
            ? p.items[0].icms_situacao_tributaria 
            : '400'; // default: sem débito/crédito, Simples Nacional

        return {
            ambiente: defaultAmbiente,
            referencia: p.referencia,
            infNFe: {
                versao: '4.00',
                ide: {
                    cUF: cUF,
                    cNF: '00000001',   // 8 dígitos aleatórios (Nuvem Fiscal auto-gera se deixar)
                    natOp: p.natureza_operacao,
                    mod: 55,           // 55 = NF-e, 65 = NFC-e
                    serie: 1,
                    nNF: 1,            // Nuvem Fiscal auto-incrementa
                    dhEmi: p.data_emissao,
                    tpNF: 1,           // 1 = saída
                    idDest: 1,         // 1 = operação interna
                    cMunFG: formatCMun(p.ibge_code_emitente),
                    tpImp: 1,          // 1 = DANFE retrato
                    tpEmis: 1,         // 1 = emissão normal
                    cDV: 0,            // Nuvem Fiscal calcula
                    tpAmb: defaultAmbiente === 'producao' ? 1 : 2,
                    finNFe: 1,         // 1 = NF-e normal
                    indFinal: 1,       // 1 = consumidor final
                    indPres: 9,        // 9 = operação não presencial (outros)
                    procEmi: 0,        // 0 = emissão por aplicativo do contribuinte
                    verProc: '1.0.0'
                },
                emit: {
                    CNPJ: p.cnpj_emitente,
                    xNome: p.nome_emitente || 'EMPRESA EMITENTE',
                    enderEmit: {
                        xLgr: p.logradouro_emitente || 'Rua',
                        nro: p.numero_emitente || 'SN',
                        xBairro: p.bairro_emitente || 'Centro',
                        cMun: formatCMun(p.ibge_code_emitente),
                        xMun: p.municipio_emitente || 'Cidade',
                        UF: p.uf_emitente || 'SP',
                        CEP: (p.cep_emitente || '00000000').replace(/\D/g, '').padStart(8, '0')
                    },
                    IE: p.ie_emitente || 'ISENTO',
                    CRT: 1   // 1 = Simples Nacional
                },
                dest: {
                    ...(p.cpf_cnpj_destinatario?.replace(/\D/g, '')?.length === 14
                        ? { CNPJ: p.cpf_cnpj_destinatario.replace(/\D/g, '') }
                        : { CPF: (p.cpf_cnpj_destinatario || '').replace(/\D/g, '') }),
                    xNome: p.nome_destinatario,
                    indIEDest: 9,  // 9 = não contribuinte
                    enderDest: {
                        xLgr: p.logradouro_destinatario || 'Rua',
                        nro: p.numero_destinatario || 'SN',
                        xBairro: p.bairro_destinatario || 'Centro',
                        cMun: formatCMun(p.ibge_code_destinatario),
                        xMun: p.municipio_destinatario || 'Cidade',
                        UF: p.uf_destinatario || 'SP',
                        CEP: (p.cep_destinatario || '00000000').replace(/\D/g, '').padStart(8, '0'),
                        cPais: 1058,
                        xPais: 'BRASIL'
                    }
                },
                det: p.items.map((item, index) => {
                    const validCSO = validCSO102.includes(String(item.icms_situacao_tributaria))
                        ? item.icms_situacao_tributaria
                        : '400';
                    return {
                        nItem: index + 1,
                        prod: {
                            cProd: item.codigo_produto || String(index + 1).padStart(6, '0'),
                            cEAN: 'SEM GTIN',
                            xProd: item.descricao,
                            NCM: formatNCM(item.ncm),
                            CFOP: item.cfop || '5102',
                            uCom: item.unidade_comercial || 'UN',
                            qCom: item.quantidade_comercial,
                            vUnCom: item.valor_unitario_comercial,
                            vProd: item.valor_bruto,
                            cEANTrib: 'SEM GTIN',
                            uTrib: item.unidade_comercial || 'UN',
                            qTrib: item.quantidade_comercial,
                            vUnTrib: item.valor_unitario_comercial,
                            indTot: 1
                        },
                        imposto: {
                            ICMS: {
                                ICMSSN102: {
                                    orig: Number(item.icms_origem) || 0,
                                    CSOSN: validCSO
                                }
                            },
                            PIS: {
                                PISAliq: { CST: '07', vBC: 0, pPIS: 0, vPIS: 0 }
                            },
                            COFINS: {
                                COFINSAliq: { CST: '07', vBC: 0, pCOFINS: 0, vCOFINS: 0 }
                            }
                        }
                    };
                }),
                total: {
                    ICMSTot: {
                        vBC: 0,
                        vICMS: 0,
                        vICMSDeson: 0,
                        vFCP: 0,
                        vBCST: 0,
                        vST: 0,
                        vFCPST: 0,
                        vFCPSTRet: 0,
                        vProd: totalVProd,
                        vFrete: 0,
                        vSeg: 0,
                        vDesc: 0,
                        vII: 0,
                        vIPI: 0,
                        vIPIDevol: 0,
                        vPIS: 0,
                        vCOFINS: 0,
                        vOutro: 0,
                        vNF: totalVProd
                    }
                },
                transp: {
                    modFrete: 9  // 9 = sem ocorrência de transporte
                },
                pag: {
                    detPag: [{
                        tPag: '01',  // 01 = dinheiro (padrão genérico para sandbox)
                        vPag: totalVProd
                    }]
                }
            }
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
