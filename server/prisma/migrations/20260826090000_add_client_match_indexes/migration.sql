CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE "Client"
ADD COLUMN "emailNormalized" TEXT,
ADD COLUMN "phoneNormalized" TEXT,
ADD COLUMN "nameNormalized" TEXT;

UPDATE "Client"
SET
  "emailNormalized" = NULLIF(LOWER(BTRIM(COALESCE("email", ''))), ''),
  "phoneNormalized" = NULLIF(REGEXP_REPLACE(COALESCE("phone", ''), '[^0-9]', '', 'g'), ''),
  "nameNormalized" = NULLIF(LOWER(BTRIM(CONCAT_WS(' ', "firstName", "lastName"))), '');

CREATE INDEX "Client_accountId_emailNormalized_idx" ON "Client"("accountId", "emailNormalized");
CREATE INDEX "Client_accountId_phoneNormalized_idx" ON "Client"("accountId", "phoneNormalized");
CREATE INDEX "Client_nameNormalized_trgm_idx" ON "Client" USING GIN ("nameNormalized" gin_trgm_ops);
