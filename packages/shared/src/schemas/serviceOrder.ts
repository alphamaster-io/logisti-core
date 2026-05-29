import { z } from 'zod';
import { serviceModeSchema } from './boxCatalog';

// Zod schemas for service-orders. Mirrors Prisma model; enforced at compile
// time by the parity check in apps/api/src/modules/service-orders/parity-check.ts.

export const serviceOrderStatusSchema = z.enum([
  'DRAFT',
  'DEPOSIT_COLLECTED',
  'STORED',
  'PACKING_SCHEDULED',
  'PACKED',
  'AWAITING_FULL_PAYMENT',
  'PAID_IN_FULL',
  'OVERDUE',
  'IN_WAREHOUSE',
  'PALLETIZED',
  'SHIPPED',
  'DELIVERED',
  'FAILED_DELIVERY',
  'PENDING_ABANDONMENT',
  'ABANDONED',
  'CANCELLED',
]);
export type ServiceOrderStatus = z.infer<typeof serviceOrderStatusSchema>;

export const serviceOrderPaymentStatusSchema = z.enum([
  'PENDING_DEPOSIT',
  'DEPOSIT_COLLECTED',
  'PARTIAL',
  'PAID_IN_FULL',
  'OVERDUE',
  'WRITTEN_OFF',
]);
export type ServiceOrderPaymentStatus = z.infer<typeof serviceOrderPaymentStatusSchema>;

// Address shapes — kept loose for now since each side (HK origin / PH consignee)
// has its own structure. The Declaration capability later codifies the exact form fields.
export const hkAddressSchema = z
  .object({
    roomFlatFloor: z.string().optional(),
    building: z.string().optional(),
    street: z.string().optional(),
    road: z.string().optional(),
    district: z.string().optional(),
  })
  .passthrough();

export const phAddressSchema = z
  .object({
    houseBlockLot: z.string().optional(),
    street: z.string().optional(),
    barangay: z.string().optional(),
    town: z.string().optional(),
    city: z.string().optional(),
    province: z.string().optional(),
  })
  .passthrough();

export const customerSnapshotSchema = z
  .object({
    surname: z.string().min(1),
    givenName: z.string().min(1),
    middleInitial: z.string().max(2).optional(),
    contactNumbers: z.array(z.string().min(1)).min(1),
    idNumber: z.string().optional(),
    address: hkAddressSchema.optional(),
  })
  .passthrough();

export const consigneeSnapshotSchema = z
  .object({
    surname: z.string().min(1),
    givenName: z.string().min(1),
    middleInitial: z.string().max(2).optional(),
    contactNumbers: z.array(z.string().min(1)).min(1),
    address: phAddressSchema,
  })
  .passthrough();

// The persisted ServiceOrder shape (Prisma payload). Parity checked.
export const serviceOrderSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  number: z.string(),
  mode: serviceModeSchema,
  status: serviceOrderStatusSchema,
  paymentStatus: serviceOrderPaymentStatusSchema,
  branchId: z.string(),
  customerSnapshot: z.unknown(),
  consigneeSnapshot: z.unknown(),
  pickupAddress: z.unknown().nullable(),
  scheduledPickupAt: z.coerce.date().nullable(),
  packedAt: z.coerce.date().nullable(),
  storedAt: z.coerce.date().nullable(),
  paidInFullAt: z.coerce.date().nullable(),
  cancelledAt: z.coerce.date().nullable(),
  abandonmentDueAt: z.coerce.date().nullable(),
  agentId: z.string().nullable(),
  manifestId: z.string().nullable(),
  declarationId: z.string().nullable(),
  notes: z.string().nullable(),
  createdBy: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  deletedAt: z.coerce.date().nullable(),
});
export type ServiceOrder = z.infer<typeof serviceOrderSchema>;

// Create payload — mode-driven required fields are enforced in the API layer
// (we cannot express "required when mode = X" in zod without a discriminated
// union of every mode; the controller does it).
export const createServiceOrderSchema = z.object({
  mode: serviceModeSchema,
  branchId: z.string().min(1),
  customerSnapshot: customerSnapshotSchema,
  consigneeSnapshot: consigneeSnapshotSchema,
  pickupAddress: hkAddressSchema.optional(),
  scheduledPickupAt: z.coerce.date().optional(),
  notes: z.string().max(2000).optional(),
});
export type CreateServiceOrderDto = z.infer<typeof createServiceOrderSchema>;

// Patch (only legal in DRAFT)
export const updateServiceOrderSchema = z.object({
  customerSnapshot: customerSnapshotSchema.optional(),
  consigneeSnapshot: consigneeSnapshotSchema.optional(),
  pickupAddress: hkAddressSchema.optional(),
  scheduledPickupAt: z.coerce.date().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});
export type UpdateServiceOrderDto = z.infer<typeof updateServiceOrderSchema>;

export const cancelServiceOrderSchema = z.object({
  reason: z.string().min(1).max(500),
});
export type CancelServiceOrderDto = z.infer<typeof cancelServiceOrderSchema>;

// Full status state machine — exported so any consumer (web UI, e2e tests,
// future cron jobs) shares the same set of legal transitions.
export const SERVICE_ORDER_TRANSITIONS: Record<ServiceOrderStatus, readonly ServiceOrderStatus[]> =
  {
    DRAFT: ['DEPOSIT_COLLECTED', 'CANCELLED'],
    DEPOSIT_COLLECTED: ['PACKED', 'STORED', 'CANCELLED'],
    STORED: ['PACKING_SCHEDULED', 'CANCELLED'],
    PACKING_SCHEDULED: ['PACKED'],
    PACKED: ['AWAITING_FULL_PAYMENT'],
    AWAITING_FULL_PAYMENT: ['PAID_IN_FULL', 'OVERDUE'],
    PAID_IN_FULL: ['IN_WAREHOUSE'],
    OVERDUE: ['PAID_IN_FULL', 'PENDING_ABANDONMENT'],
    IN_WAREHOUSE: ['PALLETIZED'],
    PALLETIZED: ['SHIPPED'],
    SHIPPED: ['DELIVERED', 'FAILED_DELIVERY'],
    FAILED_DELIVERY: ['AWAITING_FULL_PAYMENT'], // reschedule via order edit later
    PENDING_ABANDONMENT: ['ABANDONED', 'PAID_IN_FULL'], // last-chance pay-and-redeem
    ABANDONED: [], // terminal
    DELIVERED: [], // terminal
    CANCELLED: [], // terminal
  };

export function canTransitionServiceOrder(
  from: ServiceOrderStatus,
  to: ServiceOrderStatus,
): boolean {
  return SERVICE_ORDER_TRANSITIONS[from].includes(to);
}
