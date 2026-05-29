# tracking capability (proposed)

## Purpose

The chronological event log of a shipment's journey. Every status transition, every driver action, every delivery exception is a `TrackingEvent`. Two read surfaces: the public customer-facing endpoint (filtered, rate-limited, no PII) and the authenticated internal view (full timeline, audit-grade).

## Requirements

### Requirement: Events are append-only

The system SHALL NOT expose any endpoint that updates or deletes a `TrackingEvent`. Corrections SHALL be expressed as new events with a `correction_of` reference.

#### Scenario: Editing not allowed

- GIVEN an event E
- WHEN any client tries to mutate it directly
- THEN no API supports that operation

### Requirement: Public endpoint is unauthenticated and rate-limited

The system SHALL expose `GET /api/v1/track/:shipmentNumber` without authentication, rate-limited to 60 requests/min/IP. The response SHALL include only events flagged `public: true`.

#### Scenario: Customer reads timeline

- GIVEN shipment with number `7h2-quark-4kx`
- WHEN an unauthenticated client GETs `/api/v1/track/7h2-quark-4kx`
- THEN the response is 200 with the public events in chronological order
- AND no PII (recipient address, internal staff names) is present

#### Scenario: Rate limit triggers

- GIVEN 60 requests in the last minute from IP X
- WHEN the 61st request from X arrives
- THEN the response is 429 with a `Retry-After` header

### Requirement: Authenticated endpoint shows full audit-grade timeline

The system SHALL expose `GET /api/v1/shipments/:id/tracking` for callers with `shipments.read`. The response SHALL include all events including internal-only ones and recordedBy user references.

#### Scenario: Dispatcher sees internal events

- GIVEN an internal `picked_up` event on shipment S
- WHEN a dispatcher GETs `/api/v1/shipments/<S.id>/tracking`
- THEN the response includes the event with `recordedBy`

### Requirement: Driver-recorded events carry GPS

The system SHALL accept driver-recorded events (arrived, delivered, failed_delivery) with optional `latitude` + `longitude`. When the device denies geolocation, the system SHALL still accept the event but record `geoStatus: "DENIED"`.

#### Scenario: Driver delivers without GPS

- GIVEN a driver whose device denies geolocation
- WHEN they POST a `delivered` event
- THEN the event is recorded with `geoStatus: "DENIED"`
- AND the event still completes the delivery transition

### Requirement: Idempotency for driver events

The system SHALL require an `Idempotency-Key` (driver-supplied UUID) on every driver-mobile event submission. A retry with the same key SHALL be a no-op.

#### Scenario: Driver retries an arrive event

- GIVEN a driver successfully posted an `arrived` event with key K
- WHEN they replay the same request with K (connection-drop retry)
- THEN no new event is recorded
- AND the response equals the original

### Requirement: Events power shipment timeline

The system SHALL maintain `shipments.status` consistent with the latest terminal event: `delivered` event → status `delivered`; `failed_delivery` event → status `failed_delivery`. These updates happen in the same transaction as the event insert.
