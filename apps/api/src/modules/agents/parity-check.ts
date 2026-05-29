// Compile-time parity check for Agent + BoxNumberBatch.

import type { Agent as PrismaAgent, BoxNumberBatch as PrismaBatch } from '@prisma/client';
import type { Agent as ZodAgent, BoxNumberBatch as ZodBatch } from '@logisti-core/shared';

type AssertExtends<A, B extends A> = B;

type _Agent = AssertExtends<ZodAgent, PrismaAgent>;
type _Batch = AssertExtends<ZodBatch, PrismaBatch>;

export {};
