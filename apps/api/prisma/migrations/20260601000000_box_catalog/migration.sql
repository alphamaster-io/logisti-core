-- CreateEnum
CREATE TYPE "BoxTypeCode" AS ENUM ('KING', 'SUPER', 'JUMBO', 'REGULAR', 'MEDIUM', 'SMALL', 'EX_BUDGET', 'OVERSIZE', 'ODD_SIZE');

-- CreateEnum
CREATE TYPE "RegionZone" AS ENUM ('MNL_RIZAL', 'LUZON_A', 'LUZON_B', 'BICOL_VISAYAS', 'MINDANAO_ISLANDS');

-- CreateEnum
CREATE TYPE "ServiceMode" AS ENUM ('DELIVER_BOX', 'PICK_UP_BOX', 'INSTANT_PACK', 'STORAGE', 'AGENT_INTAKE', 'MACAU_INTAKE');

-- CreateEnum
CREATE TYPE "AccessoryCode" AS ENUM ('PADLOCK', 'TAPE_CLEAR', 'STORAGE_BAG_S', 'STORAGE_BAG_M', 'STORAGE_BAG_L', 'STORAGE_BAG_LOGO');

-- CreateEnum
CREATE TYPE "TvSizeBracket" AS ENUM ('IN_25_29', 'IN_30_34', 'IN_35_42', 'IN_43_50', 'IN_51_64');

-- CreateTable
CREATE TABLE "box_types" (
    "id" TEXT NOT NULL,
    "code" "BoxTypeCode" NOT NULL,
    "displayName" TEXT NOT NULL,
    "lengthIn" INTEGER,
    "widthIn" INTEGER,
    "heightIn" INTEGER,
    "loyaltyPointsPerBox" INTEGER NOT NULL DEFAULT 0,
    "liabilityCapAmount" BIGINT,
    "liabilityCapCurrency" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "box_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "box_prices" (
    "id" TEXT NOT NULL,
    "boxTypeId" TEXT NOT NULL,
    "regionZone" "RegionZone" NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "serviceMode" "ServiceMode",
    "isDiscount" BOOLEAN NOT NULL DEFAULT false,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "box_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accessories" (
    "id" TEXT NOT NULL,
    "code" "AccessoryCode" NOT NULL,
    "displayName" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "accessories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tv_prices" (
    "id" TEXT NOT NULL,
    "sizeBracket" "TvSizeBracket" NOT NULL,
    "regionZone" "RegionZone" NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tv_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "region_zone_map" (
    "id" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "zone" "RegionZone" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "region_zone_map_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "box_types_code_key" ON "box_types"("code");

-- CreateIndex
CREATE INDEX "box_prices_boxTypeId_regionZone_idx" ON "box_prices"("boxTypeId", "regionZone");

-- CreateIndex
CREATE UNIQUE INDEX "box_prices_boxTypeId_regionZone_currencyCode_serviceMode_ef_key" ON "box_prices"("boxTypeId", "regionZone", "currencyCode", "serviceMode", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "accessories_code_key" ON "accessories"("code");

-- CreateIndex
CREATE INDEX "tv_prices_sizeBracket_regionZone_idx" ON "tv_prices"("sizeBracket", "regionZone");

-- CreateIndex
CREATE UNIQUE INDEX "tv_prices_sizeBracket_regionZone_currencyCode_effectiveFrom_key" ON "tv_prices"("sizeBracket", "regionZone", "currencyCode", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "region_zone_map_province_key" ON "region_zone_map"("province");

-- CreateIndex
CREATE INDEX "region_zone_map_zone_idx" ON "region_zone_map"("zone");

-- AddForeignKey
ALTER TABLE "box_prices" ADD CONSTRAINT "box_prices_boxTypeId_fkey" FOREIGN KEY ("boxTypeId") REFERENCES "box_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

