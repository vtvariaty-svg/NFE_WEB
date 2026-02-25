import { SignedXml } from 'xml-crypto';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import forge from 'node-forge';

export class NfseSigner {

    /**
     * Extracts the primary PEM formatted private key and 
     * X509 certificate string from a locally decrypted A1 Buffer.
     */
    private static extractKeyPairStrings(pfxBuffer: Buffer, passphrase?: string) {
        const p12Asn1 = forge.asn1.fromDer(pfxBuffer.toString('binary'));
        const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, passphrase);

        const bags = p12.getBags({ bagType: forge.pki.oids.certBag });
        const certBag = bags[forge.pki.oids.certBag];
        if (!certBag || certBag.length === 0) throw new Error('Certificado não encontrado no PFX.');

        const cert = certBag[0].cert;
        if (!cert) throw new Error('Certificado (certBag[0].cert) nulo.');

        const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
        const keyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag];
        if (!keyBag || keyBag.length === 0) throw new Error('Chave privada não encontrada no PFX.');

        const privateKey = keyBag[0].key;
        if (!privateKey) throw new Error('Chave privada (keyBag[0].key) nula.');

        const pemCert = forge.pki.certificateToPem(cert);
        const pemKey = forge.pki.privateKeyToPem(privateKey);

        const cleanCert = pemCert
            .replace(/-----BEGIN CERTIFICATE-----/g, '')
            .replace(/-----END CERTIFICATE-----/g, '')
            .replace(/\r|\n/g, '');

        return { privateKeyPem: pemKey, x509Cert: cleanCert };
    }

    /**
     * Executes official ABRASF XMLDSIG routines utilizing SHA1 referencing enveloped tags by Id.
     */
    static signXml(xmlString: string, referenceId: string, pfxBuffer: Buffer, pfxPassword?: string): string {
        const { privateKeyPem, x509Cert } = this.extractKeyPairStrings(pfxBuffer, pfxPassword);

        const sig = new SignedXml();

        // Em ABRASF 2.0+ frequentemente a chave precisa estar no formato SHA1 com C14N
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

        sig.computeSignature(xmlString, {
            prefix: '',
            location: { reference: `//*[@Id='${referenceId}']`, action: 'after' }
        });

        const signatureXml = sig.getSignatureXml();

        // Manual DOM traversal to inject the X509 certificate since SignedXml doesn't populate nested KeyInfo by default nicely sometimes
        const finalDoc = new DOMParser().parseFromString(xmlString);
        const refNode = finalDoc.documentElement.getElementsByTagName('*');

        let targetNode = null;
        for (let i = 0; i < refNode.length; i++) {
            if (refNode[i].getAttribute('Id') === referenceId) targetNode = refNode[i];
        }

        if (!targetNode) throw new Error(`Node com Id=${referenceId} não encontrado para apensar assinatura.`);

        const sigNode = new DOMParser().parseFromString(signatureXml).documentElement;

        // Manually inject X509Data
        const keyInfoNode = finalDoc.createElement('KeyInfo');
        const x509DataNode = finalDoc.createElement('X509Data');
        const x509CertNode = finalDoc.createElement('X509Certificate');

        x509CertNode.appendChild(finalDoc.createTextNode(x509Cert));
        x509DataNode.appendChild(x509CertNode);
        keyInfoNode.appendChild(x509DataNode);
        sigNode.appendChild(keyInfoNode);

        targetNode.parentNode!.appendChild(sigNode);

        return new XMLSerializer().serializeToString(finalDoc);
    }
}
