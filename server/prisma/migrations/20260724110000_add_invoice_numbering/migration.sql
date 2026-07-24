-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "nextInvoiceNumber" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "defaultInvoiceMemo" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "number" INTEGER;
