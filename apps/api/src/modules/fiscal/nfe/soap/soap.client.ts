import https from 'https';
import { prisma } from '../../../../index.js';

const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 3000, 5000]; // Progressive backoff: 1s, 3s, 5s
const TIMEOUT_MS = 30_000; // 30 second timeout

export class SefazSoapClient {

    /**
     * Dispatch a SOAP POST request to SEFAZ using Mutual TLS authentication.
     * Includes automatic retry with progressive backoff for transient failures.
     */
    static async send(
        url: string,
        soapAction: string,
        xmlBody: string,
        pfxBuffer: Buffer,
        password: string,
        tenantId: string,
        companyId: string,
        invoiceId?: string
    ): Promise<string> {
        let lastError: Error | null = null;

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
                const result = await this.doRequest(url, soapAction, xmlBody, pfxBuffer, password, tenantId, companyId, invoiceId);
                return result;
            } catch (err: any) {
                lastError = err;

                // Don't retry on non-transient errors (4xx, certificate issues)
                if (err.message?.includes('certificate') || err.message?.includes('400') || err.message?.includes('403')) {
                    throw err;
                }

                if (attempt < MAX_RETRIES) {
                    const delay = RETRY_DELAYS[attempt] || 5000;
                    console.log(JSON.stringify({
                        level: 'warn', tenantId, service: 'SefazSoapClient',
                        msg: `SOAP retry ${attempt + 1}/${MAX_RETRIES}`, delay, url
                    }));
                    await new Promise(r => setTimeout(r, delay));
                }
            }
        }

        throw lastError || new Error('SEFAZ SOAP request failed after retries');
    }

    private static doRequest(
        url: string, soapAction: string, xmlBody: string,
        pfxBuffer: Buffer, password: string,
        tenantId: string, companyId: string, invoiceId?: string
    ): Promise<string> {
        return new Promise((resolve, reject) => {
            const agent = new https.Agent({
                pfx: pfxBuffer,
                passphrase: password,
                rejectUnauthorized: false,
                keepAlive: true,
                minVersion: 'TLSv1.2'
            });

            const parsedUrl = new URL(url);

            const options: https.RequestOptions = {
                hostname: parsedUrl.hostname,
                port: parsedUrl.port || 443,
                path: parsedUrl.pathname + parsedUrl.search,
                method: 'POST',
                agent,
                timeout: TIMEOUT_MS,
                headers: {
                    'Content-Type': 'application/soap+xml; charset=utf-8',
                    'Content-Length': Buffer.byteLength(xmlBody, 'utf8'),
                    'SOAPAction': soapAction
                }
            };

            const startTime = Date.now();
            let responseBody = '';
            let statusCode = 0;

            const req = https.request(options, (res) => {
                statusCode = res.statusCode || 500;
                res.setEncoding('utf8');

                res.on('data', (chunk) => {
                    responseBody += chunk;
                });

                res.on('end', async () => {
                    const durationMs = Date.now() - startTime;
                    await this.logSefazCall(tenantId, companyId, xmlBody, responseBody, statusCode, durationMs, soapAction, invoiceId);

                    if (statusCode >= 200 && statusCode < 300) {
                        resolve(responseBody);
                    } else {
                        reject(new Error(`SEFAZ HTTP Error ${statusCode}: ${responseBody}`));
                    }
                });
            });

            req.on('timeout', () => {
                req.destroy(new Error(`SEFAZ timeout after ${TIMEOUT_MS}ms`));
            });

            req.on('error', async (error: any) => {
                const durationMs = Date.now() - startTime;
                await this.logSefazCall(tenantId, companyId, xmlBody, error.message, 500, durationMs, soapAction, invoiceId);
                reject(new Error(`Falha de rede ao contatar SEFAZ: ${error.message}`));
            });

            req.write(xmlBody);
            req.end();
        });
    }

    private static async logSefazCall(
        tenantId: string, companyId: string, requestXml: string, responseXml: string,
        httpStatus: number, durationMs: number, service: string, invoiceId?: string
    ) {
        try {
            await prisma.sefazLog.create({
                data: {
                    tenantId, companyId, invoiceId, service,
                    requestXml, responseXml, httpStatus, durationMs
                }
            });
        } catch (dbErr) {
            console.error(JSON.stringify({ level: 'error', service: 'SefazSoapClient', msg: 'Failed to save SEFAZ log', dbErr }));
        }
    }
}
