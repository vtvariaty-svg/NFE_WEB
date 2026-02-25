import https from 'https';
import axios from 'axios';

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
            rejectUnauthorized: false, // Standard for fiscal webservices
            minVersion: 'TLSv1.2'
        };

        if (config.pfxBuffer && config.pfxPassword) {
            agentOptions.pfx = config.pfxBuffer;
            agentOptions.passphrase = config.pfxPassword;
        }

        this.httpsAgent = new https.Agent(agentOptions);
    }

    /**
     * Executes the SOAP Call enforcing TLS payload formatting.
     */
    async send(actionUrl: string, xmlEnvelope: string) {
        const start = Date.now();
        try {
            const response = await axios.post(this.wsdlUrl, xmlEnvelope, {
                httpsAgent: this.httpsAgent,
                headers: {
                    'Content-Type': 'application/soap+xml; charset=utf-8',
                    'SOAPAction': actionUrl
                },
                timeout: 30000 // 30s max
            });
            return { rawResponse: response.data, status: response.status, durationMs: Date.now() - start };
        } catch (error: any) {
            const status = error.response ? error.response.status : 500;
            const rawResponse = error.response ? error.response.data : error.message;
            return { rawResponse, status, durationMs: Date.now() - start, error: true };
        }
    }
}
