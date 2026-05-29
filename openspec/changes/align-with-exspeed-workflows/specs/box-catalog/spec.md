# box-catalog capability (proposed)

## Purpose

The seven fixed Box Types are the platform's primary SKU. They have fixed dimensions, fixed loyalty stamp value, and a per-region price matrix. This capability owns the catalog and the price lookup.

## Requirements

### Requirement: Seven seeded box types plus two dynamic categories

The system SHALL seed the following box type codes: `KING`, `SUPER`, `JUMBO`, `REGULAR`, `MEDIUM`, `SMALL`, `EX_BUDGET`, plus open categories `OVERSIZE` and `ODD_SIZE` (dimensions not pre-set).

#### Scenario: Fresh seed lists all codes

- GIVEN a freshly seeded database
- WHEN `GET /api/v1/box-types`
- THEN the response contains exactly 9 codes in declared order
- AND each fixed-dimension type has `lengthIn`, `widthIn`, `heightIn` populated per the canonical table

### Requirement: Dimensions are inch-precise, immutable per type

The system SHALL store `lengthIn`, `widthIn`, `heightIn` as integers (inches) on fixed-dimension types. Updates to dimensions on a seeded type SHALL require `super_admin` and SHALL be audited.

#### Scenario: KING is 24x24x41

- GIVEN seeded box types
- WHEN reading the KING type
- THEN dimensions = `{ 24, 24, 41 }`

### Requirement: Loyalty points per box are fixed per type

The system SHALL record `loyaltyPointsPerBox` per box type: KING=6, SUPER=5, JUMBO=4, REGULAR=3, MEDIUM=2, SMALL=1, EX_BUDGET=0, OVERSIZE=0, ODD_SIZE=0.

### Requirement: Liability cap per box type

The system SHALL store a `liabilityCapAmount` (bigint minor units) and `liabilityCapCurrency` per box type. Seeded values: KING = HKD$250 = `25000`; EX_BUDGET = HKD$100 = `10000`; other fixed sizes get a linearly interpolated cap (rounded to nearest $10). OVERSIZE and ODD_SIZE liability is per-quotation; `liabilityCapAmount = null`.

#### Scenario: King box liability

- GIVEN a King box on a delivered shipment that's reported lost
- WHEN a claim is filed within 15 days
- THEN the maximum payout is HKD$250 per the box type's `liabilityCapAmount`

### Requirement: Per-region price matrix

The system SHALL maintain a `BoxPrice` row per `(boxTypeId, regionZone, currency, serviceMode?)`. `regionZone` SHALL be one of: `MNL_RIZAL`, `LUZON_A`, `LUZON_B`, `BICOL_VISAYAS`, `MINDANAO_ISLANDS`. `serviceMode` SHALL be optional; when null, the row is the regular retail price.

#### Scenario: Lookup KING price for MNL/Rizal

- GIVEN a seeded HKG price list (Jan 2024)
- WHEN looking up the KING price for `MNL_RIZAL`, currency HKD, regular mode
- THEN the price is `1035_00` (₱1035 represented in cents) per the price list

#### Scenario: Service-mode discount lookup

- GIVEN the Instant Packing Discount row for KING = HKD$120 off
- WHEN looking up KING for service mode `instant_pack`
- THEN the row exists and the discount applies as a separate PaymentLine, not by reducing the base price

### Requirement: Oversize surcharge is currency-zoned

The system SHALL record an oversize surcharge of HKD$60/inch for HK-origin Service Orders and MOP$30/inch for Macau-origin Service Orders. The surcharge SHALL be computed as `(longest_dim_in - 41) * unitSurcharge` if positive, else zero (compared against the KING long dimension; the rule is per current ops).

### Requirement: Accessories catalog as a sibling

The system SHALL maintain a separate accessory catalog with seeded entries: `PADLOCK` (HKD$12), `TAPE_CLEAR` (HKD$7), `STORAGE_BAG_S` (HKD$14), `STORAGE_BAG_M` (HKD$16), `STORAGE_BAG_L` (HKD$22), `STORAGE_BAG_LOGO` (HKD$22).

#### Scenario: Sell a padlock with a box

- GIVEN a Service Order with one KING box
- WHEN staff adds an accessory `PADLOCK`
- THEN a PaymentLine of HKD$12 is added
- AND the accessory has no `regionZone` (it's HK-side only)

### Requirement: TV pricelist as a sibling product family

The system SHALL maintain a TV pricelist with diagonal-inch brackets: `25_29`, `30_34`, `35_42`, `43_50`, `51_64`, each priced per region zone (MNL/Rizal, Luzon, Visayas, Islands).

#### Scenario: 43" TV to Visayas

- GIVEN the seeded TV pricelist
- WHEN looking up bracket `43_50` for `BICOL_VISAYAS`, currency PHP
- THEN the price is `1950_00` per the price list

### Requirement: Read-only API gated by `box-catalog.read`

The system SHALL expose `GET /api/v1/box-types`, `GET /api/v1/box-prices`, `GET /api/v1/accessories`, `GET /api/v1/tv-pricelist`, all gated by `box-catalog.read`. Mutating endpoints (price updates) SHALL require `box-catalog.manage` and are super_admin / pricing_manager only.

### Requirement: Price updates are versioned

The system SHALL never overwrite a `BoxPrice` row in place. Updates SHALL insert a new row with `effectiveFrom` set, and SHALL set the prior row's `effectiveTo` to the new row's `effectiveFrom`. Lookups SHALL select the row where `effectiveFrom <= now < effectiveTo (or null)`.

#### Scenario: Mid-month price change

- GIVEN a KING price of HKD$1035 effective 2024-01-20
- WHEN a new KING price of HKD$1090 is set effective 2024-06-01
- AND a lookup happens on 2024-04-15
- THEN the returned price is $1035
- AND a lookup on 2024-07-01 returns $1090
