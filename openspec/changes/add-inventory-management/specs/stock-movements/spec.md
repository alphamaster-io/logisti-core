# stock-movements capability (proposed)

## Purpose
The event log every quantity change in the system writes to. Stock totals derive from this log; the log is the source of truth. Read-only externally; internal services use `StockMovementService.record()` to write.

## Requirements

### Requirement: Movements are immutable
The system SHALL NOT expose any endpoint that updates or deletes a `stock_movement`. Corrections SHALL be expressed as new movements (e.g. an offsetting adjust).

#### Scenario: Adjustment, not edit
- GIVEN a movement M for `quantity: 5`
- WHEN an operator realises the correct quantity should have been 4
- THEN they POST `/api/v1/inventory/adjustments { deltaQuantity: -1, reason: "receipt correction" }`
- AND M is unchanged

### Requirement: Movement types
The system SHALL support movement types: `receive`, `putaway`, `transfer`, `adjust`, `pick`, `dispatch`. Phase 2 implements the first four; `pick` and `dispatch` ship with Phase 3.

#### Scenario: Phase 2 doesn't emit pick movements
- GIVEN a Phase 2 build
- WHEN any flow runs
- THEN no `stock_movement` of type `pick` or `dispatch` is created

### Requirement: Double-entry semantics
The system SHALL require movements that physically move stock between bins (`transfer`) to populate both `fromBinId` and `toBinId`. `receive` populates only `toBinId`. `pick` populates only `fromBinId`. `adjust` populates `toBinId` for positive deltas and `fromBinId` for negative.

#### Scenario: Transfer movement
- GIVEN bins B1 (qty 5) and B2 (qty 0) for SKU S
- WHEN a `transfer` movement records `quantity: 3, fromBinId: B1, toBinId: B2`
- THEN `B1.quantity = 2` and `B2.quantity = 3` in `bin_quantities`

### Requirement: Movements + bin_quantities update atomically
The system SHALL update `bin_quantities` and insert the `stock_movement` row in a single Prisma transaction. If either fails, both roll back.

#### Scenario: Failure mid-transaction rolls back
- GIVEN a movement that violates the no-negative-stock rule
- WHEN the transaction runs
- THEN the `stock_movement` insert is rolled back
- AND `bin_quantities` is unchanged

### Requirement: Movements are queryable
The system SHALL expose `GET /api/v1/stock-movements` gated by `inventory.read` with cursor pagination and filters: `productId`, `skuId`, `branchId`, `binId`, `type`, `createdAt` range.

#### Scenario: Filter by product and time
- GIVEN movements for product P over the last week
- WHEN `GET /api/v1/stock-movements?productId=P.id&from=<7d ago>`
- THEN the response contains those movements in reverse chronological order

### Requirement: requestId is recorded on every movement
The system SHALL populate `stock_movement.requestId` from the inbound request's `X-Request-ID`. This SHALL match the `audit_logs.requestId` for the same operation.

#### Scenario: Trace a movement back to its request
- GIVEN a movement M created during request R
- WHEN an operator queries `audit_logs` by `requestId = R.id`
- THEN they find the API call that produced M
