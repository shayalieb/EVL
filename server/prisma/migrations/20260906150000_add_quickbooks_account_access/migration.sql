ALTER TABLE "Account"
  ADD COLUMN "quickBooksAccessEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "quickBooksAccessEnabledAt" TIMESTAMP(3);

UPDATE "Account"
SET "quickBooksAccessEnabled" = true,
    "quickBooksAccessEnabledAt" = NOW()
WHERE "id" IN (SELECT "accountId" FROM "QuickBooksConnection");
