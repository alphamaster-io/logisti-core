# delivery capability (proposed)

## Purpose

The terminal step: a shipment arrives at the recipient and the driver captures **Proof of Delivery** — photo, signature, geo, recipient name. `delivered` is reachable only by capturing a `DeliveryProof`. No admin override exists; failed-delivery is the alternative path.

## Requirements

### Requirement: Delivery requires a complete proof

The system SHALL require all of the following fields to transition a shipment leg to `delivered`:

- `photoObjectKey` (object key into the tenant's storage prefix)
- `signatureSvg` (non-empty SVG string)
- `recipientName` (non-empty string)
- `geoLatitude` / `geoLongitude` OR `geoStatus: "DENIED"` (mutually exclusive)

#### Scenario: Missing signature

- GIVEN a driver POSTs `delivery/proofs` without `signatureSvg`
- WHEN the request is processed
- THEN the response is 400 with detail `"signature required"`
- AND the shipment remains `in_transit`

### Requirement: Photo upload is direct-to-storage

The system SHALL issue a short-lived signed PUT URL via `POST /api/v1/uploads/signed-url` (max 5 MB, JPEG/PNG only, expires in 5 min). The driver SHALL upload the photo directly to storage; the POD `photoObjectKey` SHALL reference the uploaded object.

#### Scenario: Signed URL expires

- GIVEN a signed URL issued 6 minutes ago
- WHEN the driver attempts the PUT
- THEN storage rejects with 403

### Requirement: Tenant prefix isolation

The system SHALL prefix every signed URL with `tenants/<tenantId>/pods/<shipmentId>/`. Cross-tenant reads of POD images SHALL be impossible at the storage layer.

#### Scenario: Tenant A can't read tenant B's PODs

- GIVEN tenant A and tenant B's POD object keys
- WHEN tenant A's authenticated request lists POD images
- THEN only objects under `tenants/<A.id>/` are returned

### Requirement: Failed delivery alternative

The system SHALL accept `POST /api/v1/driver/dispatch-lines/:id/fail` with `{ reasonCode, rescheduleDate?, notes? }`. Valid reason codes SHALL be: `recipient_absent`, `address_invalid`, `recipient_refused`, `damaged_in_transit`, `other`.

#### Scenario: Recipient absent, reschedule for tomorrow

- GIVEN a driver at a stop
- WHEN they POST `/fail` with `reasonCode: "recipient_absent", rescheduleDate: <tomorrow>`
- THEN the shipment transitions to `failed_delivery`
- AND a tracking event is recorded with the reason
- AND the dispatcher can re-add it to a future dispatch

### Requirement: Reservation released on cancel but consumed on failed

The system SHALL NOT release the inventory reservation when a shipment moves to `failed_delivery` — the stock is still committed to that shipment until either delivered, cancelled, or re-dispatched.

#### Scenario: Failed shipment doesn't free stock

- GIVEN a shipment that has just transitioned to `failed_delivery`
- WHEN `GET /api/v1/inventory?skuId=<...>`
- THEN the `reserved` counter still includes that shipment's lines

### Requirement: POD is immutable

The system SHALL NOT permit updating or deleting a `DeliveryProof` once written. Corrections SHALL be expressed as a new tracking event of type `delivery_proof_corrected` linked to the original.

#### Scenario: Wrong photo uploaded

- GIVEN POD P with the wrong photo
- WHEN the driver realises and resubmits
- THEN a new tracking event of type `delivery_proof_corrected` is recorded
- AND P is unchanged
- AND the timeline shows both events
