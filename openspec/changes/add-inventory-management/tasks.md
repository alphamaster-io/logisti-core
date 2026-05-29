# Implementation tasks — add inventory management

Ordered for incremental landing. Each section should be its own PR if it keeps the diff manageable.

## 1. Schema & migrations

- [ ] Add `Product`, `Sku`, `Batch` models to `apps/api/prisma/schema.prisma`
- [ ] Add `BinQuantity` materialised table
- [ ] Add `StockMovement` event table (type, productId, skuId, batchId?, fromBinId?, toBinId?, quantity, reason, requestId)
- [ ] Add `ReceivingSession`, `ReceivingLine` tables
- [ ] Composite indexes: `(tenantId, productId)`, `(tenantId, branchId, productId)`, `(tenantId, createdAt)` on movements
- [ ] `prisma migrate diff` → commit migration SQL
- [ ] Update Prisma soft-delete middleware to cover the new tables

## 2. Shared package

- [ ] Zod schemas in `packages/shared/src/schemas/`:
  - [ ] `product.ts`, `sku.ts`, `receiving.ts`, `stockMovement.ts`
- [ ] Re-export from `packages/shared/src/index.ts`
- [ ] `pnpm --filter @logisti-core/shared build` clean

## 3. API modules

### 3a. Products
- [ ] `ProductsModule` with CRUD endpoints
- [ ] DTOs use class-validator; controller uses `@Permissions(PERMISSIONS.PRODUCTS_*)`
- [ ] Cursor pagination + `?q=` search
- [ ] Unit tests: validation, permission, soft-delete

### 3b. Receiving
- [ ] `ReceivingModule`
- [ ] `POST /api/v1/receiving/sessions` — start a session (warehouse_staff)
- [ ] `POST /api/v1/receiving/sessions/:id/lines` — add a line (requires `Idempotency-Key`)
- [ ] `POST /api/v1/receiving/sessions/:id/putaway` — assign lines to bins (creates stock_movements)
- [ ] Capacity check against `bin.capacity`; reject overage
- [ ] Idempotency middleware tested: replay returns cached response, no double movement

### 3c. Stock movements
- [ ] `StockMovementsModule` — read-only API
- [ ] `GET /api/v1/stock-movements` — cursor pagination, filter by product/branch/time
- [ ] All writes go through internal `StockMovementService.record()` — no direct controller writes
- [ ] Transactional: bin_quantities update + stock_movement insert in one Prisma transaction

### 3d. Inventory (view layer)
- [ ] `InventoryModule` — read-only
- [ ] `GET /api/v1/inventory?productId=&branchId=&warehouseId=` — bin-level breakdown
- [ ] `GET /api/v1/inventory/summary?productId=` — total per branch
- [ ] `POST /api/v1/inventory/adjustments` — inventory_manager only; reason required; creates a movement

## 4. Audit + RBAC integration

- [ ] Confirm AuditInterceptor records new entity types correctly (product, sku, receiving_session, stock_movement, inventory_adjustment)
- [ ] Verify the existing seeded role→permission map grants the right mix; no new permission keys needed (catalog is unchanged)

## 5. Web (Phase 2 UI slice)

- [ ] `/products` page — list + create + edit (warehouse_admin / inventory_manager)
- [ ] `/receiving` page — start session, add lines, putaway with bin picker
- [ ] `/inventory` page — drill-down product → branch → bin
- [ ] Optimistic invalidation via TanStack Query

## 6. Tests

- [ ] API unit: ProductsService CRUD, ReceivingService idempotency, StockMovementService invariants (no negative stock, no orphaned movements)
- [ ] API e2e: receive → putaway → query → adjust → audit chain
- [ ] Web Vitest: product create form validation

## 7. Docs

- [ ] Update `README.md` + `CLAUDE.md` phase status
- [ ] Update `openspec/project.md` roadmap row to "shipped"
- [ ] Move this change to `openspec/changes/archive/` and merge spec deltas into `openspec/specs/`
