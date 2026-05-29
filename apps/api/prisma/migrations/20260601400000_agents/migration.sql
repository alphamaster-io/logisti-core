-- CreateEnum
CREATE TYPE "BoxNumberBatchStatus" AS ENUM ('ACTIVE', 'EXHAUSTED', 'VOIDED');

-- CreateTable
CREATE TABLE "agents" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "branchId" TEXT,
    "commissionPercent" DECIMAL(5,2),
    "commissionPerBoxMinor" BIGINT,
    "commissionCurrency" TEXT,
    "contactInfo" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "box_number_batches" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "startSeq" INTEGER NOT NULL,
    "endSeq" INTEGER NOT NULL,
    "nextSeq" INTEGER NOT NULL,
    "status" "BoxNumberBatchStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "issuedBy" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "box_number_batches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agents_tenantId_idx" ON "agents"("tenantId");

-- CreateIndex
CREATE INDEX "agents_tenantId_branchId_idx" ON "agents"("tenantId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "agents_tenantId_code_key" ON "agents"("tenantId", "code");

-- CreateIndex
CREATE INDEX "box_number_batches_tenantId_agentId_idx" ON "box_number_batches"("tenantId", "agentId");

-- CreateIndex
CREATE INDEX "box_number_batches_tenantId_status_idx" ON "box_number_batches"("tenantId", "status");

-- AddForeignKey
ALTER TABLE "agents" ADD CONSTRAINT "agents_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agents" ADD CONSTRAINT "agents_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "box_number_batches" ADD CONSTRAINT "box_number_batches_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "box_number_batches" ADD CONSTRAINT "box_number_batches_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

