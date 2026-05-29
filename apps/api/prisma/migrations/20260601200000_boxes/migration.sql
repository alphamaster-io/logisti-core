-- CreateEnum
CREATE TYPE "BoxStatus" AS ENUM ('CREATED', 'RECEIVED', 'PACKED', 'PALLETIZED', 'CONTAINERIZED', 'IN_TRANSIT', 'DELIVERED', 'FAILED_DELIVERY', 'RETURNED');

-- CreateTable
CREATE TABLE "boxes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "serviceOrderId" TEXT NOT NULL,
    "boxTypeCode" "BoxTypeCode" NOT NULL,
    "status" "BoxStatus" NOT NULL DEFAULT 'CREATED',
    "oversizeInches" INTEGER,
    "weightKg" DECIMAL(7,2),
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "boxes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "boxes_number_key" ON "boxes"("number");

-- CreateIndex
CREATE INDEX "boxes_tenantId_serviceOrderId_idx" ON "boxes"("tenantId", "serviceOrderId");

-- CreateIndex
CREATE INDEX "boxes_tenantId_status_idx" ON "boxes"("tenantId", "status");

-- CreateIndex
CREATE INDEX "boxes_tenantId_createdAt_idx" ON "boxes"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "boxes" ADD CONSTRAINT "boxes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boxes" ADD CONSTRAINT "boxes_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES "service_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

