-- CreateEnum
CREATE TYPE "PaymentLineKind" AS ENUM ('BOX_DEPOSIT', 'BOX_BALANCE', 'INSTANT_PACK_DISCOUNT', 'TAKE_OUT_BOX_DISCOUNT', 'LOYALTY_REDEMPTION', 'OVERSIZE_SURCHARGE', 'STORAGE_DEPOSIT', 'PAID_STORAGE_CHARGE', 'STORAGE_PICKUP_FEE', 'AGENT_COMMISSION', 'RECEIVED', 'BOUNCED', 'CORRECTION');

-- CreateTable
CREATE TABLE "payment_lines" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "serviceOrderId" TEXT NOT NULL,
    "boxId" TEXT,
    "kind" "PaymentLineKind" NOT NULL,
    "amount" BIGINT NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "relatedLineId" TEXT,
    "accruedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedBy" TEXT NOT NULL,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_lines_tenantId_serviceOrderId_idx" ON "payment_lines"("tenantId", "serviceOrderId");

-- CreateIndex
CREATE INDEX "payment_lines_tenantId_kind_idx" ON "payment_lines"("tenantId", "kind");

-- CreateIndex
CREATE INDEX "payment_lines_tenantId_createdAt_idx" ON "payment_lines"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "payment_lines" ADD CONSTRAINT "payment_lines_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_lines" ADD CONSTRAINT "payment_lines_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES "service_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_lines" ADD CONSTRAINT "payment_lines_boxId_fkey" FOREIGN KEY ("boxId") REFERENCES "boxes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_lines" ADD CONSTRAINT "payment_lines_relatedLineId_fkey" FOREIGN KEY ("relatedLineId") REFERENCES "payment_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

