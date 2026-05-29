# warehouse-structure capability (delta — modifies Phase 1 live spec)

## Purpose

(Was: Tenant → Branch → Warehouse → Zone → Rack → Bin, read-only.) Now: Branches gain typing and operating-hours metadata so the system models real ExSpeed locations — partner shops, weekend-only branches, cross-border partners.

## Requirements

### Requirement: Branch type

The system SHALL add `Branch.branchType` enum: `owned` | `partner_shop` | `cross_border_partner`. Default is `owned` (backwards-compatible for the Phase 1 seed). The field is required on new branch creation.

#### Scenario: Existing branches default to `owned`

- GIVEN the Phase 1 seeded branches HK-MAIN and MNL-MAIN
- WHEN the migration adds `branchType` with default `owned`
- THEN both branches have `branchType = owned` after the migration

### Requirement: Partner-shop host metadata

The system SHALL store on `branchType = partner_shop` branches: `partnerName` (the host shop's name), `partnerShopRef` (the shop's internal label, e.g. "Shop 246"), `partnerContactPhone`.

#### Scenario: Liksang Plaza branch metadata

- GIVEN the Tsuen Wan branch hosted inside Liksang Plaza Shop 246
- WHEN reading the branch
- THEN it has `branchType: partner_shop`, `partnerName: "Liksang Plaza"`, `partnerShopRef: "Shop 246"`, plus the standard `code` and address fields

### Requirement: Operating-hours profile

The system SHALL store `Branch.operatingHoursProfile` as one of: `regular_7d`, `mon_fri`, `mon_sat`, `weekend_only`, `holidays_only`, `custom` (with `customHoursJson`).

#### Scenario: Shatin Sundays-only

- GIVEN the Shatin branch
- WHEN reading it
- THEN `operatingHoursProfile = weekend_only` (or `holidays_only` per current ops)
- AND attempting to schedule a pickup on a Monday for Shatin SHALL fail with detail `"branch not open on this date"`

### Requirement: Branch currency

The system SHALL store `Branch.cashCurrency`. HK branches default to `HKD`, Macau partner to `MOP`, PH branches to `PHP`. PaymentLines recorded at a branch SHALL default their currency to the branch's cash currency.

### Requirement: Cross-border partner branches

The system SHALL allow `branchType = cross_border_partner` to omit `warehouseId` (their physical warehouse is the partner's, not ExSpeed's). These branches feed only the `manifests` capability.

#### Scenario: EGL Cargo Macau is cross-border partner

- GIVEN the EGL Cargo Macau "branch"
- WHEN it's seeded
- THEN `branchType = cross_border_partner`
- AND it has no associated `Warehouse` rows
- AND it is the source of `Manifest` uploads

### Requirement: Branch listing UI semantics

The system SHALL expose `GET /api/v1/branches` returning `branchType` in the response shape. UI SHALL display owned/partner/cross-border distinctly. Phase 1 backwards-compat: clients that ignore the new field SHALL continue to function.

### Requirement: Phase 1 spec is amended, not replaced

The Phase 1 live spec (`openspec/specs/warehouse-structure/spec.md`) SHALL be updated by archiving this change. The amendments are additive — no Phase 1 behavior is removed.
