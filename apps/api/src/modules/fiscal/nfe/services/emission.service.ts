import { prisma } from '../../../../index.js';
import { CertificateService } from './certificate.service.js';
import { NfeXmlBuilder, NfePayload } from '../xml/nfe.builder.js';
import { NfeXsdValidator } from '../validation/xsd.validator.js';
import { NfeSigner } from '../sign/xml-signer.js';
import { SefazSoapClient } from '../soap/soap.client.js';
import { SefazEndpointResolver } from '../soap/endpoint.resolver.js';

export class EmissionService {

    /**
     * Executes the full NF-e emission pipeline:
     * 1. Validate rules
     * 2. Build XML
     * 3. Sign XML
     * 4. Send to SEFAZ Authorization endpoint
     * 5. Persist the Invoice record and Sefaz Logs
     */
    static async emitNfe(tenantId: string, companyId: string, payload: NfePayload, orderId?: string) {
        // 1. Check Company & Tenant isolation
        const company = await prisma.company.findFirst({
            where: { id: companyId, tenantId }
        });

        if (!company) throw new Error('Empresa não encontrada ou não pertence ao tenant.');

        // 2. Load Certificate
        const cert = await CertificateService.getActiveCert(tenantId, companyId);

        // 3. Acquire Sequence (Atomically)
        const serie = '1';
        const seq = await prisma.nfeSequence.upsert({
            where: { tenantId_companyId_serie: { tenantId, companyId, serie } },
            create: { tenantId, companyId, serie, lastNnf: 1 },
            update: { lastNnf: { increment: 1 } }
        });

        const sequenceData = { serie, nNF: seq.lastNnf };

        // 4. Pre-Validate Internal Rules
        NfeXsdValidator.validateInternalRules(payload, company);

        // 5. Build XML Structure
        const { chave44, xml: xmlUnsigned } = NfeXmlBuilder.buildNfeXml(payload, company, sequenceData);

        // 6. Sign XML
        const xmlSigned = NfeSigner.signXml(xmlUnsigned, `NFe${chave44}`, cert.pfxBuffer, cert.password);

        // 7. Validate schemas before sending
        await NfeXsdValidator.validate(xmlSigned, 'enviNFe_v4.00.xsd');

        // 8. Build SOAP Envelope (enviNFe batch container)
        // Required wrap for NfeAutorizacao
        const enviNFe =
            `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Header>
    <nfeCabecMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4">
      <cUF>${company.ibgeCode?.substring(0, 2) || '35'}</cUF>
      <versaoDados>4.00</versaoDados>
    </nfeCabecMsg>
  </soap12:Header>
  <soap12:Body>
    <nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4">
      <enviNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
        <idLote>1</idLote>
        <indSinc>1</indSinc>
        ${xmlSigned.replace('<?xml version="1.0" encoding="UTF-8"?>', '')}
      </enviNFe>
    </nfeDadosMsg>
  </soap12:Body>
</soap12:Envelope>`;

        // 9. Discover WSDL Endpoint URL
        const tpAmb = company.tpAmbDefault || '2'; // 1=Prod, 2=Homolog
        const uf = company.state || 'SP';
        const url = SefazEndpointResolver.resolveEndpoint(uf, tpAmb, 'NfeAutorizacao4');

        // 10. Persist initial DRAFT/SENT state before network
        const invoice = await prisma.invoice.create({
            data: {
                tenantId,
                companyId,
                orderId,
                type: 'NFE',
                status: 'SENT',
                serie: sequenceData.serie,
                nnf: sequenceData.nNF,
                cuf: company.ibgeCode?.substring(0, 2),
                tpEmis: '1',
                tpAmb,
                chave44,
                xmlUnsigned,
                xmlSigned,
                // store items simply (expanding relations requires payload matching)
                items: {
                    create: payload.items.map((item, index) => ({
                        nitem: index + 1,
                        cprod: item.cProd,
                        xprod: item.xProd,
                        ncm: item.NCM,
                        cfop: item.CFOP,
                        ucom: item.uCom,
                        qcom: item.qCom,
                        vuncom: item.vUnCom,
                        vprod: item.vProd
                    }))
                }
            }
        });

        // 11. Send to SEFAZ
        try {
            const responseXml = await SefazSoapClient.send(
                url,
                'http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4',
                enviNFe,
                cert.pfxBuffer,
                cert.password,
                tenantId,
                companyId,
                invoice.id
            );

            // 12. Parse synchronous response (indSinc=1)
            // Simplified parsing logic without massive DOM traverses for now
            const isAuthorized = responseXml.includes('<cStat>104</cStat>') || responseXml.includes('<cStat>100</cStat>');

            // Extract nProt / dhRecbto
            const nProtMatch = responseXml.match(/<nProt>(.*?)<\/nProt>/);
            const nProt = nProtMatch ? nProtMatch[1] : null;

            const dhRecbtoMatch = responseXml.match(/<dhRecbto>(.*?)<\/dhRecbto>/);
            const dhRecbto = dhRecbtoMatch ? dhRecbtoMatch[1] : null;

            const xMotivoMatch = responseXml.match(/<xMotivo>(.*?)<\/xMotivo>/);
            const xMotivo = xMotivoMatch ? xMotivoMatch[1] : 'Erro Desconhecido';

            const cStatMatch = responseXml.match(/<cStat>(.*?)<\/cStat>/);
            const cStat = cStatMatch ? cStatMatch[1] : '999';

            if (isAuthorized && nProt) {
                // Attach protNFe to the original signed XML to create full procNFe
                const procNFe =
                    `<?xml version="1.0" encoding="utf-8"?>
<nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">
    ${xmlSigned.replace('<?xml version="1.0" encoding="UTF-8"?>', '')}
    <protNFe versao="4.00">
        <infProt>
            <tpAmb>${tpAmb}</tpAmb>
            <verAplic>FiscalSaaS 1.0</verAplic>
            <chNFe>${chave44}</chNFe>
            <dhRecbto>${dhRecbto}</dhRecbto>
            <nProt>${nProt}</nProt>
            <digVal></digVal>
            <cStat>100</cStat>
            <xMotivo>Autorizado o uso da NF-e</xMotivo>
        </infProt>
    </protNFe>
</nfeProc>`;

                await prisma.invoice.update({
                    where: { id: invoice.id },
                    data: {
                        status: 'AUTHORIZED',
                        protNprot: nProt,
                        protDhrecbto: dhRecbto,
                        xmlAuthorized: procNFe
                    }
                });

                return {
                    status: 'AUTHORIZED',
                    chave: chave44,
                    protocol: nProt,
                    invoiceId: invoice.id
                };

            } else {
                await prisma.invoice.update({
                    where: { id: invoice.id },
                    data: {
                        status: 'REJECTED',
                        rejectionCode: cStat,
                        rejectionMsg: xMotivo
                    }
                });

                return {
                    status: 'REJECTED',
                    chave: chave44,
                    cStat,
                    xMotivo,
                    invoiceId: invoice.id
                };
            }

        } catch (sefazErr: any) {
            // Unhandled network error, Sefaz Offline, etc.
            await prisma.invoice.update({
                where: { id: invoice.id },
                data: {
                    status: 'ERROR',
                    rejectionCode: '000',
                    rejectionMsg: sefazErr.message
                }
            });

            throw new Error(`Erro de Comunicação com SEFAZ: ${sefazErr.message}`);
        }
    }
}
