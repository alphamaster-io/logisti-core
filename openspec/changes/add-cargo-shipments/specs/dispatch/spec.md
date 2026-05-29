# dispatch capability (proposed)

## Purpose

The bridge between "shipment is ready" and "stock leaves the warehouse". A `Dispatch` is a day's outbound route — a driver, a vehicle, an ordered list of shipments to deliver. Creating a dispatch is the moment inventory physically moves; this capability is intentionally the only place that emits `pick` and `dispatch` stock movements.

## Requirements

### Requirement: Dispatch board groups ready shipments

The system SHALL expose `GET /api/v1/dispatch/board?branchId=&date=` returning `ready` shipments grouped by destination region (or city). Authenticated callers SHALL hold `shipments.dispatch`.

#### Scenario: Two ready shipments to MNL

- GIVEN two `ready` shipments destined for Manila
- WHEN a dispatcher GETs the board for branch HK-MAIN
- THEN both shipments appear under a "Manila" group

### Requirement: Dispatch creation emits picks + dispatch movements atomically

The system SHALL create a `Dispatch` + N `DispatchLine` rows + N `pick` `stock_movement` rows + N `dispatch` `stock_movement` rows in a single Prisma transaction. If any insert fails, the entire transaction rolls back; inventory is unchanged.

#### Scenario: One dispatch, three shipments

- GIVEN three `ready` shipments
- WHEN a dispatcher POSTs `/api/v1/dispatch` with all three + a driver + a vehicle
- THEN one `Dispatch` exists with three `DispatchLine`s
- AND each shipment transitions to `dispatched`
- AND for each shipment line, one `pick` movement (from-bin set, to-bin null) and one `dispatch` movement (signalling the bin → vehicle handoff) exist
- AND `bin_quantities` decrements accordingly

### Requirement: A shipment is dispatched at most once

The system SHALL refuse to add a shipment to a `Dispatch` if it's already in any open dispatch.

#### Scenario: Double-dispatch attempted

- GIVEN shipment S in dispatch D1 (status `in_transit`)
- WHEN a dispatcher tries to add S to dispatch D2
- THEN the response is 409 with detail `"shipment already in dispatch D1"`

### Requirement: Stops carry an order hint

The system SHALL store a `stopOrder` integer on each `DispatchLine`. The driver UI SHALL show stops in that order. The system SHALL NOT auto-optimize; the order is whatever the dispatcher entered.

### Requirement: Driver + vehicle are required

The system SHALL reject dispatch creation without both a `driverId` (user with the `driver` role and `isActive: true`) and a `vehicleId` (active vehicle in the same branch).

#### Scenario: Inactive vehicle

- GIVEN a vehicle V with `isActive: false`
- WHEN a dispatcher POSTs a dispatch using V
- THEN the response is 400 with detail `"vehicle is inactive"`

### Requirement: Idempotency

The system SHALL require an `Idempotency-Key` header on `POST /api/v1/dispatch`. Replays SHALL return the original response without creating new movements.
