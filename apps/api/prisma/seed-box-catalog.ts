/* eslint-disable no-console */
// Box catalog seed. Data sourced directly from:
//   - HKG_PRICE_LIST_20012024.pdf (regular box prices, accessories, oversize, TV)
//   - Workflow diagram + T&Cs (liability caps, loyalty points already in BoxTypeCode)
//
// Idempotent — upsert on natural keys. Run once via `prisma db seed` or
// invoked from seed.ts.

import { PrismaClient, type BoxTypeCode, type RegionZone, type ServiceMode } from '@prisma/client';

// Prisma 5 can't include `null` in a composite-unique `where` clause, so
// we find-then-write for nullable serviceMode rows. Also for tvPrice etc.
async function upsertBoxPrice(
  prisma: PrismaClient,
  args: {
    boxTypeId: string;
    regionZone: RegionZone;
    currencyCode: string;
    serviceMode: ServiceMode | null;
    isDiscount: boolean;
    amountMinor: bigint;
    effectiveFrom: Date;
  },
) {
  const existing = await prisma.boxPrice.findFirst({
    where: {
      boxTypeId: args.boxTypeId,
      regionZone: args.regionZone,
      currencyCode: args.currencyCode,
      serviceMode: args.serviceMode,
      effectiveFrom: args.effectiveFrom,
    },
  });
  if (existing) {
    if (existing.amountMinor !== args.amountMinor) {
      await prisma.boxPrice.update({
        where: { id: existing.id },
        data: { amountMinor: args.amountMinor },
      });
    }
  } else {
    await prisma.boxPrice.create({ data: args });
  }
}

type BoxRow = {
  code: BoxTypeCode;
  displayName: string;
  lengthIn: number | null;
  widthIn: number | null;
  heightIn: number | null;
  loyaltyPointsPerBox: number;
  liabilityCapMinor: bigint | null;
  liabilityCapCurrency: string | null;
};

const BOX_TYPES: BoxRow[] = [
  // displayName, dimensions, stamps, liability cap (HKD minor units = cents)
  {
    code: 'KING',
    displayName: 'King (24x24x41)',
    lengthIn: 24,
    widthIn: 24,
    heightIn: 41,
    loyaltyPointsPerBox: 6,
    liabilityCapMinor: 25000n,
    liabilityCapCurrency: 'HKD',
  },
  {
    code: 'SUPER',
    displayName: 'Super (24x24x36)',
    lengthIn: 24,
    widthIn: 24,
    heightIn: 36,
    loyaltyPointsPerBox: 5,
    liabilityCapMinor: 22500n,
    liabilityCapCurrency: 'HKD',
  },
  {
    code: 'JUMBO',
    displayName: 'Jumbo (24x24x26)',
    lengthIn: 24,
    widthIn: 24,
    heightIn: 26,
    loyaltyPointsPerBox: 4,
    liabilityCapMinor: 20000n,
    liabilityCapCurrency: 'HKD',
  },
  {
    code: 'REGULAR',
    displayName: 'Regular (24x24x22)',
    lengthIn: 24,
    widthIn: 24,
    heightIn: 22,
    loyaltyPointsPerBox: 3,
    liabilityCapMinor: 17500n,
    liabilityCapCurrency: 'HKD',
  },
  {
    code: 'MEDIUM',
    displayName: 'Medium (24x16x20)',
    lengthIn: 24,
    widthIn: 16,
    heightIn: 20,
    loyaltyPointsPerBox: 2,
    liabilityCapMinor: 15000n,
    liabilityCapCurrency: 'HKD',
  },
  {
    code: 'SMALL',
    displayName: 'Small (24x14x15)',
    lengthIn: 24,
    widthIn: 14,
    heightIn: 15,
    loyaltyPointsPerBox: 1,
    liabilityCapMinor: 12500n,
    liabilityCapCurrency: 'HKD',
  },
  {
    code: 'EX_BUDGET',
    displayName: 'Ex-Budget (12x12x14)',
    lengthIn: 12,
    widthIn: 12,
    heightIn: 14,
    loyaltyPointsPerBox: 0,
    liabilityCapMinor: 10000n,
    liabilityCapCurrency: 'HKD',
  },
  {
    code: 'OVERSIZE',
    displayName: 'Oversize (by quotation)',
    lengthIn: null,
    widthIn: null,
    heightIn: null,
    loyaltyPointsPerBox: 0,
    liabilityCapMinor: null,
    liabilityCapCurrency: null,
  },
  {
    code: 'ODD_SIZE',
    displayName: 'Odd-size (by quotation)',
    lengthIn: null,
    widthIn: null,
    heightIn: null,
    loyaltyPointsPerBox: 0,
    liabilityCapMinor: null,
    liabilityCapCurrency: null,
  },
];

// HKG_PRICE_LIST_20012024.pdf, regular price matrix (₱).
// Columns:                          MNL_RIZAL  LUZON_A  LUZON_B  BICOL_VISAYAS  MINDANAO_ISLANDS
const REGULAR_PRICES_PHP: Partial<Record<BoxTypeCode, [number, number, number, number, number]>> = {
  KING: [1035, 1075, 1115, 1135, 1155],
  SUPER: [935, 975, 1015, 1055, 1075],
  JUMBO: [790, 825, 885, 935, 955],
  REGULAR: [735, 765, 775, 825, 845],
  MEDIUM: [565, 585, 625, 655, 675],
  SMALL: [435, 455, 465, 505, 535],
  // EX_BUDGET only has MNL_RIZAL + LUZON_A on the price list; others are blanks (--).
  EX_BUDGET: [265, 275, 285, 0, 0],
};

const ZONES: RegionZone[] = [
  'MNL_RIZAL',
  'LUZON_A',
  'LUZON_B',
  'BICOL_VISAYAS',
  'MINDANAO_ISLANDS',
];

// Instant Packing and Take-Out Box discounts are per box (₱ off, applied as a separate
// negative PaymentLine; here they're stored as discount BoxPrice rows with
// `isDiscount: true` so the pricing engine can pick them up.
const INSTANT_PACK_DISCOUNT: Partial<Record<BoxTypeCode, number>> = {
  KING: 120,
  SUPER: 100,
  JUMBO: 80,
  REGULAR: 50,
  MEDIUM: 40,
  SMALL: 30,
};
const TAKE_OUT_DISCOUNT: Partial<Record<BoxTypeCode, number>> = {
  KING: 60,
  SUPER: 50,
  JUMBO: 50,
  REGULAR: 50,
  MEDIUM: 40,
  SMALL: 30,
};

// Accessory + storage bag pricelist (HKD minor units = cents).
type AccessoryRow = {
  code:
    | 'PADLOCK'
    | 'TAPE_CLEAR'
    | 'STORAGE_BAG_S'
    | 'STORAGE_BAG_M'
    | 'STORAGE_BAG_L'
    | 'STORAGE_BAG_LOGO';
  displayName: string;
  amountMinor: bigint;
};
const ACCESSORIES: AccessoryRow[] = [
  { code: 'PADLOCK', displayName: 'Padlock', amountMinor: 1200n },
  { code: 'TAPE_CLEAR', displayName: 'Clear tape', amountMinor: 700n },
  { code: 'STORAGE_BAG_S', displayName: 'Storage bag — small', amountMinor: 1400n },
  { code: 'STORAGE_BAG_M', displayName: 'Storage bag — medium', amountMinor: 1600n },
  { code: 'STORAGE_BAG_L', displayName: 'Storage bag — large', amountMinor: 2200n },
  { code: 'STORAGE_BAG_LOGO', displayName: 'Storage bag — logo', amountMinor: 2200n },
];

// TV pricelist (₱). Columns:           MNL/Rizal  Luzon   Visayas  Islands
// NB the TV matrix has 4 columns (not 5); we map Luzon → LUZON_A and Luzon_B,
// and Visayas/Mindanao split into the 5-zone scheme.
const TV_PRICES_PHP: Record<
  'IN_25_29' | 'IN_30_34' | 'IN_35_42' | 'IN_43_50' | 'IN_51_64',
  { mnl: number; luzon: number; visMin: number; islands: number }
> = {
  IN_25_29: { mnl: 750, luzon: 850, visMin: 1000, islands: 1050 },
  IN_30_34: { mnl: 1000, luzon: 1100, visMin: 1300, islands: 1350 },
  IN_35_42: { mnl: 1300, luzon: 1500, visMin: 1750, islands: 1800 },
  IN_43_50: { mnl: 1500, luzon: 1700, visMin: 1950, islands: 2000 },
  IN_51_64: { mnl: 1800, luzon: 2300, visMin: 2550, islands: 2700 },
};

// Province → RegionZone, from the HKG_PRICE_LIST_20012024 footnotes.
const REGION_ZONE_MAP: Array<[string, RegionZone]> = [
  ['Metro Manila', 'MNL_RIZAL'],
  ['Rizal', 'MNL_RIZAL'],
  // LUZON_A
  ['Batangas', 'LUZON_A'],
  ['Bulacan', 'LUZON_A'],
  ['Cavite', 'LUZON_A'],
  ['Laguna', 'LUZON_A'],
  ['Pampanga', 'LUZON_A'],
  // LUZON_B
  ['Abra', 'LUZON_B'],
  ['Aurora', 'LUZON_B'],
  ['Apayao', 'LUZON_B'],
  ['Baguio', 'LUZON_B'],
  ['Benguet', 'LUZON_B'],
  ['Bataan', 'LUZON_B'],
  ['Cagayan', 'LUZON_B'],
  ['Ifugao', 'LUZON_B'],
  ['Ilocos Norte', 'LUZON_B'],
  ['Ilocos Sur', 'LUZON_B'],
  ['Isabela', 'LUZON_B'],
  ['Kalinga', 'LUZON_B'],
  ['La Union', 'LUZON_B'],
  ['Mountain Province', 'LUZON_B'],
  ['Nueva Ecija', 'LUZON_B'],
  ['Nueva Vizcaya', 'LUZON_B'],
  ['Pangasinan', 'LUZON_B'],
  ['Quezon', 'LUZON_B'],
  ['Quirino', 'LUZON_B'],
  ['Tarlac', 'LUZON_B'],
  ['Zambales', 'LUZON_B'],
  // BICOL_VISAYAS
  ['Albay', 'BICOL_VISAYAS'],
  ['Camarines Norte', 'BICOL_VISAYAS'],
  ['Camarines Sur', 'BICOL_VISAYAS'],
  ['Sorsogon', 'BICOL_VISAYAS'],
  ['Leyte', 'BICOL_VISAYAS'],
  ['Samar', 'BICOL_VISAYAS'],
  // MINDANAO_ISLANDS — outlying islands per the footnote
  ['Marinduque', 'MINDANAO_ISLANDS'],
  ['Masbate', 'MINDANAO_ISLANDS'],
  ['Mindoro', 'MINDANAO_ISLANDS'],
  ['Palawan', 'MINDANAO_ISLANDS'],
  ['Romblon', 'MINDANAO_ISLANDS'],
  ['Guimaras', 'MINDANAO_ISLANDS'],
  ['Siquijor', 'MINDANAO_ISLANDS'],
  // Mindanao proper (price list footnote 4 says "Islands"; in practice these are MNL pricing zone 4)
  ['Davao', 'MINDANAO_ISLANDS'],
  ['Cagayan de Oro', 'MINDANAO_ISLANDS'],
  ['Zamboanga', 'MINDANAO_ISLANDS'],
  ['General Santos', 'MINDANAO_ISLANDS'],
];

export async function seedBoxCatalog(prisma: PrismaClient) {
  // BoxType upserts
  for (const row of BOX_TYPES) {
    await prisma.boxType.upsert({
      where: { code: row.code },
      update: {
        displayName: row.displayName,
        lengthIn: row.lengthIn,
        widthIn: row.widthIn,
        heightIn: row.heightIn,
        loyaltyPointsPerBox: row.loyaltyPointsPerBox,
        liabilityCapAmount: row.liabilityCapMinor,
        liabilityCapCurrency: row.liabilityCapCurrency,
      },
      create: {
        code: row.code,
        displayName: row.displayName,
        lengthIn: row.lengthIn,
        widthIn: row.widthIn,
        heightIn: row.heightIn,
        loyaltyPointsPerBox: row.loyaltyPointsPerBox,
        liabilityCapAmount: row.liabilityCapMinor,
        liabilityCapCurrency: row.liabilityCapCurrency,
      },
    });
  }
  console.log(`  ✓ ${BOX_TYPES.length} box types`);

  // Regular prices per zone, per type, in PHP minor units.
  let priceCount = 0;
  const epoch = new Date('2024-01-20T00:00:00.000Z'); // matches price list date
  for (const [codeStr, prices] of Object.entries(REGULAR_PRICES_PHP)) {
    const code = codeStr as BoxTypeCode;
    const type = await prisma.boxType.findUniqueOrThrow({ where: { code } });
    for (let i = 0; i < ZONES.length; i++) {
      const phpAmount = prices[i] ?? 0;
      if (phpAmount === 0) continue; // EX_BUDGET unavailable to some zones
      await upsertBoxPrice(prisma, {
        boxTypeId: type.id,
        regionZone: ZONES[i]!,
        currencyCode: 'PHP',
        serviceMode: null,
        isDiscount: false,
        amountMinor: BigInt(phpAmount * 100),
        effectiveFrom: epoch,
      });
      priceCount++;
    }
  }

  // Instant-pack discount lines (HK-side flat off, currency HKD).
  for (const [codeStr, amount] of Object.entries(INSTANT_PACK_DISCOUNT)) {
    const code = codeStr as BoxTypeCode;
    const type = await prisma.boxType.findUniqueOrThrow({ where: { code } });
    for (const zone of ZONES) {
      await upsertBoxPrice(prisma, {
        boxTypeId: type.id,
        regionZone: zone,
        currencyCode: 'HKD',
        serviceMode: 'INSTANT_PACK',
        isDiscount: true,
        amountMinor: BigInt(amount * 100),
        effectiveFrom: epoch,
      });
      priceCount++;
    }
  }
  // Take-out (PICK_UP_BOX) discount lines.
  for (const [codeStr, amount] of Object.entries(TAKE_OUT_DISCOUNT)) {
    const code = codeStr as BoxTypeCode;
    const type = await prisma.boxType.findUniqueOrThrow({ where: { code } });
    for (const zone of ZONES) {
      await upsertBoxPrice(prisma, {
        boxTypeId: type.id,
        regionZone: zone,
        currencyCode: 'HKD',
        serviceMode: 'PICK_UP_BOX',
        isDiscount: true,
        amountMinor: BigInt(amount * 100),
        effectiveFrom: epoch,
      });
      priceCount++;
    }
  }
  console.log(`  ✓ ${priceCount} box prices (regular + discounts)`);

  // Accessories
  for (const a of ACCESSORIES) {
    await prisma.accessory.upsert({
      where: { code: a.code },
      update: { displayName: a.displayName, amountMinor: a.amountMinor },
      create: {
        code: a.code,
        displayName: a.displayName,
        amountMinor: a.amountMinor,
        currencyCode: 'HKD',
      },
    });
  }
  console.log(`  ✓ ${ACCESSORIES.length} accessories`);

  // TV prices — map the 4-column matrix to the 5-zone scheme.
  let tvCount = 0;
  for (const [bracketStr, prices] of Object.entries(TV_PRICES_PHP)) {
    const bracket = bracketStr as keyof typeof TV_PRICES_PHP;
    const perZone: Record<RegionZone, number> = {
      MNL_RIZAL: prices.mnl,
      LUZON_A: prices.luzon,
      LUZON_B: prices.luzon,
      BICOL_VISAYAS: prices.visMin,
      MINDANAO_ISLANDS: prices.islands,
    };
    for (const zone of ZONES) {
      await prisma.tvPrice.upsert({
        where: {
          sizeBracket_regionZone_currencyCode_effectiveFrom: {
            sizeBracket: bracket,
            regionZone: zone,
            currencyCode: 'PHP',
            effectiveFrom: epoch,
          },
        },
        update: { amountMinor: BigInt(perZone[zone] * 100) },
        create: {
          sizeBracket: bracket,
          regionZone: zone,
          currencyCode: 'PHP',
          amountMinor: BigInt(perZone[zone] * 100),
          effectiveFrom: epoch,
        },
      });
      tvCount++;
    }
  }
  console.log(`  ✓ ${tvCount} TV prices`);

  // Region zone map
  for (const [province, zone] of REGION_ZONE_MAP) {
    await prisma.regionZoneMap.upsert({
      where: { province },
      update: { zone },
      create: { province, zone },
    });
  }
  console.log(`  ✓ ${REGION_ZONE_MAP.length} region zone mappings`);
}
