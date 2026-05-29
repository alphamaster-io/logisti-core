// Compile-time parity check: ServiceOrder Prisma payload type must be
// assignable from the Zod-inferred type in @logisti-core/shared.
// See box-catalog/parity-check.ts for the pattern.

import type { ServiceOrder as PrismaServiceOrder } from '@prisma/client';
import type { ServiceOrder as ZodServiceOrder } from '@logisti-core/shared';

type AssertExtends<A, B extends A> = B;

type _ServiceOrder = AssertExtends<ZodServiceOrder, PrismaServiceOrder>;

export {};
