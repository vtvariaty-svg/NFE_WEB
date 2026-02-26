import path from 'path';
import { prisma } from '../../index.js';

/**
 * TenantStorageService
 *
 * Guarantees storage isolation by tenant:
 * - All file paths are prefixed with  /storage/<tenantId>/
 * - Prevents path traversal with strict sanitization
 * - Used by certificate storage, XML archive, DANFE PDF generation, etc.
 */
export class TenantStorageService {

    private static readonly BASE_DIR = process.env.STORAGE_DIR || '/app/storage';

    /**
     * Returns the tenant-scoped directory path for a given category.
     * Creates the path string only — actual dir creation is done by the caller.
     */
    static tenantDir(tenantId: string, category: 'certs' | 'xmls' | 'pdfs' | 'logs' | 'tmp'): string {
        const safeTenantId = this.sanitize(tenantId);
        return path.posix.join(this.BASE_DIR, safeTenantId, category);
    }

    /**
     * Returns a fully qualified file path inside the tenant-scoped directory.
     * Validates that the resulting path stays within the tenant sandbox.
     */
    static filePath(tenantId: string, category: 'certs' | 'xmls' | 'pdfs' | 'logs' | 'tmp', filename: string): string {
        const safeTenantId = this.sanitize(tenantId);
        const safeFilename = path.basename(filename); // strips any path traversal
        const fullPath = path.posix.join(this.BASE_DIR, safeTenantId, category, safeFilename);

        // Guard: ensure the resolved path starts with tenant prefix
        const expected = path.posix.join(this.BASE_DIR, safeTenantId);
        if (!fullPath.startsWith(expected)) {
            throw new Error(`Path traversal detected for tenant ${tenantId}`);
        }

        return fullPath;
    }

    /** Sanitize tenantId to prevent directory traversal */
    private static sanitize(tenantId: string): string {
        // Only allow UUID-like safe strings
        if (!/^[a-zA-Z0-9_-]{6,}$/.test(tenantId.replace(/-/g, ''))) {
            throw new Error('Invalid tenantId for storage path.');
        }
        return tenantId;
    }
}

/**
 * TenantUsageControlService
 *
 * Reads daily usage counters and enforces per-plan limits.
 * Currently enforced at the API level in the tenant middleware.
 */
export class TenantUsageControlService {

    /** Default daily request limits per plan */
    private static readonly PLAN_LIMITS: Record<string, number> = {
        FREE: 500,
        BASIC: 5_000,
        PRO: 50_000,
        ENTERPRISE: Number.MAX_SAFE_INTEGER
    };

    /**
     * Returns today's usage for a tenant.
     */
    static async getTodayUsage(tenantId: string) {
        const today = new Date().toISOString().split('T')[0];
        const usage = await prisma.tenantApiUsage.findUnique({
            where: { tenantId_date: { tenantId, date: today } }
        });
        return { date: today, requests: usage?.requests ?? 0, lastEndpoint: usage?.lastEndpoint ?? null };
    }

    /**
     * Returns usage for the last 30 days.
     */
    static async getUsageHistory(tenantId: string, days = 30) {
        const since = new Date();
        since.setDate(since.getDate() - days);
        const sinceStr = since.toISOString().split('T')[0];

        const history = await prisma.tenantApiUsage.findMany({
            where: { tenantId, date: { gte: sinceStr } },
            orderBy: { date: 'desc' }
        });
        return history;
    }

    /**
     * Checks if the tenant has exceeded their daily plan limit.
     * Returns true if over limit (caller should block request with 429).
     */
    static async isOverLimit(tenantId: string, planName = 'FREE'): Promise<boolean> {
        const { requests } = await this.getTodayUsage(tenantId);
        const limit = this.PLAN_LIMITS[planName.toUpperCase()] ?? this.PLAN_LIMITS.FREE;
        return requests >= limit;
    }
}
