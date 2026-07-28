-- AlterTable
ALTER TABLE "User" ADD COLUMN     "adminPermissions" JSONB NOT NULL DEFAULT '{}';

-- Backfill: existing platform admins keep full access under the new
-- scoped-permission system instead of being silently locked out.
UPDATE "User"
SET "adminPermissions" = '{"manageAccounts":true,"manageAccountStatus":true,"manageSupport":true,"manageAdmins":true}'
WHERE "isPlatformAdmin" = true;
