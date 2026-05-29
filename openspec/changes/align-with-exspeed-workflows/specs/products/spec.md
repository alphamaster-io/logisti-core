# products capability (delta — overrides Phase 2 proposal)

## Purpose

(Was: arbitrary SKU catalog.) Now: the platform tracks four product subtypes — **Box** (managed via `box-catalog`), **Accessory** (padlock, tape, storage bags), **TV** (separate pricelist), **OddSize** (by quotation). Generic Product/SKU as proposed in Phase 2 is no longer the primary model.

## Requirements

### Requirement: Product subtype is a first-class discriminator

The system SHALL store `Product.subtype` as an enum: `box` | `accessory` | `tv` | `odd_size`. Each subtype has a different set of required fields and a different price-lookup path.

#### Scenario: Subtype determines pricing path

- GIVEN a product with `subtype = box`
- WHEN looking up its price
- THEN the system uses `box-catalog`'s region+mode matrix
- AND for `subtype = accessory`, the flat HKD price applies
- AND for `subtype = tv`, the diagonal-inch bracket matrix applies

### Requirement: Box subtype links to BoxType

The system SHALL store `boxTypeId` on every `subtype = box` product. The boxTypeId references `box-catalog.BoxType` (e.g. KING, SUPER). Dimensions and loyalty point value are derived from the BoxType, not stored on the Product.

### Requirement: Accessory subtype is flat-priced

The system SHALL store `flatPrice`, `flatPriceCurrency` on `subtype = accessory` products. No region matrix. Default accessories seeded: PADLOCK, TAPE_CLEAR, STORAGE_BAG_S, STORAGE_BAG_M, STORAGE_BAG_L, STORAGE_BAG_LOGO.

### Requirement: TV subtype links to TvSizeBracket

The system SHALL store `tvSizeBracket` (enum: `25_29`, `30_34`, `35_42`, `43_50`, `51_64`) on `subtype = tv` products. Price lookup goes through `box-catalog.TvPrice`.

### Requirement: OddSize subtype requires quotation

The system SHALL store `quotedAmount`, `quotedCurrency`, `quotedAt`, `quotedByUserId` on `subtype = odd_size` products. Quotations have a 14-day validity; expired quotations SHALL block further use until re-quoted.

#### Scenario: Expired quotation

- GIVEN an OddSize product quoted 15 days ago
- WHEN staff tries to add it to a Service Order
- THEN the response is 409 with detail `"quotation expired; re-quote required"`

### Requirement: Tenant-scoped uniqueness on code

The system SHALL enforce `(tenantId, code)` uniqueness. Code SHALL be human-readable (`KING-BOX`, `PADLOCK-STD`, `TV-43-50`).

### Requirement: Soft delete

The system SHALL soft-delete via `deletedAt`. Soft-deleted products SHALL NOT appear in default reads.

### Requirement: Permissions

Reads SHALL require `products.read`. Mutations SHALL require `products.manage`. Quotation creation SHALL require a separate permission `products.quote` (granted to inventory_manager and warehouse_admin).

### Requirement: This replaces Phase 2's generic SKU model

The proposed Phase 2 `Product/Sku` separation is SUPERSEDED. The platform doesn't have free-form SKUs; it has Boxes + Accessories + TVs + OddSize quotations. The `add-inventory-management` change MUST be revised before implementation to match this delta.
