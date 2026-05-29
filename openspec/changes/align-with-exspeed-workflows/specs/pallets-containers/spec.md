# pallets-containers capability (proposed)

## Purpose

The aggregation hierarchy between bin-level inventory and ocean-leg shipments. The workflow ends with "Input to pallet count" → "Load to Container" — this capability owns those two physical layers.

## Requirements

### Requirement: Pallet model

The system SHALL model `Pallet` with: `id`, `tenantId`, `code` (tenant-unique short label), `branchId`, `warehouseId`, `status` (`open` | `sealed` | `loaded`), `sealedAt?`, `sealedBy?`, `containerId?`, `boxCount` (computed), audit fields.

### Requirement: Container model

The system SHALL model `Container` with: `id`, `tenantId`, `containerNumber` (carrier-issued; nullable until assigned), `sealNumber?`, `originPort`, `destinationPort`, `vessel?`, `voyage?`, `etd?` (estimated departure), `eta?` (estimated arrival), `actualDepartedAt?`, `actualArrivedAt?`, `status` (`loading` | `sealed` | `departed` | `arrived` | `customs_clearing` | `released`), audit fields.

### Requirement: Box moves bin → pallet via `palletize` movement

The system SHALL emit a `stock_movement` of type `palletize` when a Box is added to a Pallet. The movement SHALL include `fromBinId` (the bin currently holding the box) and a new `toPalletId` reference. `bin_quantities` decrements; `pallet_quantities` (or equivalent derived view) increments.

#### Scenario: Move 5 boxes to pallet P1

- GIVEN 5 boxes in bin B
- WHEN staff palletizes them to pallet P1
- THEN 5 `stock_movement` rows of type `palletize` exist
- AND `bin_quantities` for B decreases by 5
- AND `Pallet.boxCount` for P1 = 5

### Requirement: Sealing a pallet freezes it

The system SHALL set `Pallet.status = sealed` on `POST /api/v1/pallets/:id/seal`. After sealing, boxes cannot be added or removed without `super_admin` override (which produces an `unseal` audit event).

### Requirement: Loading a pallet onto a container

The system SHALL emit a `stock_movement` of type `containerize` when a sealed Pallet is loaded onto a Container. The movement SHALL include `fromPalletId` and `toContainerId`. Pallet.status → `loaded`. Pallet.containerId is set.

### Requirement: Container open while loading; sealed at departure

The system SHALL allow `Container.status = loading` to accept N Pallet loads. `POST /api/v1/containers/:id/seal` records the carrier seal number; transitions to `sealed`. `POST /api/v1/containers/:id/depart` requires the carrier vessel + voyage + departure timestamp; transitions to `departed`.

### Requirement: Tracking events for Container

The system SHALL emit shipment-level `TrackingEvent`s for every Container status change, scoped to each Shipment whose ShipmentLeg references the Container. Customers tracking their shipment see "Container <X> departed HK on <date>" etc.

#### Scenario: Container departs HK

- GIVEN a container C with 3 pallets covering 5 shipments
- WHEN POST `/api/v1/containers/C/depart`
- THEN 5 TrackingEvents of type `container_departed_origin` are written, one per affected shipment

### Requirement: PH-side arrival splits container into PH warehouse intakes

The system SHALL allow `POST /api/v1/containers/:id/arrive` (PH-side staff) which transitions C → `arrived` and produces `pallet_arrived_destination` movements. PH staff then unsealed pallets, run a destination-zone-based putaway into the PH warehouse's bins.

### Requirement: Container manifest export

The system SHALL expose `GET /api/v1/containers/:id/manifest.pdf` (gated by `containers.read`) listing every Box, every Pallet, the consignees, total weight, and the container details. The PDF is what's filed with the carrier and customs.

### Requirement: Permissions

The system SHALL gate pallet/container reads behind `containers.read` and mutations behind `containers.manage`. Sealing operations SHALL require `containers.seal`. Unsealing requires `super_admin`.

### Requirement: Stock movements gain two more enum values

The system SHALL extend `StockMovement.type` (from Phase 2 stock-movements) with `palletize` and `containerize` enum values.

#### Scenario: Phase 2 has no palletize events yet

- GIVEN a Phase 2 build (this capability not shipped yet)
- WHEN any flow runs
- THEN no stock_movement of type `palletize` or `containerize` exists
- AND the `palletize` / `containerize` API surface returns 501 Not Implemented or is absent
