import { z } from 'zod';
import { boxTypeCodeSchema } from './boxCatalog';

// Zod schemas for boxes. Mirrors Prisma model; enforced at compile time
// by apps/api/src/modules/boxes/parity-check.ts.

export const boxStatusSchema = z.enum([
  'CREATED',
  'RECEIVED',
  'PACKED',
  'PALLETIZED',
  'CONTAINERIZED',
  'IN_TRANSIT',
  'DELIVERED',
  'FAILED_DELIVERY',
  'RETURNED',
]);
export type BoxStatus = z.infer<typeof boxStatusSchema>;

// Decimal columns are opaque across the wire (Prisma's runtime returns a
// Decimal class instance, JSON-serialised as a string). At the persisted-shape
// layer we keep it `unknown` so Prisma's Decimal is assignable; input DTOs
// constrain it to number.
export const decimalLikeSchema = z.unknown();

export const boxSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  number: z.string(),
  serviceOrderId: z.string(),
  boxTypeCode: boxTypeCodeSchema,
  status: boxStatusSchema,
  agentId: z.string().nullable(),
  boxNumberBatchId: z.string().nullable(),
  oversizeInches: z.number().int().nullable(),
  weightKg: decimalLikeSchema.nullable(),
  notes: z.string().nullable(),
  createdBy: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  deletedAt: z.coerce.date().nullable(),
});
export type Box = z.infer<typeof boxSchema>;

// Create payload — adding a box to a service order. When `batchId` is set, the
// box number is allocated from that agent's batch instead of system-generated.
export const createBoxSchema = z.object({
  boxTypeCode: boxTypeCodeSchema,
  batchId: z.string().optional(),
  oversizeInches: z.number().int().positive().max(120).optional(),
  weightKg: z.number().positive().max(99999).optional(),
  notes: z.string().max(500).optional(),
});
export type CreateBoxDto = z.infer<typeof createBoxSchema>;

// Patch payload — limited fields, only while the box (and its order) are still editable.
export const updateBoxSchema = z.object({
  oversizeInches: z.number().int().positive().max(120).nullable().optional(),
  weightKg: z.number().positive().max(99999).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});
export type UpdateBoxDto = z.infer<typeof updateBoxSchema>;
