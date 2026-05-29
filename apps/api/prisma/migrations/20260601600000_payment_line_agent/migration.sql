-- AlterTable
ALTER TABLE "payment_lines" ADD COLUMN "agentId" TEXT;

-- CreateIndex
CREATE INDEX "payment_lines_tenantId_agentId_idx" ON "payment_lines"("tenantId", "agentId");

-- AddForeignKey
ALTER TABLE "payment_lines" ADD CONSTRAINT "payment_lines_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
