# service-orders capability (proposed)

## Purpose

A Service Order is the customer-facing contract for one engagement: who, which intake mode, which boxes, deposit collected, balance due, payment status, current physical state. It is the entity counter staff create and customers ask about. Every Box and every PaymentLine belongs to exactly one Service Order.

## Requirements

### Requirement: Six service modes

The system SHALL accept ServiceOrder.mode as one of: `deliver_box`, `pick_up_box`, `instant_pack`, `storage`, `agent_intake`, `macau_intake`. The mode SHALL be immutable after creation.

#### Scenario: Mode determines required fields

- GIVEN a draft ServiceOrder with `mode = deliver_box`
- WHEN it transitions toward `deposit_collected`
- THEN the system SHALL require a `pickupAddress`, `scheduledPickupAt`, and verifies the address is within a scheduled pickup zone for that branch's calendar
- AND for `mode = instant_pack`, no pickup address is required; the order is anchored to the receiving branch

### Requirement: Status lifecycle for non-storage modes

The system SHALL enforce the lifecycle:

```
draft → deposit_collected → packed → awaiting_full_payment
                                       ├─► paid_in_full → in_warehouse → palletized → shipped → delivered
                                       └─► overdue → (paid_in_full | pending_abandonment → abandoned)
draft → cancelled
deposit_collected → cancelled  (deposit non-refundable per T&Cs)
```

Illegal transitions return 409 with the current status in the problem detail.

#### Scenario: Refund attempt on cancellation

- GIVEN a deposit_collected order
- WHEN it is cancelled
- THEN the deposit PaymentLine is NOT reversed
- AND a tracking event of type `deposit_forfeited` is recorded

### Requirement: Status lifecycle for storage mode

The system SHALL extend the lifecycle for `mode = storage`:

```
draft → deposit_collected → stored → packing_scheduled → packed → awaiting_full_payment → ...
```

`stored` begins a 4-month free-storage clock. At day 121, the system SHALL emit a recurring daily `paid_storage_charge` PaymentLine until the order leaves `stored` state.

#### Scenario: Day 121 emits the first paid-storage charge

- GIVEN a storage-mode order in `stored` since day 0
- WHEN the daily cron runs on day 121
- THEN one PaymentLine of HKD$5 is added with reason `paid_storage_day_121`

### Requirement: Full-payment deadline triggers overdue automatically

The system SHALL transition non-storage orders to `overdue` at midnight 14 days after `packed`. From that moment, a daily HKD$5 PaymentLine SHALL be added until `paid_in_full` or `pending_abandonment`.

#### Scenario: Day 15 starts the daily fee

- GIVEN an order packed on 2024-06-01 still in `awaiting_full_payment`
- WHEN the cron runs on 2024-06-16 00:00 HKT
- THEN status becomes `overdue`
- AND one PaymentLine of HKD$5 with reason `overdue_storage_day_1` is added

### Requirement: 60-day abandonment trigger (HK side)

The system SHALL transition orders to `pending_abandonment` at day 60 from `packed` if still unpaid, and SHALL schedule transfer of the boxes to the PH warehouse.

### Requirement: 6-month abandonment trigger (PH side)

The system SHALL transition orders to `abandoned` at month 6 in the PH warehouse if still unclaimed, and SHALL flag the boxes for disposal/donation. The flag SHALL require a separate super_admin action to physically dispose (no auto-physical-destruction).

### Requirement: A Service Order has 1..N Boxes

The system SHALL require at least one Box on an order before transition out of `draft`. The order's `branchId` SHALL match every Box's `intakeBranchId` (or be `null` for `macau_intake` until reconciled).

### Requirement: Boxes can be added only in `draft` or `deposit_collected`

The system SHALL refuse adding/removing Boxes after `packed`. Mid-flow changes go through a separate revision endpoint that opens a child order and audits the linkage.

### Requirement: Idempotency-Key required on all state transitions

The system SHALL require an `Idempotency-Key` on `POST /api/v1/service-orders`, `/:id/collect-deposit`, `/:id/pack`, `/:id/mark-paid`, `/:id/cancel`. Replays SHALL return the cached response without re-running side effects.

### Requirement: Permissions

The system SHALL gate creation behind `service-orders.create`, reads behind `service-orders.read`, status changes behind `service-orders.manage`. The catalog of permissions SHALL be added to `packages/shared/src/rbac/permissions.ts` and seeded.

### Requirement: ServiceOrder schema is the alignment authority

The system SHALL define the canonical fields used by every layer:

```
ServiceOrder {
  id (cuid)
  tenantId
  number (URL-safe opaque, ≥80 bits)
  mode (enum)
  status (enum)
  paymentStatus (enum: pending_deposit | deposit_collected | partial | paid_in_full | overdue | written_off)
  branchId           // intake branch
  customerId         // null for walk-ins; populated when CRM lands
  customerSnapshot   // jsonb: name, contact for walk-in capture
  consigneeSnapshot  // jsonb: receiver fields from declaration
  pickupAddress?     // for deliver_box
  scheduledPickupAt?
  packedAt?
  paidInFullAt?
  cancelledAt?
  abandonmentDueAt?
  notes?
  agentId?           // for agent_intake
  manifestId?        // for macau_intake
  declarationId?     // FK to declarations
  createdBy, createdAt, updatedAt, deletedAt
}
```

The Zod schema in `packages/shared/src/schemas/serviceOrder.ts` SHALL mirror this field list. The web's typed API client consumes the Zod schema. Any drift fails CI.

#### Scenario: Schema parity in CI

- GIVEN the Prisma model and the Zod schema
- WHEN CI runs `pnpm typecheck`
- THEN the parity check (a generated TypeScript file that asserts `z.infer<typeof serviceOrderSchema>` is assignable from `Prisma.ServiceOrderGetPayload<{}>`) compiles cleanly
