-- AlterTable
ALTER TABLE "Account" ADD COLUMN "stripeCustomerId" TEXT,
ADD COLUMN "stripeSubscriptionId" TEXT,
ADD COLUMN "subscriptionStatus" TEXT,
ADD COLUMN "planTier" TEXT,
ADD COLUMN "billingInterval" TEXT,
ADD COLUMN "seatLimit" INTEGER,
ADD COLUMN "trialEndsAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Account_stripeCustomerId_key" ON "Account"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_stripeSubscriptionId_key" ON "Account"("stripeSubscriptionId");
