/**
 * Fiscal Readiness Validation
 *
 * Central helper that validates whether Company, Customer and Product records
 * have the minimum data required for NF-e emission.
 *
 * Contract (v2 — backward compatible):
 *   ready         boolean  — true only when no errors exist
 *   errors        string[] — blocking issues; emission MUST NOT proceed
 *   warnings      string[] — non-blocking; recommended before production
 *   missingFields string[] — machine-readable field names
 *   missing       string[] — alias for errors[] (kept for backward compat)
 *   summary       string   — human-readable one-liner
 */

// ── Shared result contract ────────────────────────────────────────────────────

export interface FiscalReadinessResult {
    ready: boolean;
    errors: string[];
    warnings: string[];
    missingFields: string[];
    /** @deprecated kept for backward compatibility — equals errors[] */
    missing: string[];
    summary: string;
}

function buildResult(
    errors: string[],
    warnings: string[],
    missingFields: string[]
): FiscalReadinessResult {
    const ready = errors.length === 0;
    const summary = ready
        ? warnings.length > 0
            ? `Pronto para emissão, mas com ${warnings.length} aviso(s)`
            : 'Pronto para emissão'
        : `${errors.length} campo(s) obrigatório(s) ausente(s) — emissão bloqueada`;

    return { ready, errors, warnings, missingFields, missing: errors, summary };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function present(v: string | null | undefined): boolean {
    return typeof v === 'string' && v.trim().length > 0;
}

// ── Per-entity data interfaces ────────────────────────────────────────────────

export interface CompanyFiscalData {
    ibgeCode?: string | null;
    crt?: string | null;
}

export interface CertificateStatus {
    exists: boolean;
    expired: boolean;
    daysToExpiry: number | null;
    /** Only set when provider requires certificate (sefaz_direct) */
    required: boolean;
}

export interface CustomerFiscalData {
    ibgeCode?: string | null;
}

export interface ProductFiscalData {
    ncm?: string | null;
    icmsCst?: string | null;
    pisCst?: string | null;
    cofinsCst?: string | null;
}

// ── Per-entity checks ─────────────────────────────────────────────────────────

export function checkCompanyFiscalReadiness(
    company: CompanyFiscalData,
    cert?: CertificateStatus
): FiscalReadinessResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const missingFields: string[] = [];

    if (!present(company.ibgeCode)) {
        errors.push('Código IBGE do município (ibgeCode) ausente');
        missingFields.push('ibgeCode');
    }
    if (!present(company.crt)) {
        errors.push('Regime tributário (CRT) ausente');
        missingFields.push('crt');
    }

    if (cert) {
        if (!cert.exists) {
            const msg = 'Certificado digital A1 não cadastrado';
            if (cert.required) {
                errors.push(msg);
                missingFields.push('certificadoA1');
            } else {
                warnings.push(msg + ' — obrigatório antes de emitir em produção');
            }
        } else if (cert.expired) {
            errors.push('Certificado digital A1 expirado');
            missingFields.push('certificadoA1');
        } else if (cert.daysToExpiry !== null && cert.daysToExpiry <= 30) {
            warnings.push(`Certificado digital A1 vence em ${cert.daysToExpiry} dia(s)`);
        }
    }

    return buildResult(errors, warnings, missingFields);
}

export function checkCustomerFiscalReadiness(customer: CustomerFiscalData): FiscalReadinessResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const missingFields: string[] = [];

    if (!present(customer.ibgeCode)) {
        errors.push('Código IBGE do município (ibgeCode) ausente');
        missingFields.push('ibgeCode');
    }

    return buildResult(errors, warnings, missingFields);
}

export function checkProductFiscalReadiness(product: ProductFiscalData): FiscalReadinessResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const missingFields: string[] = [];

    if (!present(product.ncm)) {
        errors.push('NCM ausente');
        missingFields.push('ncm');
    }
    if (!present(product.icmsCst)) {
        errors.push('ICMS CST/CSOSN ausente');
        missingFields.push('icmsCst');
    }
    if (!present(product.pisCst)) {
        errors.push('PIS CST ausente');
        missingFields.push('pisCst');
    }
    if (!present(product.cofinsCst)) {
        errors.push('COFINS CST ausente');
        missingFields.push('cofinsCst');
    }

    return buildResult(errors, warnings, missingFields);
}

// ── Emission pre-flight (all entities in one call) ────────────────────────────

export interface EmissionFiscalItem extends ProductFiscalData {
    codigoProduto: string;
}

export interface ValidateFiscalReadinessOpts {
    company: CompanyFiscalData;
    customer: CustomerFiscalData;
    items: EmissionFiscalItem[];
    referencia?: string | null;
}

export interface EmissionReadinessResult {
    ready: boolean;
    errors: string[];
    warnings: string[];
    missingFields: string[];
    summary: string;
}

/**
 * Validates all fiscal preconditions before NF-e emission.
 * Returns structured result so callers can return a 422 with all issues at once.
 */
export function validateFiscalReadiness(opts: ValidateFiscalReadinessOpts): EmissionReadinessResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const missingFields: string[] = [];

    const companyCheck = checkCompanyFiscalReadiness(opts.company);
    errors.push(...companyCheck.errors.map(e => `Empresa: ${e}`));
    warnings.push(...companyCheck.warnings.map(w => `Empresa: ${w}`));
    missingFields.push(...companyCheck.missingFields.map(f => `company.${f}`));

    const customerCheck = checkCustomerFiscalReadiness(opts.customer);
    errors.push(...customerCheck.errors.map(e => `Destinatário: ${e}`));
    warnings.push(...customerCheck.warnings.map(w => `Destinatário: ${w}`));
    missingFields.push(...customerCheck.missingFields.map(f => `customer.${f}`));

    for (const item of opts.items) {
        const productCheck = checkProductFiscalReadiness(item);
        errors.push(...productCheck.errors.map(e => `Produto "${item.codigoProduto}": ${e}`));
        warnings.push(...productCheck.warnings.map(w => `Produto "${item.codigoProduto}": ${w}`));
        missingFields.push(...productCheck.missingFields.map(f => `product[${item.codigoProduto}].${f}`));
    }

    if (!present(opts.referencia)) {
        errors.push('Referência da transação (external_reference_id) ausente');
        missingFields.push('external_reference_id');
    }

    const ready = errors.length === 0;
    const summary = ready
        ? warnings.length > 0 ? `Pronto, com ${warnings.length} aviso(s)` : 'Pronto para emissão'
        : `Emissão bloqueada — ${errors.length} problema(s) encontrado(s)`;

    return { ready, errors, warnings, missingFields, summary };
}
