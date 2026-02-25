import https from 'https';
import axios, { AxiosInstance } from 'axios';

interface RestClientConfig {
    baseURL: string;
    token?: string;
    pfxBuffer?: Buffer;
    pfxPassword?: string;
}

export class NfseRestClient {
    private client: AxiosInstance;

    constructor(config: RestClientConfig) {

        const httpsAgentOptions: https.AgentOptions = {
            rejectUnauthorized: false // Often required for SEFAZ/City webservices
        };

        if (config.pfxBuffer && config.pfxPassword) {
            httpsAgentOptions.pfx = config.pfxBuffer;
            httpsAgentOptions.passphrase = config.pfxPassword;
        }

        const agent = new https.Agent(httpsAgentOptions);

        this.client = axios.create({
            baseURL: config.baseURL,
            httpsAgent: agent,
            headers: {
                'Content-Type': 'application/json',
                ...(config.token ? { 'Authorization': `Bearer ${config.token}` } : {})
            }
        });
    }

    async post(path: string, payload: any) {
        const start = Date.now();
        try {
            const { data, status } = await this.client.post(path, payload);
            return { rawResponse: data, status, durationMs: Date.now() - start };
        } catch (error: any) {
            const status = error.response ? error.response.status : 500;
            const rawResponse = error.response ? error.response.data : error.message;
            return { rawResponse, status, durationMs: Date.now() - start, error: true };
        }
    }

    async get(path: string) {
        const start = Date.now();
        try {
            const { data, status } = await this.client.get(path);
            return { rawResponse: data, status, durationMs: Date.now() - start };
        } catch (error: any) {
            const status = error.response ? error.response.status : 500;
            const rawResponse = error.response ? error.response.data : error.message;
            return { rawResponse, status, durationMs: Date.now() - start, error: true };
        }
    }
}
