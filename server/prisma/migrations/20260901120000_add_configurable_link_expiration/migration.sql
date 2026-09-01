ALTER TABLE "PasswordResetToken"
  ALTER COLUMN "expiresAt" DROP NOT NULL,
  ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'password_reset',
  ADD COLUMN "revokedAt" TIMESTAMP(3);

ALTER TABLE "Contract"
  ADD COLUMN "clientLinkExpiresAt" TIMESTAMP(3),
  ADD COLUMN "ownerLinkExpiresAt" TIMESTAMP(3);

ALTER TABLE "ProposalResponse"
  ADD COLUMN "expiresAt" TIMESTAMP(3);

CREATE INDEX "PasswordResetToken_userId_purpose_idx" ON "PasswordResetToken"("userId", "purpose");
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");
CREATE INDEX "Contract_clientLinkExpiresAt_idx" ON "Contract"("clientLinkExpiresAt");
CREATE INDEX "ProposalResponse_expiresAt_idx" ON "ProposalResponse"("expiresAt");
