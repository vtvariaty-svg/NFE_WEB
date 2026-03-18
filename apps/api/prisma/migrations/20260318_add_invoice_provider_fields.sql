-- Migration: 20260318_add_invoice_provider_fields
-- Adds external provider tracking columns to the Invoice table.
-- Replaces the xmlUnsigned JSON hack used during sandbox phase.
-- Safe to run multiple times (IF NOT EXISTS / column existence check via DO).

DO $$
BEGIN
    -- providerName: which fiscal provider handled this invoice
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'Invoice' AND column_name = 'providerName'
    ) THEN
        ALTER TABLE "Invoice" ADD COLUMN "providerName" TEXT;
    END IF;

    -- providerInvoiceId: UUID or external ID returned by the provider
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'Invoice' AND column_name = 'providerInvoiceId'
    ) THEN
        ALTER TABLE "Invoice" ADD COLUMN "providerInvoiceId" TEXT;
    END IF;

    -- providerStatus: raw status string from provider (e.g. 'em_processamento', 'autorizado')
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'Invoice' AND column_name = 'providerStatus'
    ) THEN
        ALTER TABLE "Invoice" ADD COLUMN "providerStatus" TEXT;
    END IF;

    -- providerReference: referencia string sent to the provider
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'Invoice' AND column_name = 'providerReference'
    ) THEN
        ALTER TABLE "Invoice" ADD COLUMN "providerReference" TEXT;
    END IF;
END $$;

-- Index for the sync worker: quickly find pending provider invoices
CREATE INDEX IF NOT EXISTS "Invoice_providerName_status_idx"
    ON "Invoice" ("providerName", "status")
    WHERE "providerName" IS NOT NULL;
