CREATE TABLE "WebsiteReviewRequest" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "publicToken" TEXT NOT NULL,
    "recipientName" TEXT,
    "recipientEmail" TEXT NOT NULL,
    "requestedGroupName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewerName" TEXT,
    "groupName" TEXT,
    "groupType" TEXT,
    "rating" INTEGER,
    "quote" TEXT,
    "storyTitle" TEXT,
    "storySummary" TEXT,
    "storyBody" TEXT,
    "displayConsent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebsiteReviewRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WebsiteReviewRequest_tokenHash_key" ON "WebsiteReviewRequest"("tokenHash");
CREATE UNIQUE INDEX "WebsiteReviewRequest_publicToken_key" ON "WebsiteReviewRequest"("publicToken");
CREATE INDEX "WebsiteReviewRequest_status_createdAt_idx" ON "WebsiteReviewRequest"("status", "createdAt");
CREATE INDEX "WebsiteReviewRequest_recipientEmail_idx" ON "WebsiteReviewRequest"("recipientEmail");
