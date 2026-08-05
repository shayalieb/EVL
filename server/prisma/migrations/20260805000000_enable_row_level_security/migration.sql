-- Supabase auto-exposes every table in the `public` schema over its
-- PostgREST API (readable/writable with just the project's anon key)
-- unless Row Level Security is enabled on that table. This app's own
-- backend connects as the table-owning role (see SUPABASE_DATABASE_URL),
-- and Postgres lets table owners bypass RLS by default, so enabling RLS
-- here with zero policies fully blocks the public REST API surface
-- without changing any behavior for the app itself.
ALTER TABLE "Account" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AccountData" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BookingDocument" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Contract" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmailDomain" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmailMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmailThread" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EventDocument" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FloorPlan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FloorPlanPage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InquiryLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Invoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Membership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PasswordResetToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Reminder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StagePlot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StagePlotChannel" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StagePlotPage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SupportAttachment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SupportMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SupportNote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SupportThread" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
