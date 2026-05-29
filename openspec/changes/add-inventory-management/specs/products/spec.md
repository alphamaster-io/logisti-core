# products capability (proposed)

## Purpose
The catalog of items a tenant tracks. A `Product` is the logical item (e.g. "iPhone 15 Pro 256 GB Blue"); a `Sku` is the sellable variant a customer orders against; a `Batch` is an optional grouping for date-sensitive goods (expiry).

## Requirements

### Requirement: Products are tenant-scoped
The system SHALL enforce `(tenantId, code)` uniqueness on `products`. The system SHALL NOT allow cross-tenant product reads.

#### Scenario: Same product code in two tenants
- GIVEN tenants A and B
- WHEN A creates product `WIDGET-1`
- AND B creates product `WIDGET-1`
- THEN both succeed and are isolated

### Requirement: SKUs hang off a product
The system SHALL require every `Sku` to reference exactly one `Product`. `(tenantId, code)` SHALL be unique across SKUs.

#### Scenario: SKU references its product
- GIVEN a product P
- WHEN a SKU S is created with `productId = P.id`
- THEN `GET /api/v1/products/<P.id>` returns S in its `skus` array

### Requirement: Money fields are bigint minor units
The system SHALL store `listPrice` as bigint minor units in the tenant's base currency. Floats SHALL NOT be used.

#### Scenario: Price round-trips without precision loss
- GIVEN a price input of `199.99`
- WHEN the SKU is created
- THEN `listPrice = 19999` is stored
- AND `GET` returns `19999` plus the currency code

### Requirement: Soft delete
The system SHALL soft-delete products and SKUs via `deletedAt`. Soft-deleted rows SHALL be excluded from default queries.

### Requirement: Required permissions
The system SHALL gate writes behind `products.manage` and reads behind `products.read`.

#### Scenario: Driver cannot create products
- GIVEN a `driver` user
- WHEN they POST `/api/v1/products`
- THEN the response is 403
