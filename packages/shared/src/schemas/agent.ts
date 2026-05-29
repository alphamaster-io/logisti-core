import { z } from 'zod';
import { decimalLikeSchema } from './box';

// Zod schemas for agents + box-number batches. Mirrors the Prisma models;
// enforced by apps/api/src/modules/agents/parity-check.ts.

export const boxNumberBatchStatusSchema = z.enum(['ACTIVE', 'EXHAUSTED', 'VOIDED']);
export type BoxNumberBatchStatus = z.infer<typeof boxNumberBatchStatusSchema>;

export const agentSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  code: z.string(),
  name: z.string(),
  branchId: z.string().nullable(),
  commissionPercent: decimalLikeSchema.nullable(),
  commissionPerBoxMinor: z
    .union([z.bigint(), z.string().regex(/^-?\d+$/), z.number().int()])
    .transform((v) => (typeof v === 'bigint' ? v : BigInt(v)))
    .nullable(),
  commissionCurrency: z.string().nullable(),
  contactInfo: z.unknown().nullable(),
  isActive: z.boolean(),
  createdBy: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  deletedAt: z.coerce.date().nullable(),
});
export type Agent = z.infer<typeof agentSchema>;

export const createAgentSchema = z
  .object({
    code: z
      .string()
      .min(3)
      .max(40)
      .regex(/^[A-Z0-9-]+$/, 'code must be uppercase letters / digits / dashes'),
    name: z.string().min(1).max(120),
    branchId: z.string().optional(),
    commissionPercent: z.number().min(0).max(100).optional(),
    commissionPerBoxMinor: z.number().int().positive().optional(),
    commissionCurrency: z.string().length(3).optional(),
    contactInfo: z
      .object({
        email: z.string().email().optional(),
        phones: z.array(z.string()).optional(),
        whatsapp: z.string().optional(),
        address: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .refine((v) => !(v.commissionPercent !== undefined && v.commissionPerBoxMinor !== undefined), {
    message: 'set either commissionPercent or commissionPerBoxMinor, not both',
  })
  .refine(
    (v) =>
      (v.commissionPercent === undefined && v.commissionPerBoxMinor === undefined) ||
      v.commissionCurrency !== undefined,
    { message: 'commissionCurrency is required when a commission rate is set' },
  );
export type CreateAgentDto = z.infer<typeof createAgentSchema>;

export const updateAgentSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  branchId: z.string().nullable().optional(),
  commissionPercent: z.number().min(0).max(100).nullable().optional(),
  commissionPerBoxMinor: z.number().int().positive().nullable().optional(),
  commissionCurrency: z.string().length(3).nullable().optional(),
  contactInfo: z.unknown().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateAgentDto = z.infer<typeof updateAgentSchema>;

export const boxNumberBatchSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  agentId: z.string(),
  prefix: z.string(),
  startSeq: z.number().int(),
  endSeq: z.number().int(),
  nextSeq: z.number().int(),
  status: boxNumberBatchStatusSchema,
  notes: z.string().nullable(),
  issuedBy: z.string(),
  issuedAt: z.coerce.date(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type BoxNumberBatch = z.infer<typeof boxNumberBatchSchema>;

export const issueBatchSchema = z.object({
  prefix: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[A-Z0-9-]+$/, 'prefix must be uppercase letters / digits / dashes'),
  startSeq: z.number().int().positive(),
  count: z.number().int().positive().max(100_000),
  notes: z.string().max(500).optional(),
});
export type IssueBatchDto = z.infer<typeof issueBatchSchema>;

// Formats a (prefix, seq) pair into the canonical 6-digit-padded number string.
export function formatBoxNumber(prefix: string, seq: number): string {
  return `${prefix}${seq.toString().padStart(6, '0')}`;
}
