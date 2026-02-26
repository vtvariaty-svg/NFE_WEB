import { prisma } from '../../../../index.js';
import { CertificateService } from './certificate.service.js';
import { NfeSigner } from '../sign/xml-signer.js';
import { SefazSoapClient } from '../soap/soap.client.js';
import { SefazEndpointResolver } from '../soap/endpoint.resolver.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseSefazCstat(xml: string) {
  return {
    cStat: xml.match(/<cStat>(.*?)<\/cStat>/)?.[1] ?? '999',
    xMotivo: xml.match(/<xMotivo>(.*?)<\/xMotivo>/)?.[1] ?? 'Sem resposta'
  };
}

function nowBrISO() {
  return new Date().toISOString().replace('Z', '-03:00');
}

function buildEventEnvelope(xmlSignedEvento: string, cUF: string, tpAmb: string, wsdlService: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Header>
    <nfeCabecMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/${wsdlService}">
      <cUF>${cUF}</cUF><versaoDados>1.00</versaoDados>
    </nfeCabecMsg>
  </soap12:Header>
  <soap12:Body>
    <nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/${wsdlService}">
      <envEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00">
        <idLote>1</idLote>
        ${xmlSignedEvento.replace('<?xml version="1.0" encoding="UTF-8"?>', '')}
      </envEvento>
    </nfeDadosMsg>
  </soap12:Body>
</soap12:Envelope>`;
}

async function sendEventToSefaz(
  xmlEvento: string,
  idEvento: string,
  cert: { pfxBuffer: Buffer; password: string },
  url: string,
  soapAction: string,
  tenantId: string,
  companyId: string,   // guaranteed non-null by caller
  invoiceId: string | undefined,
  cUF: string,
  tpAmb: string,
  wsdlService: string
): Promise<string> {
  const xmlSigned = NfeSigner.signXml(xmlEvento, idEvento, cert.pfxBuffer, cert.password);
  const envelope = buildEventEnvelope(xmlSigned, cUF, tpAmb, wsdlService);
  return SefazSoapClient.send(url, soapAction, envelope, cert.pfxBuffer, cert.password, tenantId, companyId, invoiceId);
}

// ─── Cancel (evento 110111) ───────────────────────────────────────────────────

export class NfeCancelService {
  static async cancel(tenantId: string, invoiceId: string, justificativa: string) {
    const invoice = await prisma.invoice.findFirstOrThrow({ where: { id: invoiceId, tenantId } });
    if (invoice.status !== 'AUTHORIZED') throw new Error('Somente NF-e autorizadas podem ser canceladas.');
    if (!invoice.protNprot) throw new Error('Protocolo de autorização não encontrado.');
    if (justificativa.length < 15 || justificativa.length > 255) throw new Error('Justificativa deve ter entre 15 e 255 caracteres.');

    // Destructure with guaranteed non-null defaults
    const companyId: string = invoice.companyId ?? '';
    const chave44: string = invoice.chave44 ?? '';
    const cUF: string = invoice.cuf ?? '35';
    const tpAmb: string = invoice.tpAmb ?? '2';
    const nProt: string = invoice.protNprot;

    const company = await prisma.company.findFirstOrThrow({ where: { id: companyId, tenantId } });
    const cnpj: string = company.document?.replace(/\D/g, '') ?? '';
    const uf: string = company.state ?? 'SP';

    const cert = await CertificateService.getActiveCert(tenantId, companyId);

    const nSeqEvento = '01';
    const idEvento = `ID110111${chave44}${nSeqEvento}`;

    const xmlEvento = `<?xml version="1.0" encoding="utf-8"?>
<evento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00">
  <infEvento Id="${idEvento}">
    <cOrgao>${cUF}</cOrgao>
    <tpAmb>${tpAmb}</tpAmb>
    <CNPJ>${cnpj}</CNPJ>
    <chNFe>${chave44}</chNFe>
    <dhEvento>${nowBrISO()}</dhEvento>
    <tpEvento>110111</tpEvento>
    <nSeqEvento>1</nSeqEvento>
    <verEvento>1.00</verEvento>
    <detEvento versao="1.00">
      <descEvento>Cancelamento</descEvento>
      <nProt>${nProt}</nProt>
      <xJust>${justificativa}</xJust>
    </detEvento>
  </infEvento>
</evento>`;

    const url = SefazEndpointResolver.resolveEndpoint(uf, tpAmb, 'NfeRecepcaoEvento4');
    const responseXml = await sendEventToSefaz(xmlEvento, idEvento, cert, url, 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4', tenantId, companyId, invoiceId, cUF, tpAmb, 'NFeRecepcaoEvento4');

    const { cStat, xMotivo } = parseSefazCstat(responseXml);
    if (['135', '155'].includes(cStat)) {
      await prisma.invoice.update({ where: { id: invoiceId }, data: { status: 'CANCELED' } });
    }
    return { success: ['135', '155'].includes(cStat), cStat, xMotivo };
  }
}

// ─── CC-e (evento 110110) ─────────────────────────────────────────────────────

export class NfeCceService {
  static async sendCce(tenantId: string, invoiceId: string, correcao: string) {
    if (correcao.length < 15 || correcao.length > 1000) throw new Error('Correção deve ter entre 15 e 1000 caracteres.');

    const invoice = await prisma.invoice.findFirstOrThrow({ where: { id: invoiceId, tenantId } });
    if (invoice.status !== 'AUTHORIZED') throw new Error('CC-e apenas para NF-e autorizada.');

    const companyId: string = invoice.companyId ?? '';
    const chave44: string = invoice.chave44 ?? '';
    const cUF: string = invoice.cuf ?? '35';
    const tpAmb: string = invoice.tpAmb ?? '2';

    const company = await prisma.company.findFirstOrThrow({ where: { id: companyId, tenantId } });
    const cnpj: string = company.document?.replace(/\D/g, '') ?? '';
    const uf: string = company.state ?? 'SP';

    const cert = await CertificateService.getActiveCert(tenantId, companyId);

    const existingCce = await prisma.sefazLog.count({ where: { invoiceId, service: { contains: 'CCe' } } });
    const nSeqEvento = String(existingCce + 1).padStart(2, '0');
    const idEvento = `ID110110${chave44}${nSeqEvento}`;

    const xmlEvento = `<?xml version="1.0" encoding="utf-8"?>
<evento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00">
  <infEvento Id="${idEvento}">
    <cOrgao>${cUF}</cOrgao>
    <tpAmb>${tpAmb}</tpAmb>
    <CNPJ>${cnpj}</CNPJ>
    <chNFe>${chave44}</chNFe>
    <dhEvento>${nowBrISO()}</dhEvento>
    <tpEvento>110110</tpEvento>
    <nSeqEvento>${parseInt(nSeqEvento)}</nSeqEvento>
    <verEvento>1.00</verEvento>
    <detEvento versao="1.00">
      <descEvento>Carta de Correcao</descEvento>
      <xCorrecao>${correcao}</xCorrecao>
      <xCondUso>A Carta de Correcao e disciplinada pelo paragrafo 1o-A do art. 7o do Convenio S/N, de 15 de dezembro de 1970 e pode ser utilizada para regularizacao de erro ocorrido na emissao de documento fiscal, desde que o erro nao esteja relacionado com: I - as variaveis que determinam o valor do imposto tais como: base de calculo, aliquota, diferenca de preco, quantidade, valor da operacao ou da prestacao; II - a correcao de dados cadastrais que implique mudanca do remetente ou do destinatario; III - a data de emissao ou de saida.</xCondUso>
    </detEvento>
  </infEvento>
</evento>`;

    const url = SefazEndpointResolver.resolveEndpoint(uf, tpAmb, 'NfeRecepcaoEvento4');
    const responseXml = await sendEventToSefaz(xmlEvento, idEvento, cert, url, 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4', tenantId, companyId, invoiceId, cUF, tpAmb, 'NFeRecepcaoEvento4');

    const { cStat, xMotivo } = parseSefazCstat(responseXml);
    return { success: cStat === '135', cStat, xMotivo };
  }
}

// ─── Inutilização ─────────────────────────────────────────────────────────────

export class NfeInutilizacaoService {
  static async inutilizar(tenantId: string, companyId: string, params: {
    ano: number; serie: string; nNFIni: number; nNFFin: number; xJust: string; tpAmb: string;
  }) {
    if (params.xJust.length < 15 || params.xJust.length > 255) throw new Error('Justificativa deve ter entre 15 e 255 caracteres.');

    const company = await prisma.company.findFirstOrThrow({ where: { id: companyId, tenantId } });
    const cnpj: string = company.document?.replace(/\D/g, '') ?? '';
    const cUF: string = company.ibgeCode?.substring(0, 2) ?? '35';
    const uf: string = company.state ?? 'SP';

    const cert = await CertificateService.getActiveCert(tenantId, companyId);
    const anoShort = String(params.ano).substring(2);
    const idInut = `ID${cUF}${anoShort}${cnpj}${params.serie.padStart(3, '0')}${String(params.nNFIni).padStart(9, '0')}${String(params.nNFFin).padStart(9, '0')}`;

    const xmlInut = `<?xml version="1.0" encoding="utf-8"?>
<inutNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <infInut Id="${idInut}">
    <tpAmb>${params.tpAmb}</tpAmb>
    <xServ>INUTILIZAR</xServ>
    <cUF>${cUF}</cUF>
    <ano>${anoShort}</ano>
    <CNPJ>${cnpj}</CNPJ>
    <mod>55</mod>
    <serie>${params.serie}</serie>
    <nNFIni>${params.nNFIni}</nNFIni>
    <nNFFin>${params.nNFFin}</nNFFin>
    <xJust>${params.xJust}</xJust>
  </infInut>
</inutNFe>`;

    const xmlSigned = NfeSigner.signXml(xmlInut, idInut, cert.pfxBuffer, cert.password);
    const envelope = `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Header>
    <nfeCabecMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeInutilizacao4"><cUF>${cUF}</cUF><versaoDados>4.00</versaoDados></nfeCabecMsg>
  </soap12:Header>
  <soap12:Body>
    <nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeInutilizacao4">
      ${xmlSigned.replace('<?xml version="1.0" encoding="UTF-8"?>', '')}
    </nfeDadosMsg>
  </soap12:Body>
</soap12:Envelope>`;

    const url = SefazEndpointResolver.resolveEndpoint(uf, params.tpAmb, 'NfeInutilizacao4');
    const responseXml = await SefazSoapClient.send(url, 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeInutilizacao4', envelope, cert.pfxBuffer, cert.password, tenantId, companyId);

    const { cStat, xMotivo } = parseSefazCstat(responseXml);
    return { success: cStat === '102', cStat, xMotivo, idInut };
  }
}

// ─── Manifestação do Destinatário ─────────────────────────────────────────────

export class NfeManifestacaoService {
  static readonly EVENTOS: Record<string, string> = {
    '210200': 'Confirmacao da Operacao',
    '210210': 'Ciencia da Operacao',
    '210220': 'Desconhecimento da Operacao',
    '210240': 'Operacao nao Realizada'
  };

  static async manifestar(tenantId: string, invoiceId: string, tpEvento: '210200' | '210210' | '210220' | '210240', xJust?: string) {
    const invoice = await prisma.invoice.findFirstOrThrow({ where: { id: invoiceId, tenantId } });
    const companyId: string = invoice.companyId ?? '';
    const chave44: string = invoice.chave44 ?? '';
    const tpAmb: string = invoice.tpAmb ?? '2';

    const company = await prisma.company.findFirstOrThrow({ where: { id: companyId, tenantId } });
    const cnpj: string = company.document?.replace(/\D/g, '') ?? '';

    const cert = await CertificateService.getActiveCert(tenantId, companyId);
    const descEvento = this.EVENTOS[tpEvento];
    const idEvento = `ID${tpEvento}${chave44}01`;

    const xmlEvento = `<?xml version="1.0" encoding="utf-8"?>
<evento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00">
  <infEvento Id="${idEvento}">
    <cOrgao>91</cOrgao>
    <tpAmb>${tpAmb}</tpAmb>
    <CNPJ>${cnpj}</CNPJ>
    <chNFe>${chave44}</chNFe>
    <dhEvento>${nowBrISO()}</dhEvento>
    <tpEvento>${tpEvento}</tpEvento>
    <nSeqEvento>1</nSeqEvento>
    <verEvento>1.00</verEvento>
    <detEvento versao="1.00">
      <descEvento>${descEvento}</descEvento>
      ${xJust ? `<xJust>${xJust}</xJust>` : ''}
    </detEvento>
  </infEvento>
</evento>`;

    // Manifestação goes to AN (Ambiente Nacional)
    const url = tpAmb === '1'
      ? 'https://www.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx'
      : 'https://hom.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx';

    const responseXml = await sendEventToSefaz(xmlEvento, idEvento, cert, url, 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4', tenantId, companyId, invoiceId, '91', tpAmb, 'NFeRecepcaoEvento4');

    const { cStat, xMotivo } = parseSefazCstat(responseXml);
    return { success: cStat === '135', cStat, xMotivo };
  }
}

// ─── Status SEFAZ ────────────────────────────────────────────────────────────

export class NfeStatusService {
  static async checkStatus(tenantId: string, companyId: string, uf?: string, tpAmb?: string) {
    const company = await prisma.company.findFirstOrThrow({ where: { id: companyId, tenantId } });
    const cert = await CertificateService.getActiveCert(tenantId, companyId);

    const resolvedUf: string = uf ?? company.state ?? 'SP';
    const resolvedAmb: string = tpAmb ?? company.tpAmbDefault ?? '2';
    const cUF: string = company.ibgeCode?.substring(0, 2) ?? '35';

    const envelope = `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Header>
    <nfeCabecMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NfeStatusServico4">
      <cUF>${cUF}</cUF><versaoDados>4.00</versaoDados>
    </nfeCabecMsg>
  </soap12:Header>
  <soap12:Body>
    <nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NfeStatusServico4">
      <consStatServ xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
        <tpAmb>${resolvedAmb}</tpAmb><cUF>${cUF}</cUF><xServ>STATUS</xServ>
      </consStatServ>
    </nfeDadosMsg>
  </soap12:Body>
</soap12:Envelope>`;

    const url = SefazEndpointResolver.resolveEndpoint(resolvedUf, resolvedAmb, 'NfeStatusServico4');
    const responseXml = await SefazSoapClient.send(url, 'http://www.portalfiscal.inf.br/nfe/wsdl/NfeStatusServico4', envelope, cert.pfxBuffer, cert.password, tenantId, companyId);

    const { cStat, xMotivo } = parseSefazCstat(responseXml);
    return { online: cStat === '107', cStat, xMotivo, uf: resolvedUf, ambiente: resolvedAmb === '1' ? 'Produção' : 'Homologação' };
  }
}

// ─── Contingência SVC-AN / SVC-RS ─────────────────────────────────────────────

export class NfeContingenciaService {
  static async ativarContingencia(tenantId: string, companyId: string, tipo: 'SVC-AN' | 'SVC-RS', motivo: string) {
    await prisma.company.findFirstOrThrow({ where: { id: companyId, tenantId } });
    const tpEmis = tipo === 'SVC-AN' ? '7' : '6';
    await prisma.company.update({
      where: { id: companyId },
      data: {
        contingenciaAtiva: true,
        tpEmisContingencia: tpEmis,
        motivoContingencia: motivo,
        dhContingencia: new Date().toISOString()
      }
    });
    return { ativa: true, tipo, tpEmis, motivo };
  }

  static async desativarContingencia(tenantId: string, companyId: string) {
    await prisma.company.findFirstOrThrow({ where: { id: companyId, tenantId } });
    await prisma.company.update({
      where: { id: companyId },
      data: { contingenciaAtiva: false, tpEmisContingencia: null, motivoContingencia: null }
    });
    return { ativa: false };
  }
}

// ─── Download XML autorizado ───────────────────────────────────────────────────

export class NfeDownloadService {
  static async downloadXml(tenantId: string, invoiceId: string) {
    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId },
      select: { xmlAuthorized: true, xmlSigned: true, chave44: true, status: true }
    });
    if (!invoice) throw new Error('NF-e não encontrada.');
    const xml = invoice.xmlAuthorized ?? invoice.xmlSigned;
    if (!xml) throw new Error('XML não disponível para esta NF-e.');
    return { xml, chave44: invoice.chave44 ?? '', status: invoice.status };
  }
}

// ─── Retry automático (consulta protocolo) ────────────────────────────────────

export class NfeRetryService {
  static async retryPending(tenantId: string, companyId?: string) {
    const where: any = {
      tenantId,
      status: { in: ['SENT', 'ERROR'] },
      updatedAt: { gte: new Date(Date.now() - 60 * 60 * 1000) }
    };
    if (companyId) where.companyId = companyId;

    const pending = await prisma.invoice.findMany({ where, take: 20 });
    const results: any[] = [];

    for (const inv of pending) {
      try {
        const invCompanyId: string = inv.companyId ?? '';
        const invChave44: string = inv.chave44 ?? '';
        const cUF: string = inv.cuf ?? '35';
        const tpAmb: string = inv.tpAmb ?? '2';

        const company = await prisma.company.findFirst({ where: { id: invCompanyId } });
        if (!company) continue;
        const uf: string = company.state ?? 'SP';

        const cert = await CertificateService.getActiveCert(tenantId, invCompanyId);

        const envelope = `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Header>
    <nfeCabecMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeConsultaProtocolo4"><cUF>${cUF}</cUF><versaoDados>4.00</versaoDados></nfeCabecMsg>
  </soap12:Header>
  <soap12:Body>
    <nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeConsultaProtocolo4">
      <consSitNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
        <tpAmb>${tpAmb}</tpAmb><xServ>CONSULTAR</xServ><chNFe>${invChave44}</chNFe>
      </consSitNFe>
    </nfeDadosMsg>
  </soap12:Body>
</soap12:Envelope>`;

        const url = SefazEndpointResolver.resolveEndpoint(uf, tpAmb, 'NfeConsultaProtocolo4');
        const responseXml = await SefazSoapClient.send(url, 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeConsultaProtocolo4', envelope, cert.pfxBuffer, cert.password, tenantId, invCompanyId, inv.id);

        const { cStat } = parseSefazCstat(responseXml);
        const nProt = responseXml.match(/<nProt>(.*?)<\/nProt>/)?.[1];

        if (['100', '101'].includes(cStat) && nProt) {
          const newStatus = cStat === '100' ? 'AUTHORIZED' : 'CANCELED';
          await prisma.invoice.update({ where: { id: inv.id }, data: { status: newStatus, protNprot: nProt } });
          results.push({ id: inv.id, chave: invChave44, newStatus });
        } else {
          results.push({ id: inv.id, chave: invChave44, cStat });
        }
      } catch (e: any) {
        results.push({ id: inv.id, error: e.message });
      }
    }
    return { processed: pending.length, results };
  }
}
