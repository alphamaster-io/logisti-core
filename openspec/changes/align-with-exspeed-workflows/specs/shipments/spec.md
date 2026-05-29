# shipments capability (delta — overrides Phase 3 proposal)

## Purpose

(Was: generic destinations, generic legs.) Now: destinations are the **5 concrete PH region zones**, liability is **capped per box type per the T&Cs**, abandonment is **automatic per the 60/180-day policy**.

## Requirements

### Requirement: Destination is a typed region zone

The system SHALL store `Shipment.destinationZone` as an enum: `MNL_RIZAL`, `LUZON_A`, `LUZON_B`, `BICOL_VISAYAS`, `MINDANAO_ISLANDS`. Free-form destination strings SHALL NOT be accepted.

#### Scenario: Mapping a consignee address to a zone

- GIVEN a consignee address `{ province: "Cebu", city: "Cebu City", ... }`
- WHEN the system computes the zone
- THEN it returns `BICOL_VISAYAS`
- AND the matched rule is recorded in `Shipment.zoneMatchRule` (for audit / future zone-rule changes)

### Requirement: Zone lookup table

The system SHALL seed a `RegionZoneMap` lookup with entries derived from the price list:

- `MNL_RIZAL`: NCR + Rizal
- `LUZON_A`: Batangas, Bulacan, Cavite, Laguna, Pampanga
- `LUZON_B`: Abra, Aurora, Apayao, Baguio, Benguet, Bataan, Cagayan Valley, Ifugao, Ilocos Norte, Ilocos Sur, Isabela, Kalinga, La Union, Mountain Province, Nueva Ecija, Nueva Vizcaya, Pangasinan, Quezon, Quirino, Tarlac, Zambales
- `BICOL_VISAYAS`: Albay, Camarines Norte, Camarines Sur, Sorsogon, Leyte, Samar
- `MINDANAO_ISLANDS`: Marinduque, Masbate, Mindoro, Palawan, Romblon, Guimaras, Siquijor, all other outlying islands + Mindanao provinces

### Requirement: Liability cap per box type

The system SHALL refuse a claim payout exceeding `Box.boxType.liabilityCapAmount`. The cap is recorded on the Shipment at creation time (immutable snapshot — caps may change later, but a shipment is tied to its creation-time cap).

#### Scenario: King box liability cap

- GIVEN a delivered KING box claimed lost
- AND `boxType.liabilityCapAmount = 25000 (HKD$250)`
- WHEN a claim for $400 is filed
- THEN the maximum payout is $250 per the snapshot
- AND the response includes the cap reasoning

### Requirement: Claims window is 15 days from delivery

The system SHALL accept claims via `POST /api/v1/shipments/:id/claims` only if `now < shipment.deliveredAt + 15 days`. After the window, claims SHALL be rejected with detail `"claims window expired"`.

### Requirement: Abandonment is automatic and policy-driven

The system SHALL transition shipments through abandonment per the T&Cs:

- A Service Order unpaid 60 days from `packedAt` → all Boxes flagged `pending_abandonment_hk` → transfer scheduled to PH warehouse
- A Box held in PH warehouse 6 months without disposition → flagged `pending_disposal`
- Physical disposal SHALL require a separate super_admin endpoint; no auto-physical-destroy

#### Scenario: Day 60 HK abandonment

- GIVEN a Service Order packed on 2024-01-01, never paid in full
- WHEN the daily cron runs on 2024-03-01
- THEN all Boxes on the order transition to `pending_abandonment_hk`
- AND tracking events `pending_abandonment` are emitted
- AND the shipment's Boxes are scheduled for transfer to the PH warehouse

### Requirement: Lien on goods until charges paid

The system SHALL refuse `delivery` if `shipment.serviceOrder.balanceDue > 0` AND `shipment.serviceOrder.mode != cod_pending` (COD is Phase 5). Per the T&Cs: "Ex Speed Group Ltd. shall have a lien on any goods until such charges are paid."

#### Scenario: Driver tries to deliver an unpaid shipment

- GIVEN a shipment whose order has balance > 0
- WHEN the driver POSTs the `delivered` event
- THEN the response is 409 with detail `"lien — full payment required before delivery"`
- AND the shipment remains `in_transit`

### Requirement: Multi-leg model includes the ocean leg

The system SHALL model the canonical multi-leg shipment as:

1. **Intake leg** — Branch / Agent / Customer's place → HK warehouse (Phase 3 receiving + putaway already covers this)
2. **Container leg** — HK warehouse → PH warehouse via Container (handled by `pallets-containers`)
3. **PH-side handling** — PH warehouse → PH zone hub (intra-PH leg if needed)
4. **Last-mile leg** — Zone hub or PH warehouse → consignee's door (Phase 3 driver mobile)

Each leg's status drives the parent shipment status (worst-of-legs aggregation as proposed in Phase 3).

### Requirement: This refines Phase 3's generic destinations + liability + abandonment

The Phase 3 `add-cargo-shipments` proposal's `destinationCity` and free-form abandonment text are SUPERSEDED. Code MUST follow this delta.
