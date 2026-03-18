/**
 * Fiscal Readiness Validation
 *
 * Central helper that validates whether Company, Customer and Product records
 * have the minimum data required for NF-e emission.
 *
 * Used by:
 *   - Internal GET /:id/fiscal-readiness endpoints (per-entity status)
 *   - Pre-flight check in the external NF-e emission route
 */

export interface FiscalReadinessResult {
    ready: boolean;
    missing: string[];
}

// ── Per-entity readiness checks ───────────────────────────────────────────────

export interface CompanyFiscalData {
    ibgeCode?: string | null;
    crt?: string | null;
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

function present(v: string | null | undefined): boolean {
    return typeof v === 'string' && v.trim().length > 0;
}

export function checkCompanyFiscalReadiness(company: CompanyFiscalData): FiscalReadinessResult {
    const missing: string[] = [];
    if (!present(company.ibgeCode)) missing.push('Código IBGE do município (ibgeCode)');
    if (!present(company.crt))      missing.push('Regime tributário (CRT)');
    return { ready: missing.length === 0, missing };
}

export function checkCustomerFiscalReadiness(customer: CustomerFiscalData): FiscalReadinessResult {
    const missing: string[] = [];
    if (!present(customer.ibgeCode)) missing.push('Código IBGE do município (ibgeCode)');
    return { ready: missing.length === 0, missing };
}

export function checkProductFiscalReadiness(product: ProductFiscalData): FiscalReadinessResult {
    const missing: string[] = [];
    if (!present(product.ncm))       missing.push('NCM');
    if (!present(product.icmsCst))   missing.push('ICMS CST/CSOSN');
    if (!present(product.pisCst))    missing.push('PIS CST');
    if (!present(product.cofinsCst)) missing.push('COFINS CST');
    return { ready: missing.length === 0, missing };
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
}

/**
 * Validates all fiscal preconditions before NF-e emission.
 * Returns { ready: false, errors: [...] } instead of throwing,
 * so callers can return a structured 422 with all missing fields at once.
 */
export function validateFiscalReadiness(opts: ValidateFiscalReadinessOpts): EmissionReadinessResult {
    const errors: string[] = [];

    const companyCheck = checkCompanyFiscalReadiness(opts.company);
    if (!companyCheck.ready) {
        errors.push(...companyCheck.missing.map(f => `Empresa: ${f}`));
    }

    const customerCheck = checkCustomerFiscalReadiness(opts.customer);
    if (!customerCheck.ready) {
        errors.push(...customerCheck.missing.map(f => `Destinatário: ${f}`));
    }

    for (const item of opts.items) {
        const productCheck = checkProductFiscalReadiness(item);
        if (!productCheck.ready) {
            errors.push(...productCheck.missing.map(f => `Produto "${item.codigoProduto}": ${f}`));
        }
    }

    if (!present(opts.referencia)) {
        errors.push('Referência da transação (external_reference_id) ausente.');
    }

    return { ready: errors.length === 0, errors };
}
