CREATE SEQUENCE "DocumentDisplayNumberSeq" START WITH 100000 MINVALUE 100000 MAXVALUE 999999 NO CYCLE;

ALTER TABLE "Contract" ADD COLUMN "displayNumber" INTEGER, ADD COLUMN "rootDisplayNumber" INTEGER;
ALTER TABLE "ProposalResponse" ADD COLUMN "displayNumber" INTEGER;
ALTER TABLE "Invoice" ADD COLUMN "displayNumber" INTEGER;

-- One account-independent sequence keeps every client-facing reference unique
-- across contracts, addenda, proposals, and invoices. Existing signed contract
-- documentNumber values stay untouched because they are part of the signed
-- completion record's integrity hash.
CREATE TEMP TABLE "DocumentDisplayBackfill" AS
SELECT kind, id, (99999 + ROW_NUMBER() OVER (ORDER BY created_at, kind, id))::INTEGER AS number
FROM (
  SELECT 'contract' AS kind, "id" AS id, "createdAt" AS created_at FROM "Contract"
  UNION ALL
  SELECT 'proposal' AS kind, "id" AS id, "createdAt" AS created_at FROM "ProposalResponse"
  UNION ALL
  SELECT 'invoice' AS kind, "id" AS id, "createdAt" AS created_at FROM "Invoice"
) AS all_documents;

UPDATE "Contract" AS item SET "displayNumber" = assigned.number
FROM "DocumentDisplayBackfill" AS assigned
WHERE assigned.kind = 'contract' AND assigned.id = item."id";

UPDATE "ProposalResponse" AS item SET "displayNumber" = assigned.number
FROM "DocumentDisplayBackfill" AS assigned
WHERE assigned.kind = 'proposal' AND assigned.id = item."id";

UPDATE "Invoice" AS item SET "displayNumber" = assigned.number
FROM "DocumentDisplayBackfill" AS assigned
WHERE assigned.kind = 'invoice' AND assigned.id = item."id";

UPDATE "Contract" AS item
SET "rootDisplayNumber" = COALESCE(root."displayNumber", item."displayNumber")
FROM "Contract" AS root
WHERE root."id" = item."rootContractId";
UPDATE "Contract" SET "rootDisplayNumber" = "displayNumber" WHERE "rootDisplayNumber" IS NULL;

SELECT setval('"DocumentDisplayNumberSeq"',
  COALESCE((SELECT MAX(number) FROM "DocumentDisplayBackfill"), 100000),
  EXISTS(SELECT 1 FROM "DocumentDisplayBackfill"));

ALTER TABLE "Contract" ALTER COLUMN "displayNumber" SET NOT NULL, ALTER COLUMN "rootDisplayNumber" SET NOT NULL;
ALTER TABLE "ProposalResponse" ALTER COLUMN "displayNumber" SET NOT NULL;
ALTER TABLE "Invoice" ALTER COLUMN "displayNumber" SET NOT NULL;

ALTER TABLE "Contract" ALTER COLUMN "displayNumber" SET DEFAULT nextval('"DocumentDisplayNumberSeq"');
ALTER TABLE "ProposalResponse" ALTER COLUMN "displayNumber" SET DEFAULT nextval('"DocumentDisplayNumberSeq"');
ALTER TABLE "Invoice" ALTER COLUMN "displayNumber" SET DEFAULT nextval('"DocumentDisplayNumberSeq"');

ALTER TABLE "Contract" ADD CONSTRAINT "Contract_displayNumber_six_digits" CHECK ("displayNumber" BETWEEN 100000 AND 999999);
ALTER TABLE "ProposalResponse" ADD CONSTRAINT "ProposalResponse_displayNumber_six_digits" CHECK ("displayNumber" BETWEEN 100000 AND 999999);
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_displayNumber_six_digits" CHECK ("displayNumber" BETWEEN 100000 AND 999999);

CREATE UNIQUE INDEX "Contract_displayNumber_key" ON "Contract"("displayNumber");
CREATE UNIQUE INDEX "ProposalResponse_displayNumber_key" ON "ProposalResponse"("displayNumber");
CREATE UNIQUE INDEX "Invoice_displayNumber_key" ON "Invoice"("displayNumber");
