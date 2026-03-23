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

        if (!certParams.thumbprint) {
            throw new Error('Falha ao processar o certificado. Certifique-se de ser um e-CNPJ (A1) válido.');
        }

        // 2. Validate against Company document (CNPJ) — only when CNPJ could be extracted
        const company = await prisma.company.findFirst({
            where: { id: companyId, tenantId }
        });

        if (!company) {
            throw new Error('Empresa não encontrada neste tenant.');
        }

        if (certParams.subjectCnpj) {
            const cleanCompanyCnpj = company.document.replace(/\D/g, '');
            const cleanCertCnpj = certParams.subjectCnpj.replace(/\D/g, '');
            if (cleanCompanyCnpj !== cleanCertCnpj) {
                throw new Error(`O CNPJ do certificado (${cleanCertCnpj}) não corresponde ao CNPJ da empresa (${cleanCompanyCnpj}).`);
            }
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

        // 7. Sync to Nuvem Fiscal if the provider is active — full 3-step bootstrap
        const isNuvemFiscal =
            process.env.NUVEM_FISCAL_ENABLED === 'true' ||
            process.env.FISCAL_PROVIDER === 'nuvem_fiscal';

        if (isNuvemFiscal) {
            const cnpjClean = company.document.replace(/\D/g, '');
            const pfxBase64 = pfxBuffer.toString('base64');
            try {
                const {
                    createOrUpdateCompany,
                    uploadCertificate,
                    configureNfeService
                } = await import('../../providers/nuvemFiscal/nuvem-fiscal.bootstrap.js');

                const defaultAmbiente = (process.env.NUVEM_FISCAL_DEFAULT_AMBIENTE as 'homologacao' | 'producao') ?? 'homologacao';

                // Step 1: Register company (idempotent)
                await createOrUpdateCompany({
                    cpf_cnpj: cnpjClean,
                    nome_razao_social: company.name,
                    nome_fantasia: company.name,
                    inscricao_estadual: (company as any).ie || undefined,
                    regime_tributario: 'simples_nacional',
                    endereco: {
                        logradouro: (company as any).street || 'Rua',
                        numero: (company as any).number || 'SN',
                        bairro: (company as any).district || 'Centro',
                        codigo_municipio: (company as any).ibgeCode || '0000000',
                        cidade: (company as any).city || 'Cidade',
                        uf: (company as any).state || 'SP',
                        cep: ((company as any).zipCode || '00000000').replace(/\D/g, '')
                    }
                });

                // Step 2: Upload certificate
                await uploadCertificate(cnpjClean, pfxBase64, password);

                // Step 3: Configure NF-e service
                await configureNfeService(cnpjClean, { ambiente: defaultAmbiente });

                console.info(`[CertificateService] Bootstrap Nuvem Fiscal concluído para CNPJ ${cnpjClean}`);
                await this.logUsage(certificate.id, tenantId, 'SYNCED_NUVEM_FISCAL', 'Bootstrap completo: empresa + certificado + NF-e config enviados à Nuvem Fiscal');
            } catch (syncErr: any) {
                console.error(`[CertificateService] Falha no bootstrap Nuvem Fiscal: ${syncErr.message}`);
                await this.logUsage(certificate.id, tenantId, 'SYNC_NUVEM_FISCAL_FAILED', syncErr.message);
            }
        }


        return {
            id: certificate.id,
            thumbprint: certificate.thumbprint,
            validFrom: certificate.validFrom,
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
        // ── Step 1: Validate password via Node.js native TLS (OpenSSL) ──────────
        // This supports all modern PFX formats including SHA-256 MAC (ICP-Brasil A1).
        // node-forge only supports SHA-1 MAC — modern certs will fail with forge alone.
        try {
            const tls = require('tls');
            tls.createSecureContext({ pfx: pfxBuffer, passphrase: password });
        } catch (tlsErr: any) {
            throw new Error(`Senha do certificado incorreta ou arquivo PFX inválido: ${tlsErr.message}`);
        }

        // ── Step 2: Parse metadata using node-forge ──────────────────────────────
        // For SHA-256 MAC certs, forge MAC check fails. Workaround: try with password
        // first; on failure, try with empty password (MAC skipped) to extract cert bags
        // since the certificate itself is NOT encrypted in PKCS#12 – only the private key is.
        let cert: forge.pki.Certificate | null = null;
        let privateKeyExists = false;

        const tryForge = (pwd: string) => {
            try {
                const p12Asn1 = forge.asn1.fromDer(pfxBuffer.toString('binary'));
                const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, pwd);
                for (const safeContents of p12.safeContents) {
                    for (const safeBag of safeContents.safeBags) {
                        if (safeBag.type === forge.pki.oids.certBag && safeBag.cert) {
                            cert = safeBag.cert as forge.pki.Certificate;
                        } else if (
                            safeBag.type === forge.pki.oids.pkcs8ShroudedKeyBag ||
                            safeBag.type === forge.pki.oids.keyBag
                        ) {
                            privateKeyExists = true;
                        }
                    }
                }
                return true;
            } catch {
                return false;
            }
        };

        // Try 1: normal (SHA-1 MAC certs)
        // Try 2: empty string password for forge MAC (SHA-256 MAC certs — password already validated by TLS above)
        const forgeOk = tryForge(password) || tryForge('');

        // ── Step 3: Extract thumbprint and metadata ───────────────────────────────
        let thumbprint: string;
        let validFrom: Date;
        let validTo: Date;
        let subjectCnpj = '';
        let subjectName = '';

        if (cert && forgeOk) {
            // Full forge metadata extraction
            const certDer = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
            const md = forge.md.sha1.create();
            md.update(certDer);
            thumbprint = md.digest().toHex().toUpperCase();

            validFrom = (cert as any).validity.notBefore;
            validTo = (cert as any).validity.notAfter;

            const cnObj = (cert as any).subject.getField('CN');
            if (cnObj?.value) {
                const cnString = cnObj.value.toString();
                const match = cnString.match(/^(.*?):(\d{14})$/);
                if (match) {
                    subjectName = match[1].trim();
                    subjectCnpj = match[2];
                } else {
                    const fallback = cnString.match(/(\d{14})/);
                    if (fallback) { subjectCnpj = fallback[1]; }
                    subjectName = cnString;
                }
            }

            if (!subjectCnpj) {
                const snObj = (cert as any).subject.getField({ type: '2.5.4.5' });
                if (snObj?.value) {
                    subjectCnpj = snObj.value.toString().replace(/\D/g, '').slice(0, 14);
                }
            }

            if (!subjectCnpj) {
                for (const attr of (cert as any).subject.attributes) {
                    if (attr.type === '2.16.76.1.3.3') {
                        const val = (attr.value ?? '').toString().replace(/\D/g, '');
                        if (val.length === 14) { subjectCnpj = val; break; }
                    }
                }
            }

            if (!subjectCnpj) {
                try {
                    const sanExt = (cert as any).getExtension('subjectAltName') as any;
                    if (sanExt?.altNames) {
                        for (const altName of sanExt.altNames) {
                            if (altName.type === 0) {
                                const digits = (altName.value ?? '').toString().replace(/\D/g, '');
                                if (digits.length >= 14) { subjectCnpj = digits.slice(-14); break; }
                            }
                        }
                    }
                } catch { /* ignore */ }
            }

            if (!subjectCnpj) {
                for (const attr of (cert as any).subject.attributes) {
                    const val = (attr.value ?? '').toString().replace(/\D/g, '');
                    if (val.length === 14) { subjectCnpj = val; break; }
                }
            }

            // ── private key existence: if forge couldn't parse key bags (encrypted with
            //    AES-256 unsupported by forge), TLS validation above confirms key is there
            if (!privateKeyExists) {
                privateKeyExists = true; // TLS already validated key+cert pair
            }
        } else {
            // Forge couldn't parse at all — TLS already confirmed the PFX is valid.
            // Generate thumbprint from the raw buffer as a stable identifier.
            thumbprint = crypto.createHash('sha1').update(pfxBuffer).digest('hex').toUpperCase();
            validFrom = new Date();
            validTo = new Date(Date.now() + 3 * 365 * 24 * 60 * 60 * 1000); // ~3 years
            privateKeyExists = true; // TLS confirmed
            console.warn('[CertificateService] forge could not parse PFX metadata; using minimal info. TLS validation passed.');
        }

        if (!thumbprint!) {
            thumbprint = crypto.createHash('sha1').update(pfxBuffer).digest('hex').toUpperCase();
        }

        return { thumbprint, validFrom: validFrom!, validTo: validTo!, subjectCnpj, subjectName };
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
