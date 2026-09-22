-- Directly imported or seeded contracts may have no root reference. The
-- client-facing number remains mandatory; rootDisplayNumber is optional.
ALTER TABLE "Contract" ALTER COLUMN "rootDisplayNumber" DROP NOT NULL;
