import crypto from 'crypto';
import forge from 'node-forge';
import { prisma } from '../../../../index.js';

if (!process.env.CRYPTO_MASTER_KEY || process.env.CRYPTO_MASTER_KEY.length !== 32) {
    console.warn('WARNING: CRYPTO_MASTER_KEY is not set or not 32 bytes. Certificate encryption may fail.');
}

const ALGORITHM = 'aes-256-gcm';

export class CertificateService {

    /**
     * Upload an A1 Certificate (PFX), validate it, extract main details, encrypt it and store it.
     */
    static async uploadA1Certificate(tenantId: string, companyId: string, pfxBuffer: Buffer, password: string) {
        // 1. Validate PFX password and extract details
        const certParams = this.extractPfxDetails(pfxBuffer, password);

        if (!certParams.thumbprint || !certParams.subjectCnpj) {
            throw new Error('Falha ao processar o certificado. Certifique-se de ser um e-CNPJ (A1) válido.');
        }

        // 2. Validate against Company document (CNPJ)
        const company = await prisma.company.findFirst({
            where: { id: companyId, tenantId }
        });

        if (!company) {
            throw new Error('Empresa não encontrada neste tenant.');
        }

        const cleanCompanyCnpj = company.document.replace(/\D/g, '');
        const cleanCertCnpj = certParams.subjectCnpj.replace(/\D/g, '');

        if (cleanCompanyCnpj !== cleanCertCnpj) {
            throw new Error(`O CNPJ do certificado (${cleanCertCnpj}) não corresponde ao CNPJ da empresa (${cleanCompanyCnpj}).`);
        }

        // 3. Encrypt the PFX buffer and password together
        const pfxBase64 = pfxBuffer.toString('base64');
        const { encrypted, iv, salt } = this.encryptPfxPass(pfxBase64, password);

        // 4. Deactivate previous active certificates for this company
        await prisma.certificate.updateMany({
            where: { companyId, tenantId, isActive: true },
            data: { isActive: false }
        });

        // 5. Create the new certificate
        const certificate = await prisma.certificate.create({
            data: {
                tenantId,
                companyId,
                certType: 'A1',
                pfxEncrypted: encrypted,
                pfxIv: iv,
                pfxSalt: salt,
                thumbprint: certParams.thumbprint,
                validFrom: certParams.validFrom,
                validTo: certParams.validTo,
                isActive: true
            }
        });

        // 6. Log the upload
        await this.logUsage(certificate.id, tenantId, 'UPLOADED', `Certificado A1 carregado: ${certParams.subjectName}`);

        return {
            id: certificate.id,
            thumbprint: certificate.thumbprint,
            validTo: certificate.validTo,
            companyName: certParams.subjectName
        };
    }

    /**
     * Renew certificate — upload new PFX, deactivate old, log RENEWED
     */
    static async renewCertificate(tenantId: string, companyId: string, pfxBuffer: Buffer, password: string, label?: string) {
        const oldCert = await prisma.certificate.findFirst({
            where: { tenantId, companyId, isActive: true }
        });

        const result = await this.uploadA1Certificate(tenantId, companyId, pfxBuffer, password);

        // Update label if provided
        if (label) {
            await prisma.certificate.update({ where: { id: result.id }, data: { label } });
        }

        // Log renewal (linked to new cert)
        await this.logUsage(result.id, tenantId, 'RENEWED',
            oldCert ? `Renovação do certificado ${oldCert.thumbprint}` : 'Primeiro certificado'
        );

        return result;
    }

    /**
     * Revoke a specific certificate
     */
    static async revokeCertificate(tenantId: string, certId: string) {
        const cert = await prisma.certificate.findFirst({ where: { id: certId, tenantId } });
        if (!cert) throw new Error('Certificado não encontrado.');

        await prisma.certificate.update({
            where: { id: certId },
            data: { isActive: false, revokedAt: new Date() }
        });

        await this.logUsage(certId, tenantId, 'REVOKED', 'Certificado revogado pelo usuário');
        return { success: true };
    }

    /**
     * Get the active certificate for a company and decrypt the PFX buffer.
     * Ready to be used by the mutual TLS / SOAP client and XMLDSIG.
     */
    static async getActiveCert(tenantId: string, companyId: string) {
        const certRecord = await prisma.certificate.findFirst({
            where: {
                tenantId,
                companyId,
                isActive: true,
                certType: 'A1'
            }
        });

        if (!certRecord) {
            throw new Error('Nenhum certificado ativo encontrado para esta empresa.');
        }

        // Expiration Check
        if (certRecord.validTo && certRecord.validTo < new Date()) {
            await this.logUsage(certRecord.id, tenantId, 'EXPIRED_BLOCKED', 'Tentativa de uso de certificado expirado');
            throw new Error('O certificado vinculado à empresa está expirado.');
        }

        const payload = this.decryptPfxPass(certRecord.pfxEncrypted, certRecord.pfxIv, certRecord.pfxSalt);

        // Log usage (fire-and-forget)
        this.logUsage(certRecord.id, tenantId, 'USED_FOR_SIGNING').catch(() => { });

        return {
            ...certRecord,
            pfxBuffer: Buffer.from(payload.pfxBase64, 'base64'),
            password: payload.password
        };
    }

    /**
     * Log certificate usage to CertificateLog
     */
    static async logUsage(certificateId: string, tenantId: string, action: string, detail?: string) {
        await prisma.certificateLog.create({
            data: { certificateId, tenantId, action, detail }
        });
    }

    // --- Private / Internal Helpers ---

    private static extractPfxDetails(pfxBuffer: Buffer, password: string) {
        try {
            const p12Asn1 = forge.asn1.fromDer(pfxBuffer.toString('binary'));
            const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, password);

            let cert: forge.pki.Certificate | null = null;
            let privateKeyExists = false;

            for (const safeContents of p12.safeContents) {
                for (const safeBag of safeContents.safeBags) {
                    if (safeBag.type === forge.pki.oids.certBag) {
                        cert = safeBag.cert as forge.pki.Certificate;
                    } else if (safeBag.type === forge.pki.oids.pkcs8ShroudedKeyBag || safeBag.type === forge.pki.oids.keyBag) {
                        privateKeyExists = true;
                    }
                }
            }

            if (!cert || !privateKeyExists) {
                throw new Error('O PFX não contém a chave privada ou certificado público.');
            }

            // Extract thumbprint (SHA-1 fingerprint of the certificate)
            const certDer = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
            const md = forge.md.sha1.create();
            md.update(certDer);
            const thumbprint = md.digest().toHex().toUpperCase();

            // Extract valid dates
            const validFrom = cert.validity.notBefore;
            const validTo = cert.validity.notAfter;

            // Extract CNPJ and name from Subject
            // Brazilian e-CNPJ patterns usually place the CNPJ linked with the name or in OUIDs, OU, or SN.
            // Often "Nome da Empresa:12345678000199" in CN (Common Name).
            let subjectCnpj = '';
            let subjectName = '';

            const cnObj = cert.subject.getField('CN');
            if (cnObj && cnObj.value) {
                const cnString = cnObj.value.toString();
                // CN usually looks like: "EMPRESA LTDA:12345678000100"
                const match = cnString.match(/^(.*?):(\d{14})$/);
                if (match) {
                    subjectName = match[1].trim();
                    subjectCnpj = match[2];
                } else {
                    // Try to find CNPJ anywhere in the CN string if pattern differs
                    const fallbackMatch = cnString.match(/(\d{14})/);
                    if (fallbackMatch) {
                        subjectCnpj = fallbackMatch[1];
                        subjectName = cnString;
                    }
                }
            }

            // Try extracting from OUID (2.5.4.5) if not placed in CN
            if (!subjectCnpj) {
                const snObj = cert.subject.getField('2.5.4.5'); // SerialNumber
                if (snObj && snObj.value) {
                    subjectCnpj = snObj.value.toString().replace(/\D/g, '');
                }
            }

            return {
                thumbprint,
                validFrom,
                validTo,
                subjectCnpj,
                subjectName
            };
        } catch (error: any) {
            throw new Error(`Erro ao interpretar PFX/Senha incorreta: ${error.message}`);
        }
    }

    private static encryptPfxPass(pfxBase64: string, password: string) {
        const masterKeyStr = process.env.CRYPTO_MASTER_KEY;
        if (!masterKeyStr || masterKeyStr.length !== 32) {
            throw new Error('CRYPTO_MASTER_KEY configuration is missing or invalid.');
        }

        const jsonStr = JSON.stringify({ pfxBase64, password });
        const buffer = Buffer.from(jsonStr, 'utf-8');

        const iv = crypto.randomBytes(12);
        const salt = crypto.randomBytes(16); // Additional entropy for future PBKDF2 if needed

        const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(masterKeyStr, 'utf-8'), iv);

        let encrypted = cipher.update(buffer);
        encrypted = Buffer.concat([encrypted, cipher.final()]);

        const authTag = cipher.getAuthTag();

        // We store authTag appended to the encrypted string for simplicity (Base64)
        const finalPayload = Buffer.concat([authTag, encrypted]);

        return {
            encrypted: finalPayload.toString('base64'),
            iv: iv.toString('base64'),
            salt: salt.toString('base64')
        };
    }

    private static decryptPfxPass(encryptedBase64: string, ivBase64: string, saltBase64: string): { pfxBase64: string, password: string } {
        const masterKeyStr = process.env.CRYPTO_MASTER_KEY;
        if (!masterKeyStr || masterKeyStr.length !== 32) {
            throw new Error('CRYPTO_MASTER_KEY configuration is missing or invalid.');
        }

        const iv = Buffer.from(ivBase64, 'base64');
        const finalPayload = Buffer.from(encryptedBase64, 'base64');

        // GCM standard auth tag is 16 bytes
        const authTag = finalPayload.subarray(0, 16);
        const encrypted = finalPayload.subarray(16);

        const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(masterKeyStr, 'utf-8'), iv);
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(encrypted);
        decrypted = Buffer.concat([decrypted, decipher.final()]);

        return JSON.parse(decrypted.toString('utf-8'));
    }
}
