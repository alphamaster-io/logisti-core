// Compile-time parity check: Prisma payload types must be assignable from
// the Zod-inferred types defined in @logisti-core/shared. If this file
// fails typecheck, the Prisma model and the Zod schema have drifted.
//
// Add to this file every time a new capability lands. The cost of a
// drift bug at runtime is much higher than the cost of one assertion here.

import type {
  BoxType as PrismaBoxType,
  BoxPrice as PrismaBoxPrice,
  Accessory as PrismaAccessory,
  TvPrice as PrismaTvPrice,
  RegionZoneMap as PrismaRegionZoneMap,
} from '@prisma/client';
import type {
  BoxType as ZodBoxType,
  BoxPrice as ZodBoxPrice,
  Accessory as ZodAccessory,
  TvPrice as ZodTvPrice,
  RegionZoneMapEntry as ZodRegionZoneMapEntry,
} from '@logisti-core/shared';

// One-way assignability: Prisma → Zod. The Zod-inferred shape is what the
// API responds with; the Prisma payload is what we read from the DB. They
// MUST have matching field names + compatible types.
type AssertExtends<A, B extends A> = B;

// If these compile, the shapes match.

type _BoxType = AssertExtends<ZodBoxType, PrismaBoxType>;

type _BoxPrice = AssertExtends<ZodBoxPrice, PrismaBoxPrice>;

type _Accessory = AssertExtends<ZodAccessory, PrismaAccessory>;

type _TvPrice = AssertExtends<ZodTvPrice, PrismaTvPrice>;

type _RegionZoneMapEntry = AssertExtends<ZodRegionZoneMapEntry, PrismaRegionZoneMap>;

export {};
