import { NfseMunicipalConfigService } from '../services/municipal-config.service.js';
import { INfseAdapter } from '../adapters/base.adapter.js';

import { AbrasfAdapter } from '../adapters/abrasf.adapter.js';
import { NacionalAdapter } from '../adapters/nacional.adapter.js';
import { CustomAdapter } from '../adapters/custom.adapter.js';

export class ProviderResolver {

    /**
     * Dynamically instantiates the correct adapter engine based on the city configured by the company.
     * It injects the specific settings (wsdl endpoints, decrypted tokens) inside the adapter initialization.
     */
    static async resolve(tenantId: string, companyId: string, cmun: string): Promise<INfseAdapter> {

        const config = await NfseMunicipalConfigService.getConfig(tenantId, companyId, cmun);

        if (!config || !config.provider) {
            throw new Error(`Nenhuma configuração municipal de provedor encontrada para a empresa no município IBGE: ${cmun}`);
        }

        const providerType = config.provider.type;

        switch (providerType) {
            case 'ABRASF':
                return new AbrasfAdapter(config);
            case 'NATIONAL':
                return new NacionalAdapter(config);
            case 'OTHER':
                return new CustomAdapter(config);
            default:
                throw new Error(`Tipo de provedor desconhecido: ${providerType}`);
        }
    }
}
