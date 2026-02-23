import { create } from 'xmlbuilder2';
import { NfeKeysUtil } from './keys.util.js';

export interface NfePayload {
    natOp: string;
    tpNF: string; // 0-entrada, 1-saída
    idDest: string; // 1-interna, 2-interestadual, 3-exterior
    tpImp: string; // 1-retrato, 2-paisagem
    indFinal: string; // 0-normal, 1-consumidor final
    indPres: string; // 0-não presencial, 1-presencial, etc

    dest: {
        document: string; // CPF or CNPJ
        xNome: string;
        indIEDest: string; // 1-Contribuinte, 2-Isento, 9-Não Contribuinte
        IE?: string;
        enderDest: {
            xLgr: string;
            nro: string;
            xCpl?: string;
            xBairro: string;
            cMun: string; // IBGE
            xMun: string;
            UF: string;
            CEP: string;
            cPais?: string;
            xPais?: string;
            fone?: string;
        }
    };

    items: Array<{
        cProd: string;
        xProd: string;
        NCM: string;
        CFOP: string;
        uCom: string;
        qCom: number;
        vUnCom: number;
        vProd: number;

        imposto: {
            icms: {
                orig: string;
                CST?: string;
                CSOSN?: string;
                vBC?: number;
                pICMS?: number;
                vICMS?: number;
            };
            pis?: any;
            cofins?: any;
        };
    }>;

    total: {
        vBC: number;
        vICMS: number;
        vProd: number;
        vFrete: number;
        vSeg: number;
        vDesc: number;
        vNF: number;
    };

    transp: {
        modFrete: string; // 0, 1, 2, 9
    };

    pag: {
        tPag: string; // 01-Dinheiro, 03-Cartão de Crédito, 90-Sem pagamento
        vPag: number;
    }[];

    infAdic?: {
        infCpl?: string;
    };
}

export class NfeXmlBuilder {

    /**
     * Builds the complete unsigned <NFe> XML structure for a given payload,
     * company, and logical sequence.
     */
    static buildNfeXml(payload: NfePayload, company: any, sequence: any) {

        // 1. Generate core vars
        const cUF = company.ibgeCode ? company.ibgeCode.substring(0, 2) : '35';
        const dhEmi = new Date();
        const mod = '55'; // NF-e
        const serie = sequence.serie;
        const nNF = sequence.nNF;
        const tpEmis = '1'; // Normal
        const cNF = NfeKeysUtil.generateCnf();

        // Validate Environment (1-Producao, 2-Homologacao)
        const tpAmb = company.tpAmbDefault || '2';

        // 2. Build Access Key
        const { chave, cDV } = NfeKeysUtil.buildAccessKey(
            cUF, dhEmi, company.document, mod, serie, nNF, tpEmis, cNF
        );

        // 3. Format Dates (ISO-8601 strict format: YYYY-MM-DDThh:mm:ssTZD)
        // Adjust timezone strictly locally if required, but standard ISO string is fine mapping to TZD
        // Format to YYYY-MM-DDThh:mm:ss-03:00
        const dhEmiStr = this.formatSefazDate(dhEmi);

        // 4. Construct XML Tree
        const doc = create({ version: '1.0', encoding: 'UTF-8' })
            .ele('NFe', { xmlns: 'http://www.portalfiscal.inf.br/nfe' })
            .ele('infNFe', { versao: '4.00', Id: `NFe${chave}` });

        // === ide ===
        const ide = doc.ele('ide');
        ide.ele('cUF').txt(cUF).up();
        ide.ele('cNF').txt(cNF).up();
        ide.ele('natOp').txt(payload.natOp.substring(0, 60)).up();
        ide.ele('mod').txt(mod).up();
        ide.ele('serie').txt(serie.toString()).up();
        ide.ele('nNF').txt(nNF.toString()).up();
        ide.ele('dhEmi').txt(dhEmiStr).up();
        ide.ele('tpNF').txt(payload.tpNF).up();
        ide.ele('idDest').txt(payload.idDest).up();
        ide.ele('cMunFG').txt(company.ibgeCode).up();
        ide.ele('tpImp').txt(payload.tpImp).up();
        ide.ele('tpEmis').txt(tpEmis).up();
        ide.ele('cDV').txt(cDV).up();
        ide.ele('tpAmb').txt(tpAmb).up();
        ide.ele('finNFe').txt('1').up(); // Normal
        ide.ele('indFinal').txt(payload.indFinal).up();
        ide.ele('indPres').txt(payload.indPres).up();
        ide.ele('procEmi').txt('0').up(); // 0-Emissão com aplicativo do contribuinte
        ide.ele('verProc').txt('FiscalSaaS 1.0').up();
        ide.up(); // close ide

        // === emit ===
        const emit = doc.ele('emit');
        emit.ele('CNPJ').txt(company.document.replace(/\D/g, '')).up();
        emit.ele('xNome').txt(this.normalize(company.name, 60)).up();
        if (company.name) {
            // xFant is optional but good if present
            emit.ele('xFant').txt(this.normalize(company.name, 60)).up();
        }

        const enderEmit = emit.ele('enderEmit');
        enderEmit.ele('xLgr').txt(this.normalize(company.street || 'Não Informado', 60)).up();
        enderEmit.ele('nro').txt(this.normalize(company.number || 'S/N', 60)).up();
        if (company.complement) enderEmit.ele('xCpl').txt(this.normalize(company.complement, 60)).up();
        enderEmit.ele('xBairro').txt(this.normalize(company.district || 'Centro', 60)).up();
        enderEmit.ele('cMun').txt(company.ibgeCode).up();
        enderEmit.ele('xMun').txt(this.normalize(company.city || '', 60)).up();
        enderEmit.ele('UF').txt(company.state || 'SP').up();
        enderEmit.ele('CEP').txt(company.zipCode ? company.zipCode.replace(/\D/g, '') : '').up();
        enderEmit.ele('cPais').txt(company.cPais || '1058').up();
        enderEmit.ele('xPais').txt(this.normalize(company.xPais || 'Brasil', 60)).up();
        if (company.phone) enderEmit.ele('fone').txt(company.phone.replace(/\D/g, '')).up();
        enderEmit.up(); // close enderEmit

        emit.ele('IE').txt(company.ie ? company.ie.replace(/\D/g, '') : '').up();
        emit.ele('CRT').txt(company.crt || '1').up(); // 1-Simples, 3-Normal
        emit.up(); // close emit

        // === dest ===
        const dest = doc.ele('dest');
        const cleanDestDoc = payload.dest.document.replace(/\D/g, '');
        if (cleanDestDoc.length === 11) {
            dest.ele('CPF').txt(cleanDestDoc).up();
        } else {
            dest.ele('CNPJ').txt(cleanDestDoc).up();
        }

        // According to NT 2018.005, for external op, xNome requires specific rule, or tpAmb=2 requires specific xNome "NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO..."
        const destNome = tpAmb === '2' ? 'NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL' : payload.dest.xNome;
        dest.ele('xNome').txt(this.normalize(destNome, 60)).up();

        const enderDest = dest.ele('enderDest');
        enderDest.ele('xLgr').txt(this.normalize(payload.dest.enderDest.xLgr, 60)).up();
        enderDest.ele('nro').txt(this.normalize(payload.dest.enderDest.nro, 60)).up();
        if (payload.dest.enderDest.xCpl) enderDest.ele('xCpl').txt(this.normalize(payload.dest.enderDest.xCpl, 60)).up();
        enderDest.ele('xBairro').txt(this.normalize(payload.dest.enderDest.xBairro, 60)).up();
        enderDest.ele('cMun').txt(payload.dest.enderDest.cMun).up();
        enderDest.ele('xMun').txt(this.normalize(payload.dest.enderDest.xMun, 60)).up();
        enderDest.ele('UF').txt(payload.dest.enderDest.UF).up();
        enderDest.ele('CEP').txt(payload.dest.enderDest.CEP.replace(/\D/g, '')).up();
        enderDest.ele('cPais').txt(payload.dest.enderDest.cPais || '1058').up();
        enderDest.ele('xPais').txt(this.normalize(payload.dest.enderDest.xPais || 'Brasil', 60)).up();
        if (payload.dest.enderDest.fone) enderDest.ele('fone').txt(payload.dest.enderDest.fone.replace(/\D/g, '')).up();
        enderDest.up();

        dest.ele('indIEDest').txt(payload.dest.indIEDest).up();
        if (payload.dest.IE) {
            dest.ele('IE').txt(payload.dest.IE.replace(/\D/g, '')).up();
        }
        dest.up(); // close dest

        // === det ===
        payload.items.forEach((item, index) => {
            const numItem = (index + 1).toString();
            const det = doc.ele('det', { nItem: numItem });

            const prod = det.ele('prod');
            prod.ele('cProd').txt(this.normalize(item.cProd, 60)).up();
            prod.ele('cEAN').txt('SEM GTIN').up();
            prod.ele('xProd').txt(this.normalize(item.xProd, 120)).up();
            prod.ele('NCM').txt(item.NCM.replace(/\D/g, '')).up();
            // cBenef, EX_TIPI ignored for base
            prod.ele('CFOP').txt(item.CFOP.replace(/\D/g, '')).up();
            prod.ele('uCom').txt(this.normalize(item.uCom, 6)).up();
            prod.ele('qCom').txt(this.formatFloatNFe(item.qCom, 4)).up();
            prod.ele('vUnCom').txt(this.formatFloatNFe(item.vUnCom, 4)).up();
            prod.ele('vProd').txt(this.formatFloatNFe(item.vProd, 2)).up();
            prod.ele('cEANTrib').txt('SEM GTIN').up();
            prod.ele('uTrib').txt(this.normalize(item.uCom, 6)).up();
            prod.ele('qTrib').txt(this.formatFloatNFe(item.qCom, 4)).up();
            prod.ele('vUnTrib').txt(this.formatFloatNFe(item.vUnCom, 4)).up();
            // frete/seguro/desc optional
            prod.ele('indTot').txt('1').up(); // 1 - compõe vTotal
            prod.up(); // close prod

            const imposto = det.ele('imposto');
            // Simplified ICMS structure based on Simples Nacional vs Normal CRT
            const isSimplesMenu = company.crt === '1' || company.crt === '2';

            const vICMSGroup = imposto.ele('ICMS');
            if (isSimplesMenu && item.imposto.icms.CSOSN) {
                const icmsSN = vICMSGroup.ele(`ICMSSN${item.imposto.icms.CSOSN}`);
                icmsSN.ele('orig').txt(item.imposto.icms.orig).up();
                icmsSN.ele('CSOSN').txt(item.imposto.icms.CSOSN).up();
                // Add more logic per CSOSN (vBC, pICMS, vICMS on 900 for instance)
                icmsSN.up();
            } else if (!isSimplesMenu && item.imposto.icms.CST) {
                const icmsNormal = vICMSGroup.ele(`ICMS${item.imposto.icms.CST}`);
                icmsNormal.ele('orig').txt(item.imposto.icms.orig).up();
                icmsNormal.ele('CST').txt(item.imposto.icms.CST).up();

                // Ex CST 00 
                if (item.imposto.icms.CST === '00') {
                    icmsNormal.ele('modBC').txt('3').up();
                    icmsNormal.ele('vBC').txt(this.formatFloatNFe(item.imposto.icms.vBC || 0, 2)).up();
                    icmsNormal.ele('pICMS').txt(this.formatFloatNFe(item.imposto.icms.pICMS || 0, 2)).up();
                    icmsNormal.ele('vICMS').txt(this.formatFloatNFe(item.imposto.icms.vICMS || 0, 2)).up();
                }
                icmsNormal.up();
            }
            vICMSGroup.up(); // close ICMS

            // PIS (99 Others - Example simplified)
            const pis = imposto.ele('PIS');
            const pisOutr = pis.ele('PISOutr');
            pisOutr.ele('CST').txt('99').up();
            pisOutr.ele('vBC').txt('0.00').up();
            pisOutr.ele('pPIS').txt('0.0000').up();
            pisOutr.ele('vPIS').txt('0.00').up();
            pisOutr.up().up();

            // COFINS (99 Others - Example simplified)
            const cofins = imposto.ele('COFINS');
            const cofinsOutr = cofins.ele('COFINSOutr');
            cofinsOutr.ele('CST').txt('99').up();
            cofinsOutr.ele('vBC').txt('0.00').up();
            cofinsOutr.ele('pCOFINS').txt('0.0000').up();
            cofinsOutr.ele('vCOFINS').txt('0.00').up();
            cofinsOutr.up().up();

            imposto.up(); // close imposto
            det.up(); // close det
        });

        // === total ===
        const total = doc.ele('total');
        const icmstot = total.ele('ICMSTot');
        icmstot.ele('vBC').txt(this.formatFloatNFe(payload.total.vBC, 2)).up();
        icmstot.ele('vICMS').txt(this.formatFloatNFe(payload.total.vICMS, 2)).up();
        icmstot.ele('vICMSDeson').txt('0.00').up();
        icmstot.ele('vFCP').txt('0.00').up();
        icmstot.ele('vBCST').txt('0.00').up();
        icmstot.ele('vST').txt('0.00').up();
        icmstot.ele('vFCPST').txt('0.00').up();
        icmstot.ele('vFCPSTRet').txt('0.00').up();
        icmstot.ele('vProd').txt(this.formatFloatNFe(payload.total.vProd, 2)).up();
        icmstot.ele('vFrete').txt(this.formatFloatNFe(payload.total.vFrete, 2)).up();
        icmstot.ele('vSeg').txt(this.formatFloatNFe(payload.total.vSeg, 2)).up();
        icmstot.ele('vDesc').txt(this.formatFloatNFe(payload.total.vDesc, 2)).up();
        icmstot.ele('vII').txt('0.00').up();
        icmstot.ele('vIPI').txt('0.00').up();
        icmstot.ele('vIPIDevol').txt('0.00').up();
        icmstot.ele('vPIS').txt('0.00').up();
        icmstot.ele('vCOFINS').txt('0.00').up();
        icmstot.ele('vOutro').txt('0.00').up();
        icmstot.ele('vNF').txt(this.formatFloatNFe(payload.total.vNF, 2)).up();
        icmstot.up().up(); // close total

        // === transp ===
        const transp = doc.ele('transp');
        transp.ele('modFrete').txt(payload.transp.modFrete).up();
        transp.up();

        // === pag ===
        const pag = doc.ele('pag');
        payload.pag.forEach(p => {
            const detPag = pag.ele('detPag');
            detPag.ele('tPag').txt(p.tPag).up();
            detPag.ele('vPag').txt(this.formatFloatNFe(p.vPag, 2)).up();
            // Sem troco para simplified models
            // No card (CNPJ credenciadora) handled for base
            detPag.up();
        });
        pag.up();

        // === infAdic ===
        if (payload.infAdic) {
            const infAdic = doc.ele('infAdic');
            if (payload.infAdic.infCpl) {
                infAdic.ele('infCpl').txt(this.normalize(payload.infAdic.infCpl, 5000)).up();
            }
            infAdic.up();
        }

        // Return raw XML string built (NO Signature yet)
        return {
            chave44: chave,
            xml: doc.end({ prettyPrint: false })
        };
    }

    /** Helper to normalize string bounds and trim */
    private static normalize(str: string, maxLen: number): string {
        if (!str) return '';
        // NF-e does not allow certain special chars in text nodes, mapping happens down line
        return str.substring(0, maxLen).trim();
    }

    /** Formats a float strictly indicating decimal precision (e.g. 10.50 -> "10.50") */
    private static formatFloatNFe(val: number, precision: number): string {
        if (isNaN(val)) return (0).toFixed(precision);
        return val.toFixed(precision);
    }

    /** E.g. 2023-11-20T10:00:00-03:00 */
    private static formatSefazDate(date: Date): string {
        // Enforce America/Sao_Paulo (-03:00 or -02:00 in DST) by formatting natively
        const pad = (n: number) => n.toString().padStart(2, '0');

        // Let's create a robust parser to just output -03:00 base
        const y = date.getFullYear();
        const m = pad(date.getMonth() + 1);
        const d = pad(date.getDate());
        const h = pad(date.getHours());
        const min = pad(date.getMinutes());
        const s = pad(date.getSeconds());

        const tzOffset = date.getTimezoneOffset();
        const sign = tzOffset > 0 ? '-' : '+';
        const tzH = pad(Math.floor(Math.abs(tzOffset) / 60));
        const tzM = pad(Math.abs(tzOffset) % 60);

        return `${y}-${m}-${d}T${h}:${min}:${s}${sign}${tzH}:${tzM}`;
    }

}
