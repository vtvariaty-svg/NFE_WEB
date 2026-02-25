import { InvoiceRequestDTO } from '../adapters/base.adapter.js';

export class NacionalJsonBuilder {

    /**
     * Builds the JSON representation for the Declaração de Prestação de Serviço (DPS)
     * according to the Padrão Nacional API specifications.
     */
    static build(payload: InvoiceRequestDTO, companyInfo: any, rpsData: { serie: string; numero: number; dataEmissao: Date }) {
        // DPS standard structure snippet
        const dps = {
            infDPS: {
                tpAmb: 2, // Default Homologation for sandbox, would come from config
                dhEmi: rpsData.dataEmissao.toISOString(),
                prest: {
                    cnpj: companyInfo.document.replace(/\D/g, ''),
                },
                toma: {
                    cnpjCpf: payload.tomador.documento.replace(/\D/g, ''),
                    xNome: payload.tomador.nomeRazao,
                    ender: {
                        xLgr: payload.tomador.endereco.logradouro,
                        nro: payload.tomador.endereco.numero,
                        cMun: payload.tomador.endereco.cmun,
                        CEP: payload.tomador.endereco.cep.replace(/\D/g, '')
                    }
                },
                serv: {
                    cTribNac: payload.servico.codigoServicoMunicipal ? payload.servico.codigoServicoMunicipal.padEnd(20, '0') : '00000000000000000000',
                    cMunPrestacao: payload.servico.cmunIncidencia,
                    xDesc: payload.servico.descricao
                },
                valores: {
                    vServPrest: payload.servico.valores.valorServicos.toFixed(2),
                    vDeducao: payload.servico.valores.valorDeducoes.toFixed(2),
                    vDescIncond: payload.servico.valores.descontoIncondicionado.toFixed(2),
                    vDescCond: payload.servico.valores.descontoCondicionado.toFixed(2),
                    trib: {
                        tribMun: {
                            vAliq: payload.servico.valores.aliquota.toFixed(2),
                            vISSQN: payload.servico.valores.valorIss.toFixed(2),
                            tpRetISSQN: payload.servico.valores.issRetido ? 1 : 2 // 1-Retido, 2-Não Retido
                        }
                    }
                }
            }
        };

        return { idRps: `DPS${rpsData.numero}`, json: JSON.stringify(dps) };
    }
}
