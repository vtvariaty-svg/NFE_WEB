/**
 * NfseMunicipalLayoutMap
 * 
 * Per-municipality overrides for NFS-e providers.
 * Different city halls use slightly different SOAP action names, namespaces,
 * and XML structures even when claiming to be "ABRASF compliant".
 * 
 * Key = IBGE 7-digit city code (cmun).
 */

interface MunicipalLayout {
    cityName: string;
    /** SOAP action name for batch submission */
    recepcionarLoteRpsAction?: string;
    /** SOAP action for cancellation */
    cancelarNfseAction?: string;
    /** SOAP action for batch status query */
    consultarSituacaoLoteAction?: string;
    /** SOAP action for query by RPS */
    consultarNfsePorRpsAction?: string;
    /** SOAP action for status ping */
    statusAction?: string;
    /** XML namespace override */
    namespace?: string;
    /** WSDL endpoint namespace override */
    wsdlNamespace?: string;
    /** Whether the city hall requires IM (Inscrição Municipal) on every call */
    requiresIM?: boolean;
    /** Whether RPS signing is required */
    requiresXmldsig?: boolean;
    /** Whether results are always synchronous */
    alwaysSync?: boolean;
}

const LAYOUT_MAP: Record<string, MunicipalLayout> = {
    // ── São Paulo / SP ──────────────────────────────────────────────────────
    '3550308': {
        cityName: 'São Paulo - SP',
        recepcionarLoteRpsAction: 'RecepcionarLoteRpsV3',
        cancelarNfseAction: 'CancelarNfseV3',
        consultarSituacaoLoteAction: 'ConsultarSituacaoLoteRpsV3',
        consultarNfsePorRpsAction: 'ConsultarNfseRpsV3',
        namespace: 'http://www.abrasf.org.br/nfse.xsd',
        requiresIM: true,
        requiresXmldsig: true,
        alwaysSync: false
    },
    // ── Rio de Janeiro / RJ ─────────────────────────────────────────────────
    '3304557': {
        cityName: 'Rio de Janeiro - RJ',
        recepcionarLoteRpsAction: 'RecepcionarLoteRps',
        cancelarNfseAction: 'CancelarNfse',
        consultarSituacaoLoteAction: 'ConsultarSituacaoLoteRps',
        consultarNfsePorRpsAction: 'ConsultarNfseRps',
        namespace: 'http://notacarioca.rio.gov.br/ISS/ abstraer/',
        requiresIM: true,
        requiresXmldsig: true,
        alwaysSync: true
    },
    // ── Belo Horizonte / MG ─────────────────────────────────────────────────
    '3106200': {
        cityName: 'Belo Horizonte - MG',
        recepcionarLoteRpsAction: 'RecepcionarLoteRpsV4',
        cancelarNfseAction: 'CancelarNfseV4',
        consultarSituacaoLoteAction: 'ConsultarSituacaoLoteRpsV4',
        consultarNfsePorRpsAction: 'ConsultarNfseRpsV4',
        namespace: 'http://bhiss.pbh.gov.br/nfse/services/',
        requiresIM: true,
        requiresXmldsig: false,
        alwaysSync: false
    },
    // ── Curitiba / PR ───────────────────────────────────────────────────────
    '4106902': {
        cityName: 'Curitiba - PR',
        recepcionarLoteRpsAction: 'RecepcionarLoteRps2',
        cancelarNfseAction: 'CancelarNfse2',
        consultarSituacaoLoteAction: 'ConsultarSituacaoLoteRps2',
        consultarNfsePorRpsAction: 'ConsultarNfseRps2',
        namespace: 'http://www.issdigital.curitiba.pr.gov.br/',
        requiresIM: false,
        requiresXmldsig: true,
        alwaysSync: false
    },
    // ── Porto Alegre / RS ───────────────────────────────────────────────────
    '4314902': {
        cityName: 'Porto Alegre - RS',
        recepcionarLoteRpsAction: 'RecepcionarLoteRps',
        cancelarNfseAction: 'CancelarNfse',
        consultarSituacaoLoteAction: 'ConsultarSituacaoLoteRps',
        consultarNfsePorRpsAction: 'ConsultarNfseRps',
        namespace: 'http://www.abrasf.org.br/nfse.xsd',
        requiresIM: true,
        requiresXmldsig: false,
        alwaysSync: false
    },
    // ── Fortaleza / CE ──────────────────────────────────────────────────────
    '2304400': {
        cityName: 'Fortaleza - CE',
        recepcionarLoteRpsAction: 'RecepcionarLoteRpsV3',
        cancelarNfseAction: 'CancelarNfseV3',
        consultarSituacaoLoteAction: 'ConsultarSituacaoLoteRpsV3',
        consultarNfsePorRpsAction: 'ConsultarNfseRpsV3',
        namespace: 'http://www.abrasf.org.br/nfse.xsd',
        requiresIM: true,
        requiresXmldsig: true,
        alwaysSync: false
    },
    // ── Manaus / AM ─────────────────────────────────────────────────────────
    '1302603': {
        cityName: 'Manaus - AM',
        recepcionarLoteRpsAction: 'RecepcionarLoteRps',
        cancelarNfseAction: 'CancelarNfse',
        consultarSituacaoLoteAction: 'ConsultarSituacaoLoteRps',
        consultarNfsePorRpsAction: 'ConsultarNfseRps',
        namespace: 'http://portal.manaus.am.gov.br/nfse',
        requiresIM: true,
        requiresXmldsig: false,
        alwaysSync: true
    },
    // ── Campinas / SP ───────────────────────────────────────────────────────
    '3509502': {
        cityName: 'Campinas - SP',
        recepcionarLoteRpsAction: 'RecepcionarLoteRps',
        cancelarNfseAction: 'CancelarNfse',
        consultarSituacaoLoteAction: 'ConsultarSituacaoLoteRps',
        consultarNfsePorRpsAction: 'ConsultarNfseRps',
        namespace: 'http://www.abrasf.org.br/nfse.xsd',
        requiresIM: true,
        requiresXmldsig: true,
        alwaysSync: false
    },
    // ── Florianópolis / SC ──────────────────────────────────────────────────
    '4205407': {
        cityName: 'Florianópolis - SC',
        recepcionarLoteRpsAction: 'RecepcionarLoteRps',
        cancelarNfseAction: 'CancelarNfse',
        consultarSituacaoLoteAction: 'ConsultarSituacaoLoteRps',
        consultarNfsePorRpsAction: 'ConsultarNfseRps',
        namespace: 'http://www.abrasf.org.br/nfse.xsd',
        requiresIM: false,
        requiresXmldsig: false,
        alwaysSync: true
    },
};

export class NfseMunicipalLayoutMap {
    /**
     * Returns municipality-specific layout overrides for the given IBGE code.
     * Falls back to a safe ABRASF default if city is not mapped.
     */
    static get(cmun: string): MunicipalLayout {
        return LAYOUT_MAP[cmun] ?? {
            cityName: `Município ${cmun} (padrão ABRASF)`,
            recepcionarLoteRpsAction: 'RecepcionarLoteRps',
            cancelarNfseAction: 'CancelarNfse',
            consultarSituacaoLoteAction: 'ConsultarSituacaoLoteRps',
            consultarNfsePorRpsAction: 'ConsultarNfseRps',
            namespace: 'http://www.abrasf.org.br/nfse.xsd',
            requiresIM: true,
            requiresXmldsig: false,
            alwaysSync: false
        };
    }

    /** Returns all cities in the map */
    static listAll(): Record<string, string> {
        return Object.fromEntries(
            Object.entries(LAYOUT_MAP).map(([cmun, l]) => [cmun, l.cityName])
        );
    }
}
