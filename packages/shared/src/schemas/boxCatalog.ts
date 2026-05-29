import { z } from 'zod';

// Box catalog Zod schemas. The Prisma model is in apps/api/prisma/schema.prisma;
// the parity check in apps/api/src/box-catalog/parity-check.ts asserts these
// shapes are assignable from the Prisma payload types.

export const boxTypeCodeSchema = z.enum([
  'KING',
  'SUPER',
  'JUMBO',
  'REGULAR',
  'MEDIUM',
  'SMALL',
  'EX_BUDGET',
  'OVERSIZE',
  'ODD_SIZE',
]);
export type BoxTypeCode = z.infer<typeof boxTypeCodeSchema>;

export const regionZoneSchema = z.enum([
  'MNL_RIZAL',
  'LUZON_A',
  'LUZON_B',
  'BICOL_VISAYAS',
  'MINDANAO_ISLANDS',
]);
export type RegionZone = z.infer<typeof regionZoneSchema>;

export const serviceModeSchema = z.enum([
  'DELIVER_BOX',
  'PICK_UP_BOX',
  'INSTANT_PACK',
  'STORAGE',
  'AGENT_INTAKE',
  'MACAU_INTAKE',
]);
export type ServiceMode = z.infer<typeof serviceModeSchema>;

export const accessoryCodeSchema = z.enum([
  'PADLOCK',
  'TAPE_CLEAR',
  'STORAGE_BAG_S',
  'STORAGE_BAG_M',
  'STORAGE_BAG_L',
  'STORAGE_BAG_LOGO',
]);
export type AccessoryCode = z.infer<typeof accessoryCodeSchema>;

export const tvSizeBracketSchema = z.enum([
  'IN_25_29',
  'IN_30_34',
  'IN_35_42',
  'IN_43_50',
  'IN_51_64',
]);
export type TvSizeBracket = z.infer<typeof tvSizeBracketSchema>;

// Money is bigint minor units per the project non-negotiables. The wire
// format is a stringified bigint so JSON round-trips don't lose precision.
export const minorAmountSchema = z
  .union([z.bigint(), z.string().regex(/^-?\d+$/), z.number().int()])
  .transform((v) => (typeof v === 'bigint' ? v : BigInt(v)));

export const boxTypeSchema = z.object({
  id: z.string(),
  code: boxTypeCodeSchema,
  displayName: z.string(),
  lengthIn: z.number().int().nullable(),
  widthIn: z.number().int().nullable(),
  heightIn: z.number().int().nullable(),
  loyaltyPointsPerBox: z.number().int(),
  liabilityCapAmount: minorAmountSchema.nullable(),
  liabilityCapCurrency: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  deletedAt: z.coerce.date().nullable(),
});
export type BoxType = z.infer<typeof boxTypeSchema>;

export const boxPriceSchema = z.object({
  id: z.string(),
  boxTypeId: z.string(),
  regionZone: regionZoneSchema,
  currencyCode: z.string(),
  amountMinor: minorAmountSchema,
  serviceMode: serviceModeSchema.nullable(),
  isDiscount: z.boolean(),
  effectiveFrom: z.coerce.date(),
  effectiveTo: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type BoxPrice = z.infer<typeof boxPriceSchema>;

export const accessorySchema = z.object({
  id: z.string(),
  code: accessoryCodeSchema,
  displayName: z.string(),
  amountMinor: minorAmountSchema,
  currencyCode: z.string(),
  isActive: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  deletedAt: z.coerce.date().nullable(),
});
export type Accessory = z.infer<typeof accessorySchema>;

export const tvPriceSchema = z.object({
  id: z.string(),
  sizeBracket: tvSizeBracketSchema,
  regionZone: regionZoneSchema,
  currencyCode: z.string(),
  amountMinor: minorAmountSchema,
  effectiveFrom: z.coerce.date(),
  effectiveTo: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type TvPrice = z.infer<typeof tvPriceSchema>;

export const regionZoneMapEntrySchema = z.object({
  id: z.string(),
  province: z.string(),
  zone: regionZoneSchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type RegionZoneMapEntry = z.infer<typeof regionZoneMapEntrySchema>;

// Lookup helpers exposed to the web.
export const boxPriceLookupQuerySchema = z.object({
  boxTypeCode: boxTypeCodeSchema,
  regionZone: regionZoneSchema,
  currencyCode: z.string().default('PHP'),
  serviceMode: serviceModeSchema.optional(),
});
export type BoxPriceLookupQuery = z.infer<typeof boxPriceLookupQuerySchema>;
