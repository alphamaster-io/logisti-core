-- CreateEnum
CREATE TYPE "ServiceOrderStatus" AS ENUM ('DRAFT', 'DEPOSIT_COLLECTED', 'STORED', 'PACKING_SCHEDULED', 'PACKED', 'AWAITING_FULL_PAYMENT', 'PAID_IN_FULL', 'OVERDUE', 'IN_WAREHOUSE', 'PALLETIZED', 'SHIPPED', 'DELIVERED', 'FAILED_DELIVERY', 'PENDING_ABANDONMENT', 'ABANDONED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ServiceOrderPaymentStatus" AS ENUM ('PENDING_DEPOSIT', 'DEPOSIT_COLLECTED', 'PARTIAL', 'PAID_IN_FULL', 'OVERDUE', 'WRITTEN_OFF');

-- CreateTable
CREATE TABLE "service_orders" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "mode" "ServiceMode" NOT NULL,
    "status" "ServiceOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "paymentStatus" "ServiceOrderPaymentStatus" NOT NULL DEFAULT 'PENDING_DEPOSIT',
    "branchId" TEXT NOT NULL,
    "customerSnapshot" JSONB NOT NULL,
    "consigneeSnapshot" JSONB NOT NULL,
    "pickupAddress" JSONB,
    "scheduledPickupAt" TIMESTAMP(3),
    "packedAt" TIMESTAMP(3),
    "storedAt" TIMESTAMP(3),
    "paidInFullAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "abandonmentDueAt" TIMESTAMP(3),
    "agentId" TEXT,
    "manifestId" TEXT,
    "declarationId" TEXT,
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "service_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_order_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "serviceOrderId" TEXT NOT NULL,
    "fromStatus" "ServiceOrderStatus",
    "toStatus" "ServiceOrderStatus" NOT NULL,
    "reason" TEXT,
    "recordedBy" TEXT NOT NULL,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_order_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "service_orders_number_key" ON "service_orders"("number");

-- CreateIndex
CREATE INDEX "service_orders_tenantId_status_idx" ON "service_orders"("tenantId", "status");

-- CreateIndex
CREATE INDEX "service_orders_tenantId_branchId_status_idx" ON "service_orders"("tenantId", "branchId", "status");

-- CreateIndex
CREATE INDEX "service_orders_tenantId_mode_idx" ON "service_orders"("tenantId", "mode");

-- CreateIndex
CREATE INDEX "service_orders_tenantId_createdAt_idx" ON "service_orders"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "service_orders_status_abandonmentDueAt_idx" ON "service_orders"("status", "abandonmentDueAt");

-- CreateIndex
CREATE INDEX "service_order_events_tenantId_serviceOrderId_createdAt_idx" ON "service_order_events"("tenantId", "serviceOrderId", "createdAt");

-- AddForeignKey
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_order_events" ADD CONSTRAINT "service_order_events_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES "service_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

