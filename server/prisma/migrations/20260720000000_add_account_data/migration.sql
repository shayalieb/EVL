-- CreateTable
CREATE TABLE "AccountData" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountData_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountData_accountId_key" ON "AccountData"("accountId");

-- AddForeignKey
ALTER TABLE "AccountData" ADD CONSTRAINT "AccountData_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
