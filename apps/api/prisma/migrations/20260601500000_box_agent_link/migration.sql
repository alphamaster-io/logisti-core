-- AlterTable
ALTER TABLE "boxes" ADD COLUMN     "agentId" TEXT,
ADD COLUMN     "boxNumberBatchId" TEXT;

-- CreateIndex
CREATE INDEX "boxes_tenantId_agentId_idx" ON "boxes"("tenantId", "agentId");

-- CreateIndex
CREATE INDEX "boxes_boxNumberBatchId_idx" ON "boxes"("boxNumberBatchId");

-- AddForeignKey
ALTER TABLE "boxes" ADD CONSTRAINT "boxes_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boxes" ADD CONSTRAINT "boxes_boxNumberBatchId_fkey" FOREIGN KEY ("boxNumberBatchId") REFERENCES "box_number_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

