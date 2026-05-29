# Add inventory management (Phase 2)

## Why

Without inventory, LogistiCore can model warehouses but can't tell you what's in them. That blocks every revenue stream the platform was conceived for — storage charges, shipment creation, customer "where's my stuff" queries, cycle counts.

This change is **Phase 2** in `openspec/project.md`. It's the single highest-value next step.

The legacy ExSpeed audit identified manual stock counts and untraced movements as the top sources of shrinkage and dispute. The capabilities introduced here are scoped specifically to eliminate that.

## What changes

### New capabilities

- **[+] Added** `products` — SKU catalog (per tenant)
  - Product (logical item) + SKU (sellable variant) + Batch (optional, for date-sensitive goods)
  - Weight, volume, currency-aware list price (bigint minor units)
- **[+] Added** `inventory` — current stock-on-hand by bin
  - Materialised `bin_quantities` table updated only by stock movements (never directly)
  - Read endpoints scoped by branch + warehouse + zone + rack + bin
- **[+] Added** `receiving` — recording inbound goods
  - Receiving session → line items → putaway → bin assignment
  - `Idempotency-Key` mandatory on intake; legacy "operator double-clicked → two boxes" bug structurally impossible
- **[+] Added** `stock-movements` — event-sourced log of every quantity change
  - Movement types: receive, putaway, transfer, adjust, pick, dispatch (last two land in Phase 3)
  - Every movement is double-entry (from-bin / to-bin) so totals always reconcile

### Modified capabilities

- **[~] Modified** `warehouse-structure` — bins gain a `capacity` constraint that the inventory engine respects (rejects putaway exceeding capacity)
- **[~] Modified** `rbac` — the existing `products.*`, `inventory.*`, `receiving.*` permission keys (already in the seed) become **active** — endpoints are wired and require them

## Impact

**Capabilities affected**
- New: `products`, `inventory`, `receiving`, `stock-movements`
- Modified: `warehouse-structure`, `rbac`, `audit` (new entity types appear in the log)

**Migration concerns**
- Single migration adds 7 tables: `products`, `skus`, `batches`, `bin_quantities`, `stock_movements`, `receiving_sessions`, `receiving_lines`
- No data backfill needed — clean Phase 2 start; existing tenants begin with zero stock
- Indexes on `(tenantId, branchId, productId)` for stock queries and `(tenantId, createdAt)` for movement reports

**Backwards compatibility**
- No existing endpoint changes shape
- New permission keys are already in `packages/shared/src/rbac/permissions.ts` — no shared package version bump required
- Idempotency-Key middleware is already wired (Phase 1); receiving endpoints opt in

## Out of scope

- **Lots / serial numbers** — Batch is included but only for date-sensitive expiry; full serial tracking is a separate change
- **Reorder points / forecasting** — Phase 5
- **Costing methods (FIFO / LIFO / weighted avg)** — Phase 5; Phase 2 records movements but defers valuation
- **Returns / RMA** — separate change, after shipments (Phase 3) lands
- **Customer self-service intake** — the customer portal is Phase 4; Phase 2 receiving is operated by counter staff
- **Multi-currency price conversion** — list price is stored in tenant base currency; FX is Phase 5
- **Damage / write-off workflows** — covered by `inventory.adjust` initially; full damage workflow is a later change

## Success criteria

- A `warehouse_admin` can create a Product, then a SKU
- A `warehouse_staff` user receives a parcel (POST receiving session with Idempotency-Key), the system creates stock_movements + updates bin_quantities, and the audit log contains all the events
- `GET /api/v1/inventory?productId=...` returns the live count by bin within seconds of the receiving call
- An `inventory_manager` can adjust stock with a reason code, and the adjustment appears in the movement log
- Replaying the same Idempotency-Key returns the cached response and creates **no** new stock movements
- `pnpm typecheck && lint && test && build` all pass; new endpoints appear in Swagger
