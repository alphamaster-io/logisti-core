# shipments capability (proposed)

## Purpose

A `Shipment` is a contract to move N units of stock from an origin branch to a recipient. It owns lines (what's moving), legs (how it gets there — one for local, many for multi-leg cross-border), and a status that transitions through a fixed state machine. The only entity in the system that consumes Phase 2 inventory.

## Requirements

### Requirement: Status state machine is fixed

The system SHALL enforce these transitions only:

```
draft → ready
draft → cancelled
ready → dispatched
ready → cancelled
dispatched → in_transit
in_transit → delivered
in_transit → failed_delivery
failed_delivery → ready    (reschedule)
```

The system SHALL reject any other transition with 409 Conflict.

#### Scenario: Setting back from delivered

- GIVEN a shipment in `delivered`
- WHEN a caller tries to transition it to any other state
- THEN the response is 409 with the current state in the `detail` field

### Requirement: Lines reserve inventory at `ready`

The system SHALL increment a per-`(skuId, branchId)` reservation counter when a shipment transitions `draft → ready`. The system SHALL decrement on `ready → cancelled`. The system SHALL consume (not just decrement) on `ready → dispatched` by emitting `pick` movements.

#### Scenario: Reservation visible in inventory reads

- GIVEN 10 of SKU S in bin B
- WHEN a shipment of 3 of SKU S is marked `ready`
- THEN `GET /api/v1/inventory?skuId=S` returns `quantity: 10, reserved: 3, available: 7`

#### Scenario: Cancel releases reservation

- GIVEN a shipment of 3 of SKU S in `ready`
- WHEN it is `cancelled`
- THEN `available` for SKU S goes up by 3
- AND no `pick` movement was emitted

### Requirement: Ready transition fails if insufficient available stock

The system SHALL refuse to transition a shipment to `ready` if any line's quantity exceeds available (on-hand minus reserved) stock.

#### Scenario: Overcommitting stock

- GIVEN SKU S with `available: 2`
- WHEN a shipment line for 5 of SKU S is marked `ready`
- THEN the response is 409 with detail `"insufficient available stock"`
- AND no reservation is created

### Requirement: Multi-leg parent + child rollup

The system SHALL allow a parent shipment to have N `ShipmentLeg` rows. Parent status SHALL be the "worst" of its leg statuses: any leg `failed_delivery` → parent `failed_delivery`; parent `delivered` only when all legs `delivered`.

#### Scenario: Two-leg shipment, second leg delivered

- GIVEN a shipment with legs L1 (delivered) and L2 (in_transit)
- WHEN L2 transitions to `delivered`
- THEN the parent shipment transitions to `delivered`

### Requirement: Shipment numbers are opaque + URL-safe

The system SHALL assign each shipment a tenant-unique `shipmentNumber` that is URL-safe (a-z0-9 + dashes), opaque (non-sequential), and at least 80 bits of entropy.

#### Scenario: Numbers don't leak ordering

- GIVEN two shipments created 1 minute apart
- WHEN their numbers are compared lexicographically
- THEN no ordering between them is implied

### Requirement: Idempotency on state-change endpoints

The system SHALL require an `Idempotency-Key` header on `POST /shipments/:id/ready`, `/cancel`, and any future transition endpoint. Replays SHALL return the cached response without re-running side effects.

### Requirement: Permissions

The system SHALL gate write endpoints behind `shipments.create`, reads behind `shipments.read`, and dispatch behind `shipments.dispatch`.

#### Scenario: Driver can't cancel shipments

- GIVEN a user with only the `driver` role
- WHEN they POST `/api/v1/shipments/:id/cancel`
- THEN the response is 403
