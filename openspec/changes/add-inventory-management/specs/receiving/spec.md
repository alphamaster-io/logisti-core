# receiving capability (proposed)

## Purpose
Inbound flow: a customer (or supplier) drops goods at a branch, counter staff records what arrived, and a putaway step assigns each line to a bin. This is the **first** place inventory enters the system; getting it right is what makes everything downstream trustworthy.

## Requirements

### Requirement: A receiving session groups inbound lines
The system SHALL model a `ReceivingSession` (header) with N `ReceivingLine` children. The session captures `branchId`, `sourceReference` (customer drop-off ticket, supplier PO, etc.), `notes`, and `status` (`open` / `closed`).

#### Scenario: Open a session, add lines, close
- GIVEN a warehouse_staff user at HK-MAIN
- WHEN they POST `/api/v1/receiving/sessions { sourceReference: "DROP-123" }`
- AND POST two lines (one per parcel) to that session
- AND POST `/sessions/<id>/close`
- THEN the session status is `closed`
- AND `GET /sessions/<id>` returns the two lines

### Requirement: Idempotency-Key is mandatory on line + putaway
The system SHALL require an `Idempotency-Key` header on `POST /receiving/sessions/:id/lines` and `POST /receiving/sessions/:id/putaway`. Replay with the same key SHALL return the original response without side effects.

#### Scenario: Replayed receive doesn't double-create
- GIVEN a successful POST `/sessions/<id>/lines` with key `K`, payload P, response R
- WHEN the same key K is replayed with payload P
- THEN the response equals R
- AND no new `stock_movement` rows exist
- AND no new `receiving_lines` rows exist

#### Scenario: Same key, different payload is a conflict
- GIVEN a successful POST with key K and payload P1
- WHEN POST is replayed with key K and payload P2 ≠ P1
- THEN the response is 409 Conflict

### Requirement: Putaway respects bin capacity
The system SHALL reject putaway requests that would cause the target bin's total quantity to exceed its `capacity`.

#### Scenario: Putaway into full bin
- GIVEN bin B with capacity 10 and current quantity 8
- WHEN putaway tries to add 5 of SKU S
- THEN the response is 409 with detail `"bin capacity exceeded"`
- AND no movement is created

### Requirement: Putaway emits stock movements
The system SHALL emit one `stock_movement` (type `putaway`, fromBinId null, toBinId set) per line putaway, in the same transaction as the bin_quantities update.

#### Scenario: Putaway updates inventory immediately
- GIVEN a receiving line for 5 of SKU S
- WHEN putaway assigns it to bin B
- THEN `GET /api/v1/inventory?binId=B&skuId=S` returns `quantity: 5` (plus any prior)

### Requirement: Required permissions
- `receiving.read` for session/line reads
- `receiving.manage` for create, line add, putaway, close

### Requirement: Open sessions are auditable
The system SHALL allow reading `open` sessions older than 24h via `GET /api/v1/receiving/sessions?status=open&olderThan=24h` for warehouse_admin investigation.

#### Scenario: Find stale open sessions
- GIVEN a session opened 30h ago and never closed
- WHEN a warehouse_admin queries with `status=open&olderThan=24h`
- THEN that session is returned
