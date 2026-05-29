# inventory capability (proposed)

## Purpose
The current state of stock — what is in which bin, right now. `inventory` is a read view over `bin_quantities` (a materialised projection of `stock-movements`). Writes happen only via `receiving` and `inventory.adjust`; this capability is read-only at the API surface except for the adjust endpoint.

## Requirements

### Requirement: Bin-level visibility
The system SHALL expose `GET /api/v1/inventory?productId=&branchId=&warehouseId=&binId=` returning bin-level totals.

#### Scenario: Drill from product to bin
- GIVEN product P received into bin B with quantity 5
- WHEN `GET /api/v1/inventory?productId=P.id`
- THEN the response contains exactly one row with `binId=B.id`, `quantity=5`

### Requirement: Summary view
The system SHALL expose `GET /api/v1/inventory/summary?productId=` returning totals grouped by branch.

#### Scenario: Same SKU in two branches
- GIVEN 5 of P in HK-MAIN and 3 of P in MNL-MAIN
- WHEN `GET /api/v1/inventory/summary?productId=P.id`
- THEN the response is `[{ branch: HK-MAIN, qty: 5 }, { branch: MNL-MAIN, qty: 3 }]`

### Requirement: Adjustments require a reason
The system SHALL accept `POST /api/v1/inventory/adjustments` with `{ productId, skuId, binId, deltaQuantity, reason }`. `reason` SHALL be a non-empty string. The endpoint SHALL create one `stock_movement` of type `adjust` and update `bin_quantities` in a single transaction.

#### Scenario: Adjustment without reason rejected
- GIVEN an inventory_manager
- WHEN they POST `/api/v1/inventory/adjustments` with `reason: ""`
- THEN the response is 400

#### Scenario: Adjustment creates a movement
- GIVEN bin B with 5 of SKU S
- WHEN an inventory_manager POSTs `{ binId: B, skuId: S, deltaQuantity: -2, reason: "damaged" }`
- THEN `GET /api/v1/stock-movements` shows one new row of type `adjust`, quantity 2, reason `damaged`
- AND `GET /api/v1/inventory?binId=B` shows `quantity: 3`

### Requirement: Quantities never go negative
The system SHALL reject any adjustment or pick that would cause `bin_quantities.quantity < 0`.

#### Scenario: Overdrawing a bin
- GIVEN bin B with 1 of SKU S
- WHEN an inventory_manager POSTs `{ binId: B, skuId: S, deltaQuantity: -5, reason: "..." }`
- THEN the response is 409 with detail `"insufficient stock"`
- AND no movement is created
- AND `bin_quantities` is unchanged

### Requirement: Required permissions
The system SHALL gate inventory reads behind `inventory.read` and adjustments behind `inventory.adjust`.
