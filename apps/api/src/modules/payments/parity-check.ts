// Compile-time parity check for PaymentLine.
import type { PaymentLine as PrismaPaymentLine } from '@prisma/client';
import type { PaymentLine as ZodPaymentLine } from '@logisti-core/shared';

type AssertExtends<A, B extends A> = B;

type _PaymentLine = AssertExtends<ZodPaymentLine, PrismaPaymentLine>;

export {};
