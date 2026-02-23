import https from 'https';
import { prisma } from '../../../../index.js';

export class SefazSoapClient {

    /**
     * Dispatch a SOAP POST request to SEFAZ using Mutual TLS authentication.
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
        return new Promise((resolve, reject) => {

            const agent = new https.Agent({
                pfx: pfxBuffer,
                passphrase: password,
                rejectUnauthorized: false,     // Allow self-signed test SEFAZ certs if needed
                keepAlive: true,
                minVersion: 'TLSv1.2'          // SEFAZ strictly requires TLS 1.2+
            });

            const parsedUrl = new URL(url);

            const options: https.RequestOptions = {
                hostname: parsedUrl.hostname,
                port: parsedUrl.port || 443,
                path: parsedUrl.pathname + parsedUrl.search,
                method: 'POST',
                agent: agent,
                headers: {
                    'Content-Type': 'application/soap+xml; charset=utf-8',
                    'Content-Length': Buffer.byteLength(xmlBody, 'utf8'),
                    // SEFAZ expects SOAPAction in header or inline Content-Type for SOAP 1.2
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

            req.on('error', async (error: any) => {
                const durationMs = Date.now() - startTime;
                await this.logSefazCall(tenantId, companyId, xmlBody, error.message, 500, durationMs, soapAction, invoiceId);
                reject(new Error(`Falha de rede ao contatar SEFAZ: ${error.message}`));
            });

            // Write SOAP XML
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
                    tenantId,
                    companyId,
                    invoiceId,
                    service,
                    requestXml,
                    responseXml,
                    httpStatus,
                    durationMs
                }
            });
        } catch (dbErr) {
            console.error('Falha ao salvar SEFAZ log de auditoria', dbErr);
        }
    }
}
