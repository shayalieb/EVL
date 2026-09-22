ALTER TABLE "Contract" ADD COLUMN "documentNumber" TEXT, ADD COLUMN "rootContractId" TEXT;
ALTER TABLE "ProposalResponse" ADD COLUMN "documentNumber" TEXT;

WITH RECURSIVE contract_chain AS (
  SELECT "id", "id" AS root_id FROM "Contract" WHERE "previousContractId" IS NULL
  UNION ALL
  SELECT child."id", parent.root_id
  FROM "Contract" child
  JOIN contract_chain parent ON child."previousContractId" = parent."id"
)
UPDATE "Contract" AS contract
SET "rootContractId" = chain.root_id,
    "documentNumber" = 'GW-C-' || chain.root_id || '-' || CASE WHEN contract."documentType" = 'addendum' THEN 'A' ELSE 'V' END || contract."revisionNumber"
FROM contract_chain AS chain
WHERE contract."id" = chain."id";

UPDATE "ProposalResponse" SET "documentNumber" = 'GW-P-' || "id" WHERE "documentNumber" IS NULL;

CREATE UNIQUE INDEX "Contract_documentNumber_key" ON "Contract"("documentNumber");
CREATE UNIQUE INDEX "ProposalResponse_documentNumber_key" ON "ProposalResponse"("documentNumber");
