import forge from 'node-forge';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { SignedXml } from 'xml-crypto';

export class NfeSigner {

    /**
     * Assina o XML da NF-e (tag <infNFe>) utilizando PFX descriptografado.
     * Retorna a string do XML final contendo a tag <Signature>.
     */
    static signXml(xmlString: string, referenceId: string, pfxBuffer: Buffer, password?: string): string {
        const { privateKeyPem, certificatePem } = this.extractPemsFromPfx(pfxBuffer, password || '');

        const sig = new SignedXml();

        // NF-e Standards for Signature
        sig.addReference({
            xpath: `//*[@Id='${referenceId}']`,
            transforms: [
                'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
                'http://www.w3.org/TR/2001/REC-xml-c14n-20010315'
            ],
            digestAlgorithm: 'http://www.w3.org/2000/09/xmldsig#sha1'
        });

        sig.signatureAlgorithm = 'http://www.w3.org/2000/09/xmldsig#rsa-sha1';
        sig.canonicalizationAlgorithm = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';

        // Pega apenas o Base64 string isolado (sem BEGIN/END CERTIFICATE)
        const certDerOnly = certificatePem
            .replace(/-----BEGIN CERTIFICATE-----/, '')
            .replace(/-----END CERTIFICATE-----/, '')
            .replace(/\r?\n|\r/g, '');

        // @ts-ignore - Definition overrides for xml-crypto key provision
        sig.keyInfoProvider = {
            getKeyInfo: () => {
                return `<X509Data><X509Certificate>${certDerOnly}</X509Certificate></X509Data>`;
            },
            getKey: () => {
                return Buffer.from('');
            }
        };

        // @ts-ignore - Definition overrides
        sig.signingKey = Buffer.from(privateKeyPem);

        // Sign XML
        sig.computeSignature(xmlString, {
            location: { reference: `/*/*[local-name(.)='infNFe']`, action: 'after' }
        });

        const signedXml = sig.getSignedXml();
        return signedXml;
    }

    private static extractPemsFromPfx(pfxBuffer: Buffer, password: string) {
        let cert: forge.pki.Certificate | null = null;
        let privateKey: forge.pki.PrivateKey | null = null;

        const p12Asn1 = forge.asn1.fromDer(pfxBuffer.toString('binary'));
        const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, password);

        for (const safeContents of p12.safeContents) {
            for (const safeBag of safeContents.safeBags) {
                if (safeBag.type === forge.pki.oids.certBag && !cert) {
                    cert = safeBag.cert as forge.pki.Certificate;
                } else if (safeBag.type === forge.pki.oids.pkcs8ShroudedKeyBag || safeBag.type === forge.pki.oids.keyBag) {
                    if (!privateKey && safeBag.key) {
                        privateKey = safeBag.key as forge.pki.PrivateKey;
                    }
                }
            }
        }

        if (!privateKey || !cert) {
            throw new Error('Certificado ou chave privada ausente no PFX para assinatura.');
        }

        const privateKeyPem = forge.pki.privateKeyToPem(privateKey);
        const certificatePem = forge.pki.certificateToPem(cert);

        return { privateKeyPem, certificatePem };
    }
}
