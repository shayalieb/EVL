-- Tables added after the original deny-by-default Supabase RLS migration
-- must receive the same protection before PostgREST can expose them.
ALTER TABLE "StagePlotBacklineItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StagePlotLibraryItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StagePlotLibraryPage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StagePlotLibraryChannel" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StagePlotLibraryBacklineItem" ENABLE ROW LEVEL SECURITY;

CREATE INDEX "StagePlotLibraryItem_accountId_updatedAt_id_idx"
ON "StagePlotLibraryItem"("accountId", "updatedAt", "id");
