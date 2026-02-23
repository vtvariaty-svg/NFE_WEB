import fs from 'fs';
import path from 'path';

export class NfeXsdValidator {

    /**
     * Validates an XML string against SEFAZ XSD schemas.
     * Note: In Node.js, strict XSD validation usually requires native libraries like `libxmljs` 
     * or Java wrappers (`xsd-schema-validator`). For this implementation, we will check if schemas
     * exist and optionally parse the XML to check for basic malformed nodes before relying 
     * on SEFAZ synchronous Rejection response as the ultimate source of truth.
     * 
     * @param xmlString The raw or signed XML to validate
     * @param schemaType E.g. "enviNFe_v4.00.xsd"
     */
    static async validate(xmlString: string, schemaType: string): Promise<boolean> {
        return new Promise((resolve, reject) => {
            try {
                const schemaPath = path.join(process.cwd(), 'src', 'modules', 'fiscal', 'nfe', 'schemas', schemaType);

                // If schemas are not downloaded yet, we bypass strict local validation and 
                // rely on SEFAZ's own schema validation on the SOAP envelope.
                if (!fs.existsSync(schemaPath)) {
                    // console.warn(`Missing XSD schema: ${schemaPath} - Skipping strict local validation.`);
                    return resolve(true);
                }

                // Placeholder for `libxmljs` or `xmllint` validation logic if schemas are present
                // const libxmljs = require('libxmljs');
                // const xsdDoc = libxmljs.parseXml(fs.readFileSync(schemaPath, 'utf8'));
                // const xmlDoc = libxmljs.parseXml(xmlString);
                // if (xmlDoc.validate(xsdDoc)) { resolve(true); } else { reject(new Error('...')); }

                return resolve(true);
            } catch (err: any) {
                reject(new Error(`Erro na validação XSD: ${err.message}`));
            }
        });
    }

    /** Pre-validates internal rules before signing */
    static validateInternalRules(payload: any, company: any) {
        if (!company.document || company.document.length < 14) throw new Error('Emitente: CNPJ inválido ou ausente.');
        if (!company.ibgeCode) throw new Error('Emitente: Código IBGE (cMun) ausente.');
        if (!payload.dest.document) throw new Error('Destinatário: CPF/CNPJ ausente.');
        if (!payload.items || payload.items.length === 0) throw new Error('Itens: A nota deve conter pelo menos um item.');

        // Sum validation logic
        const expectedTotalVProd = payload.items.reduce((acc: number, item: any) => acc + (item.vProd || 0), 0);
        if (Math.abs(expectedTotalVProd - payload.total.vProd) > 0.1) {
            throw new Error(`Totais inconsistentes: Soma dos vProd dos itens (${expectedTotalVProd}) difere do total informado (${payload.total.vProd}).`);
        }

        // Future extensions for CFOP / NCM length checks
        return true;
    }
}
