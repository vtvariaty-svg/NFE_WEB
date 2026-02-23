export class NfeKeysUtil {

    /**
     * Builds the full 44-digit Access Key (Chave de Acesso) for NF-e/NFC-e.
     */
    static buildAccessKey(
        cUF: string,
        dhEmi: Date,
        cnpj: string,
        mod: string,
        serie: number,
        nNF: number,
        tpEmis: string,
        cNF: string
    ): { chave: string; cDV: string } {
        const year = dhEmi.getFullYear().toString().slice(-2);
        const month = (dhEmi.getMonth() + 1).toString().padStart(2, '0');
        const AAMM = `${year}${month}`;

        const cleanCnpj = cnpj.replace(/\D/g, '').padStart(14, '0');
        const strMod = mod.padStart(2, '0');
        const strSerie = serie.toString().padStart(3, '0');
        const strNNF = nNF.toString().padStart(9, '0');
        const strTpEmis = tpEmis; // 1 to 9
        const strCNF = cNF.toString().padStart(8, '0');

        const chaveBase = `${cUF}${AAMM}${cleanCnpj}${strMod}${strSerie}${strNNF}${strTpEmis}${strCNF}`;

        if (chaveBase.length !== 43) {
            throw new Error(`A base da chave deve ter 43 dígitos. Ficou com ${chaveBase.length}: ${chaveBase}`);
        }

        const cDV = this.calculateCdv(chaveBase);
        const chave = `${chaveBase}${cDV}`;

        return { chave, cDV };
    }

    /**
     * Calculates the cDV (Dígito Verificador) using Modulo 11
     * over the 43 digits of the chave base.
     */
    static calculateCdv(chave43: string): string {
        let sum = 0;
        let weight = 2;

        for (let i = chave43.length - 1; i >= 0; i--) {
            sum += parseInt(chave43.charAt(i), 10) * weight;
            weight++;
            if (weight > 9) {
                weight = 2;
            }
        }

        const remainder = sum % 11;
        const dv = (remainder === 0 || remainder === 1) ? 0 : (11 - remainder);

        return dv.toString();
    }

    /**
     * Helper to generate a random 8-digit cNF
     */
    static generateCnf(): string {
        return Math.floor(Math.random() * 99999999).toString().padStart(8, '0');
    }
}
