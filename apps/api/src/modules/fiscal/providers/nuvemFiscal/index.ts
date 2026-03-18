// Public surface of the Nuvem Fiscal provider module.
// Import from here — never from internal files directly.

export type {
    NuvemFiscalEmpresaPayload,
    NuvemFiscalEmpresaResponse,
    NuvemFiscalCertificadoPayload,
    NuvemFiscalCertificadoResponse,
    NuvemFiscalNfeConfigPayload,
    NuvemFiscalNfeConfigResponse,
    NuvemFiscalNfePayload,
    NuvemFiscalNfeResponse,
    NuvemFiscalNfeStatus,
    NuvemFiscalNfeAmbiente,
    NuvemFiscalCrt,
    NuvemFiscalEndereco,
    NuvemFiscalRegimeTributario,
} from './types.js';

export { NuvemFiscalError, mapNuvemFiscalError, isRetryable } from './errors.js';
export { getToken, clearTokenCache } from './token.provider.js';
export { nuvemFiscalHttp } from './http.client.js';

export {
    createOrUpdateCompany,
    uploadCertificate,
    configureNfeService,
    bootstrapEmpresa,
} from './nuvem-fiscal.bootstrap.js';
export type { BootstrapInput, BootstrapResult } from './nuvem-fiscal.bootstrap.js';

export { NuvemFiscalProvider, getNuvemFiscalProvider } from './nuvem-fiscal.provider.js';
