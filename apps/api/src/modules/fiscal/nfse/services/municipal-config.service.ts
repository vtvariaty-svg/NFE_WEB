import { prisma } from '../../../../index.js';
import { encryptCredential, decryptCredential } from './crypto.util.js';

interface ConfigPayload {
    cmun: string;
    uf: string;
    providerId: string;
    environment: 'HOMOLOGATION' | 'PRODUCTION';
    endpointBase?: string;
    wsdlUrl?: string;
    authMode: 'CERT_ONLY' | 'TOKEN' | 'LOGIN_MUNICIPAL';
    credentials?: any; // plain literal object holding passwords/tokens before encryption
}

export class NfseMunicipalConfigService {

    /**
     * Creates or updates a municipal configuration safely encrypting its credentials payload.
     */
    static async upsertConfig(tenantId: string, companyId: string, payload: ConfigPayload) {

        // 1. Validate target provider existence
        const provider = await prisma.nfseProvider.findUnique({
            where: { id: payload.providerId }
        });

        if (!provider) {
            throw new Error('Provedor base NFS-e não encontrado.');
        }

        // 2. Encrypt credentials if they exist (tokens/passwords)
        let safeEncryptedString = null;
        if (payload.credentials && Object.keys(payload.credentials).length > 0) {
            safeEncryptedString = encryptCredential(JSON.stringify(payload.credentials));
        }

        // 3. Upsert
        return prisma.nfseMunicipalConfig.upsert({
            where: {
                tenantId_companyId_cmun: {
                    tenantId,
                    companyId,
                    cmun: payload.cmun
                }
            },
            create: {
                tenantId,
                companyId,
                cmun: payload.cmun,
                uf: payload.uf,
                providerId: payload.providerId,
                environment: payload.environment,
                endpointBase: payload.endpointBase,
                wsdlUrl: payload.wsdlUrl,
                authMode: payload.authMode,
                credsEncrypted: safeEncryptedString
            },
            update: {
                uf: payload.uf,
                providerId: payload.providerId,
                environment: payload.environment,
                endpointBase: payload.endpointBase,
                wsdlUrl: payload.wsdlUrl,
                authMode: payload.authMode,
                credsEncrypted: safeEncryptedString
            }
        });
    }

    /**
     * Fetches configuration explicitly deciphering credentials to memory.
     */
    static async getConfig(tenantId: string, companyId: string, cmun: string) {
        const config = await prisma.nfseMunicipalConfig.findUnique({
            where: {
                tenantId_companyId_cmun: { tenantId, companyId, cmun }
            },
            include: { provider: true }
        });

        if (!config) return null;

        let decryptedCredentials = null;
        if (config.credsEncrypted) {
            try {
                const plainPayload = decryptCredential(config.credsEncrypted);
                decryptedCredentials = JSON.parse(plainPayload);
            } catch (err) {
                console.error('Failure breaking cipher for municipal credentials:', err);
                throw new Error('Credenciais corrompidas para o município atual.');
            }
        }

        return {
            ...config,
            credentials: decryptedCredentials
        };
    }
}
