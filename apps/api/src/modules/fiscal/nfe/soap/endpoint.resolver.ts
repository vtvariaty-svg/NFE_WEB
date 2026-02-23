export type SefazService =
    'NfeStatusServico4' |
    'NfeAutorizacao4' |
    'NfeRetAutorizacao4' |
    'NfeRecepcaoEvento4' |
    'NfeInutilizacao4' |
    'NfeConsultaProtocolo4';

export class SefazEndpointResolver {

    /**
     * Resolve the SOAP WSDL endpoint URL given the UF, Environment, and Service Type.
     * Note: This is a simplified map. The full matrix maps to:
     * - Homologation/Production
     * - States: AM, BA, CE, GO, MG, MS, MT, PE, PR, RS, SP
     * - SVRS: AC, AL, AP, DF, ES, PB, PI, RJ, RN, RO, RR, SC, SE, TO
     * - SVAN: MA
     * @param uf Two-letter state code (e.g., 'SP')
     * @param tpAmb '1' for Production, '2' for Homologation
     * @param service The requested service
     */
    static resolveEndpoint(uf: string, tpAmb: string, service: SefazService): string {
        const isHomolog = (tpAmb === '2');
        const authorizer = this.getAuthorizer(uf.toUpperCase());

        return this.getUrl(authorizer, isHomolog, service);
    }

    private static getAuthorizer(uf: string): string {
        const ufsSvan = ['MA'];
        const ufsSvrs = ['AC', 'AL', 'AP', 'DF', 'ES', 'PB', 'PI', 'RJ', 'RN', 'RO', 'RR', 'SC', 'SE', 'TO'];

        if (ufsSvan.includes(uf)) return 'SVAN';
        if (ufsSvrs.includes(uf)) return 'SVRS';

        // Own servers fallback mapping (simplified fallback to SVRS or directly handled)
        if (['SP', 'RS', 'PR', 'MG', 'BA', 'GO'].includes(uf)) {
            return uf;
        }

        return 'SVRS'; // default safety net
    }

    private static getUrl(authorizer: string, isHomolog: boolean, service: SefazService): string {
        // Fallback simplified mapping mapping to SP and SVRS primarily.
        // A production ready module would map all literal SEFAZ wsdl nodes here.
        const dictionary: Record<string, any> = {
            'SP': {
                homolog: {
                    'NfeStatusServico4': 'https://homologacao.nfe.fazenda.sp.gov.br/ws/nfestatusservico4.asmx',
                    'NfeAutorizacao4': 'https://homologacao.nfe.fazenda.sp.gov.br/ws/nfeautorizacao4.asmx',
                    'NfeRetAutorizacao4': 'https://homologacao.nfe.fazenda.sp.gov.br/ws/nferetautorizacao4.asmx',
                    'NfeRecepcaoEvento4': 'https://homologacao.nfe.fazenda.sp.gov.br/ws/nferecepcaoevento4.asmx',
                    'NfeConsultaProtocolo4': 'https://homologacao.nfe.fazenda.sp.gov.br/ws/nfeconsultaprotocolo4.asmx',
                    'NfeInutilizacao4': 'https://homologacao.nfe.fazenda.sp.gov.br/ws/nfeinutilizacao4.asmx'
                },
                prod: {
                    'NfeStatusServico4': 'https://nfe.fazenda.sp.gov.br/ws/nfestatusservico4.asmx',
                    'NfeAutorizacao4': 'https://nfe.fazenda.sp.gov.br/ws/nfeautorizacao4.asmx',
                    'NfeRetAutorizacao4': 'https://nfe.fazenda.sp.gov.br/ws/nferetautorizacao4.asmx',
                    'NfeRecepcaoEvento4': 'https://nfe.fazenda.sp.gov.br/ws/nferecepcaoevento4.asmx',
                    'NfeConsultaProtocolo4': 'https://nfe.fazenda.sp.gov.br/ws/nfeconsultaprotocolo4.asmx',
                    'NfeInutilizacao4': 'https://nfe.fazenda.sp.gov.br/ws/nfeinutilizacao4.asmx'
                }
            },
            'SVRS': {
                homolog: {
                    'NfeStatusServico4': 'https://nfe-homologacao.svrs.rs.gov.br/ws/NfeStatusServico/NfeStatusServico4.asmx',
                    'NfeAutorizacao4': 'https://nfe-homologacao.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx',
                    'NfeRetAutorizacao4': 'https://nfe-homologacao.svrs.rs.gov.br/ws/NfeRetAutorizacao/NFeRetAutorizacao4.asmx',
                    'NfeRecepcaoEvento4': 'https://nfe-homologacao.svrs.rs.gov.br/ws/recepcaoevento/recepcaoevento4.asmx',
                    'NfeConsultaProtocolo4': 'https://nfe-homologacao.svrs.rs.gov.br/ws/NfeConsulta/NfeConsulta4.asmx',
                    'NfeInutilizacao4': 'https://nfe-homologacao.svrs.rs.gov.br/ws/nfeinutilizacao/nfeinutilizacao4.asmx'
                },
                prod: {
                    'NfeStatusServico4': 'https://nfe.svrs.rs.gov.br/ws/NfeStatusServico/NfeStatusServico4.asmx',
                    'NfeAutorizacao4': 'https://nfe.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx',
                    'NfeRetAutorizacao4': 'https://nfe.svrs.rs.gov.br/ws/NfeRetAutorizacao/NFeRetAutorizacao4.asmx',
                    'NfeRecepcaoEvento4': 'https://nfe.svrs.rs.gov.br/ws/recepcaoevento/recepcaoevento4.asmx',
                    'NfeConsultaProtocolo4': 'https://nfe.svrs.rs.gov.br/ws/NfeConsulta/NfeConsulta4.asmx',
                    'NfeInutilizacao4': 'https://nfe.svrs.rs.gov.br/ws/nfeinutilizacao/nfeinutilizacao4.asmx'
                }
            }
        };

        const target = dictionary[authorizer] || dictionary['SVRS'];
        const envObj = isHomolog ? target.homolog : target.prod;
        const url = envObj[service];

        if (!url) {
            throw new Error(`Endpoint não encontrado para ${authorizer}, envi: ${isHomolog ? 'homolog' : 'prod'}, service: ${service}`);
        }

        return url;
    }
}
