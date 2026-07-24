-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "paymentMethod" TEXT,
ADD COLUMN     "paymentReference" TEXT,
ADD COLUMN     "paymentMemo" TEXT;
