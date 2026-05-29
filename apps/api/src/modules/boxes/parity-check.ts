// Compile-time parity check for Box.

import type { Box as PrismaBox } from '@prisma/client';
import type { Box as ZodBox } from '@logisti-core/shared';

type AssertExtends<A, B extends A> = B;

type _Box = AssertExtends<ZodBox, PrismaBox>;

export {};
