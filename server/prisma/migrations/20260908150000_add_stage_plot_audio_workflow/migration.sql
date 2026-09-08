ALTER TABLE "StagePlotChannel"
  ADD COLUMN "inputType" TEXT,
  ADD COLUMN "preferredDevice" TEXT,
  ADD COLUMN "substituteDevice" TEXT,
  ADD COLUMN "standType" TEXT,
  ADD COLUMN "connectionType" TEXT,
  ADD COLUMN "channelFormat" TEXT NOT NULL DEFAULT 'mono',
  ADD COLUMN "stageboxName" TEXT,
  ADD COLUMN "stageboxInput" TEXT,
  ADD COLUMN "providedBy" TEXT,
  ADD COLUMN "monitorMix" TEXT,
  ADD COLUMN "powerDetails" TEXT,
  ADD COLUMN "cableDetails" TEXT;

ALTER TABLE "StagePlotLibraryChannel"
  ADD COLUMN "inputType" TEXT,
  ADD COLUMN "preferredDevice" TEXT,
  ADD COLUMN "substituteDevice" TEXT,
  ADD COLUMN "standType" TEXT,
  ADD COLUMN "connectionType" TEXT,
  ADD COLUMN "channelFormat" TEXT NOT NULL DEFAULT 'mono',
  ADD COLUMN "stageboxName" TEXT,
  ADD COLUMN "stageboxInput" TEXT,
  ADD COLUMN "providedBy" TEXT,
  ADD COLUMN "monitorMix" TEXT,
  ADD COLUMN "powerDetails" TEXT,
  ADD COLUMN "cableDetails" TEXT;
