import https from 'https';

const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 3000, 5000];
const TIMEOUT_MS = 30_000;

interface SoapClientConfig {
    wsdlUrl: string;
    pfxBuffer?: Buffer;
    pfxPassword?: string;
}

export class NfseSoapClient {
    private wsdlUrl: string;
    private httpsAgent: https.Agent;

    constructor(config: SoapClientConfig) {
        this.wsdlUrl = config.wsdlUrl;

        const agentOptions: https.AgentOptions = {
            rejectUnauthorized: false,
            minVersion: 'TLSv1.2',
            timeout: TIMEOUT_MS
        };

        if (config.pfxBuffer && config.pfxPassword) {
            agentOptions.pfx = config.pfxBuffer;
            agentOptions.passphrase = config.pfxPassword;
        }

        this.httpsAgent = new https.Agent(agentOptions);
    }

    /**
     * Executes the SOAP Call with retry and timeout.
     */
    async send(actionUrl: string, xmlEnvelope: string) {
        let lastError: any = null;

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
                return await this.doSend(actionUrl, xmlEnvelope);
            } catch (err: any) {
                lastError = err;

                // Don't retry on cert/auth errors
                if (err.message?.includes('certificate') || err.message?.includes('403')) {
                    throw err;
                }

                if (attempt < MAX_RETRIES) {
                    const delay = RETRY_DELAYS[attempt] || 5000;
                    console.log(JSON.stringify({
                        level: 'warn', service: 'NfseSoapClient',
                        msg: `SOAP retry ${attempt + 1}/${MAX_RETRIES}`, delay, url: this.wsdlUrl
                    }));
                    await new Promise(r => setTimeout(r, delay));
                }
            }
        }

        throw lastError || new Error('NFS-e SOAP request failed after retries');
    }

    private async doSend(actionUrl: string, xmlEnvelope: string) {
        const start = Date.now();

        // Use dynamic import for fetch-based approach or https
        return new Promise<{ rawResponse: string; status: number; durationMs: number; error?: boolean }>((resolve, reject) => {
            const parsedUrl = new URL(this.wsdlUrl);

            const options: https.RequestOptions = {
                hostname: parsedUrl.hostname,
                port: parsedUrl.port || 443,
                path: parsedUrl.pathname + parsedUrl.search,
                method: 'POST',
                agent: this.httpsAgent,
                timeout: TIMEOUT_MS,
                headers: {
                    'Content-Type': 'application/soap+xml; charset=utf-8',
                    'Content-Length': Buffer.byteLength(xmlEnvelope, 'utf8'),
                    'SOAPAction': actionUrl
                }
            };

            let responseBody = '';

            const req = https.request(options, (res) => {
                res.setEncoding('utf8');
                res.on('data', (chunk) => { responseBody += chunk; });
                res.on('end', () => {
                    const durationMs = Date.now() - start;
                    const status = res.statusCode || 500;
                    if (status >= 200 && status < 300) {
                        resolve({ rawResponse: responseBody, status, durationMs });
                    } else {
                        reject(new Error(`NFS-e SOAP HTTP ${status}: ${responseBody.substring(0, 500)}`));
                    }
                });
            });

            req.on('timeout', () => {
                req.destroy(new Error(`NFS-e SOAP timeout after ${TIMEOUT_MS}ms`));
            });

            req.on('error', (error: any) => {
                reject(new Error(`NFS-e SOAP network error: ${error.message}`));
            });

            req.write(xmlEnvelope);
            req.end();
        });
    }
}
