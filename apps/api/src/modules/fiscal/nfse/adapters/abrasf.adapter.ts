import { INfseAdapter, InvoiceRequestDTO, NfseAdapterResponse } from './base.adapter.js';
import { NfseSoapClient } from '../clients/soap.client.js';
import { AbrasfXmlBuilder } from '../xml/abrasf.builder.js';
import { NfseMunicipalLayoutMap } from './layout.map.js';

/**
 * ABRASF v2.01/v2.02 Adapter
 * Handles: RecepcionarLoteRps, CancelarNfse, ConsultarLoteRps, ConsultarNfsePorRps, ConsultarSituacaoLoteRps
 */
export class AbrasfAdapter implements INfseAdapter {
    private client: NfseSoapClient;
    private config: any;
    private layout: any;

    constructor(municipalConfig: any) {
        this.config = municipalConfig;
        // Get municipality-specific layout overrides
        this.layout = NfseMunicipalLayoutMap.get(municipalConfig.cmun);

        this.client = new NfseSoapClient({
            wsdlUrl: municipalConfig.endpointBase || municipalConfig.wsdlUrl,
            pfxBuffer: municipalConfig.pfxBuffer,
            pfxPassword: municipalConfig.pfxPassword
        });
    }

    // ── Emissão: RecepcionarLoteRps ─────────────────────────────────────────

    async issueNfse(payload: InvoiceRequestDTO, sequence: { serie: string; numero: number }): Promise<NfseAdapterResponse> {
        const cnpj = this.config.company?.document?.replace(/\D/g, '') || '';
        const loteNumero = String(sequence.numero);

        const { idRps, xml: rpsXml } = AbrasfXmlBuilder.build(payload, this.config.company || {}, {
            serie: sequence.serie,
            numero: sequence.numero,
            dataEmissao: new Date()
        });

        // Wrap in SOAP envelope
        const soapAction = this.layout?.recepcionarLoteRpsAction || 'RecepcionarLoteRpsV3';
        const envelope = this.buildEnvelope('RecepcionarLoteRps', soapAction, cnpj, rpsXml);

        const result = await this.client.send(soapAction, envelope);

        if (result.error) {
            return this.parseErrorResponse(result.rawResponse);
        }

        // Parse synchronous or async response
        const responseStr = String(result.rawResponse);

        // Check if protocol was returned (async batch)
        const protocoloMatch = responseStr.match(/<Protocolo>(.*?)<\/Protocolo>/i);
        if (protocoloMatch) {
            return {
                success: true,
                status: 'PROCESSING',
                protocolo: protocoloMatch[1],
                loteId: loteNumero,
                rawRequest: envelope,
                rawResponse: responseStr
            };
        }

        // Check if NFS-e number returned immediately (sync)
        const numeroNfseMatch = responseStr.match(/<Numero>(.*?)<\/Numero>/i);
        const codVerifMatch = responseStr.match(/<CodigoVerificacao>(.*?)<\/CodigoVerificacao>/i);

        if (numeroNfseMatch) {
            return {
                success: true,
                status: 'ISSUED',
                numeroNfse: numeroNfseMatch[1],
                codigoVerificacao: codVerifMatch?.[1],
                rawRequest: envelope,
                rawResponse: responseStr
            };
        }

        // Handle errors from prefeitura
        return this.parseErrorResponse(responseStr, envelope);
    }

    // ── Cancelamento: CancelarNfse ──────────────────────────────────────────

    async cancelNfse(numeroNfse: string, codigoCancelamento: string, justificativa: string): Promise<NfseAdapterResponse> {
        const cnpj = this.config.company?.document?.replace(/\D/g, '') || '';
        const im = this.config.company?.im || '';
        const cmun = this.config.cmun || '';

        const xmlCancelamento = `<?xml version="1.0" encoding="UTF-8"?>
<CancelarNfseEnvio xmlns="http://www.abrasf.org.br/nfse.xsd">
  <Pedido>
    <InfPedidoCancelamento Id="cancel${numeroNfse}">
      <IdentificacaoNfse>
        <Numero>${numeroNfse}</Numero>
        <Cnpj>${cnpj}</Cnpj>
        <InscricaoMunicipal>${im}</InscricaoMunicipal>
        <CodigoMunicipio>${cmun}</CodigoMunicipio>
      </IdentificacaoNfse>
      <CodigoCancelamento>${codigoCancelamento}</CodigoCancelamento>
    </InfPedidoCancelamento>
  </Pedido>
</CancelarNfseEnvio>`;

        const soapAction = this.layout?.cancelarNfseAction || 'CancelarNfseV3';
        const envelope = this.buildEnvelope('CancelarNfse', soapAction, cnpj, xmlCancelamento);
        const result = await this.client.send(soapAction, envelope);

        if (result.error) return this.parseErrorResponse(result.rawResponse);

        const responseStr = String(result.rawResponse);
        const sucesso = responseStr.includes('<Sucesso>') || responseStr.includes('CancelarNfseResposta');
        const erro = responseStr.match(/<Mensagem>(.*?)<\/Mensagem>/i);

        return {
            success: sucesso && !erro,
            status: sucesso && !erro ? 'ISSUED' : 'REJECTED',  // 'ISSUED' here means "Cancellation succeeded"
            rejectionMessage: erro?.[1],
            rawRequest: envelope,
            rawResponse: responseStr
        };
    }

    // ── Consulta Protocolo/Lote: ConsultarLoteRps ────────────────────────────

    async queryBatch(protocolo: string): Promise<NfseAdapterResponse> {
        const cnpj = this.config.company?.document?.replace(/\D/g, '') || '';

        const xmlConsulta = `<?xml version="1.0" encoding="UTF-8"?>
<ConsultarSituacaoLoteRpsEnvio xmlns="http://www.abrasf.org.br/nfse.xsd">
  <Prestador>
    <Cnpj>${cnpj}</Cnpj>
    <InscricaoMunicipal>${this.config.company?.im || ''}</InscricaoMunicipal>
  </Prestador>
  <Protocolo>${protocolo}</Protocolo>
</ConsultarSituacaoLoteRpsEnvio>`;

        const soapAction = this.layout?.consultarSituacaoLoteAction || 'ConsultarSituacaoLoteRpsV3';
        const envelope = this.buildEnvelope('ConsultarSituacaoLoteRps', soapAction, cnpj, xmlConsulta);
        const result = await this.client.send(soapAction, envelope);

        if (result.error) return { success: false, status: 'PROCESSING', rawResponse: String(result.rawResponse) };

        const responseStr = String(result.rawResponse);
        const situacao = responseStr.match(/<Situacao>(.*?)<\/Situacao>/i)?.[1];

        // ABRASF: 1=Not received, 2=Not processed, 3=Processed with error, 4=Processed ok
        if (situacao === '4') {
            const nfseResult = await this.queryByRps(this.config.lastRpsSerie || '1', this.config.lastRpsNumero || 1);
            return { ...nfseResult, protocolo };
        }

        if (situacao === '3') {
            const erro = responseStr.match(/<Mensagem>(.*?)<\/Mensagem>/i)?.[1] || 'Erro no processamento do lote';
            return { success: false, status: 'REJECTED', rejectionMessage: erro, protocolo, rawResponse: responseStr };
        }

        return { success: false, status: 'PROCESSING', protocolo, rawResponse: responseStr };
    }

    // ── Consulta por RPS: ConsultarNfsePorRps ─────────────────────────────────

    async queryByRps(serie: string, numero: number): Promise<NfseAdapterResponse> {
        const cnpj = this.config.company?.document?.replace(/\D/g, '') || '';

        const xmlConsulta = `<?xml version="1.0" encoding="UTF-8"?>
<ConsultarNfseRpsEnvio xmlns="http://www.abrasf.org.br/nfse.xsd">
  <IdentificacaoRps>
    <Numero>${numero}</Numero>
    <Serie>${serie}</Serie>
    <Tipo>1</Tipo>
  </IdentificacaoRps>
  <Prestador>
    <Cnpj>${cnpj}</Cnpj>
    <InscricaoMunicipal>${this.config.company?.im || ''}</InscricaoMunicipal>
  </Prestador>
</ConsultarNfseRpsEnvio>`;

        const soapAction = this.layout?.consultarNfsePorRpsAction || 'ConsultarNfseRpsV3';
        const envelope = this.buildEnvelope('ConsultarNfseRps', soapAction, cnpj, xmlConsulta);
        const result = await this.client.send(soapAction, envelope);

        if (result.error) return { success: false, status: 'REJECTED', rawResponse: String(result.rawResponse) };

        const responseStr = String(result.rawResponse);
        const numero_nfse = responseStr.match(/<Numero>(.*?)<\/Numero>/i)?.[1];
        const codVerif = responseStr.match(/<CodigoVerificacao>(.*?)<\/CodigoVerificacao>/i)?.[1];
        const xmlNfse = this.extractNfseXml(responseStr);

        if (numero_nfse) {
            return { success: true, status: 'ISSUED', numeroNfse: numero_nfse, codigoVerificacao: codVerif, xmlNfse, rawResponse: responseStr };
        }

        return this.parseErrorResponse(responseStr);
    }

    // ── Status do webservice municipal ────────────────────────────────────────

    async status(): Promise<{ online: boolean; message: string }> {
        try {
            const cnpj = this.config.company?.document?.replace(/\D/g, '') || '00000000000000';
            const soapAction = this.layout?.statusAction || 'Ping';
            const result = await this.client.send(soapAction, '');
            return { online: !result.error, message: result.error ? String(result.rawResponse).substring(0, 100) : 'OK' };
        } catch {
            return { online: false, message: 'Prefeitura inacessível' };
        }
    }

    // ── Private Helpers ───────────────────────────────────────────────────────

    private buildEnvelope(operation: string, soapAction: string, cnpj: string, innerXml: string): string {
        const ns = this.layout?.namespace || 'http://www.abrasf.org.br/nfse.xsd';
        const wsdlNs = this.layout?.wsdlNamespace || `http://nfse.abrasf.org.br/${operation}`;

        return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns="${wsdlNs}">
  <soap:Body>
    <ns:${operation}Request>
      <nfseDadosMsg>
        <![CDATA[${innerXml}]]>
      </nfseDadosMsg>
    </ns:${operation}Request>
  </soap:Body>
</soap:Envelope>`;
    }

    private parseErrorResponse(rawResponse: any, rawRequest?: string): NfseAdapterResponse {
        const responseStr = String(rawResponse);
        const mensagem = responseStr.match(/<Mensagem>(.*?)<\/Mensagem>/i)?.[1]
            || responseStr.match(/<xMotivo>(.*?)<\/xMotivo>/i)?.[1]
            || responseStr.match(/<message>(.*?)<\/message>/i)?.[1]
            || 'Erro desconhecido da prefeitura';
        const codigo = responseStr.match(/<Codigo>(.*?)<\/Codigo>/i)?.[1] || '999';

        return { success: false, status: 'REJECTED', rejectionCode: codigo, rejectionMessage: mensagem, rawRequest, rawResponse: responseStr };
    }

    private extractNfseXml(responseStr: string): string | undefined {
        const match = responseStr.match(/<CompNfse[^>]*>(.*?)<\/CompNfse>/is);
        return match ? `<CompNfse>${match[1]}</CompNfse>` : undefined;
    }
}
