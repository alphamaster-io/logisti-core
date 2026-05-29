import { z } from 'zod';
import { minorAmountSchema } from './boxCatalog';

// Payments & deposits Zod schemas. Mirrors the Prisma PaymentLine model;
// enforced by apps/api/src/modules/payments/parity-check.ts.

export const paymentLineKindSchema = z.enum([
  'BOX_DEPOSIT',
  'BOX_BALANCE',
  'INSTANT_PACK_DISCOUNT',
  'TAKE_OUT_BOX_DISCOUNT',
  'LOYALTY_REDEMPTION',
  'OVERSIZE_SURCHARGE',
  'STORAGE_DEPOSIT',
  'PAID_STORAGE_CHARGE',
  'STORAGE_PICKUP_FEE',
  'AGENT_COMMISSION',
  'RECEIVED',
  'BOUNCED',
  'CORRECTION',
]);
export type PaymentLineKind = z.infer<typeof paymentLineKindSchema>;

export const paymentLineSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  serviceOrderId: z.string(),
  boxId: z.string().nullable(),
  // Set on AGENT_COMMISSION lines so payouts are queryable per agent.
  agentId: z.string().nullable(),
  kind: paymentLineKindSchema,
  amount: minorAmountSchema,
  currencyCode: z.string(),
  reason: z.string(),
  relatedLineId: z.string().nullable(),
  accruedAt: z.coerce.date(),
  recordedBy: z.string(),
  requestId: z.string().nullable(),
  createdAt: z.coerce.date(),
});
export type PaymentLine = z.infer<typeof paymentLineSchema>;

// Charge kinds are operator-recordable directly; RECEIVED is a payment;
// CORRECTION/BOUNCED go through their own dedicated endpoints.
export const recordChargeKindSchema = z.enum([
  'BOX_DEPOSIT',
  'BOX_BALANCE',
  'INSTANT_PACK_DISCOUNT',
  'TAKE_OUT_BOX_DISCOUNT',
  'OVERSIZE_SURCHARGE',
  'STORAGE_DEPOSIT',
  'PAID_STORAGE_CHARGE',
  'STORAGE_PICKUP_FEE',
]);

export const recordChargeSchema = z.object({
  kind: recordChargeKindSchema,
  amountMinor: z.union([z.number().int(), z.string().regex(/^-?\d+$/)]),
  currencyCode: z.string().min(3).max(3),
  reason: z.string().min(1).max(500),
  boxId: z.string().optional(),
});
export type RecordChargeDto = z.infer<typeof recordChargeSchema>;

export const recordPaymentSchema = z.object({
  amountMinor: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]),
  currencyCode: z.string().min(3).max(3),
  reason: z.string().min(1).max(500),
});
export type RecordPaymentDto = z.infer<typeof recordPaymentSchema>;

export const correctLineSchema = z.object({
  reason: z.string().min(1).max(500),
});
export type CorrectLineDto = z.infer<typeof correctLineSchema>;

export const balanceByCurrencySchema = z.object({
  currencyCode: z.string(),
  totalCharges: z.string(), // bigint serialized as string
  totalReceipts: z.string(),
  balanceDue: z.string(),
});
export type BalanceByCurrency = z.infer<typeof balanceByCurrencySchema>;
