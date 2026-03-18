-- Migration: add soft-delete fields to Company, Customer, Product
-- Safe: all columns are nullable or have defaults — no data loss

ALTER TABLE "Company"  ADD COLUMN IF NOT EXISTS "isActive"   BOOLEAN   NOT NULL DEFAULT true;
ALTER TABLE "Company"  ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);

ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "isActive"   BOOLEAN   NOT NULL DEFAULT true;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);

ALTER TABLE "Product"  ADD COLUMN IF NOT EXISTS "isActive"   BOOLEAN   NOT NULL DEFAULT true;
ALTER TABLE "Product"  ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);

-- Indexes for efficient active-record queries
CREATE INDEX IF NOT EXISTS "Company_tenantId_isActive_idx"  ON "Company"  ("tenantId", "isActive");
CREATE INDEX IF NOT EXISTS "Customer_tenantId_isActive_idx" ON "Customer" ("tenantId", "isActive");
CREATE INDEX IF NOT EXISTS "Product_tenantId_isActive_idx"  ON "Product"  ("tenantId", "isActive");
