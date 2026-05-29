# Implementation tasks — add cargo and shipments

Order matters; each numbered section should land in its own PR.

## 1. Schema & migrations

- [ ] Add `Shipment`, `ShipmentLine`, `ShipmentLeg` to `apps/api/prisma/schema.prisma`
- [ ] Add `Dispatch`, `DispatchLine`
- [ ] Add `TrackingEvent` (timestamp, geo, code, payload, recordedBy, requestId)
- [ ] Add `DeliveryProof` (1:1 with `ShipmentLeg`)
- [ ] Add `Vehicle` (per branch)
- [ ] Extend `User` with optional `driverPublicKey` (nullable)
- [ ] Composite indexes:
  - `(tenantId, status, branchId)` on shipments
  - `(shipmentId, createdAt)` on tracking events
  - `(driverId, dispatchedAt)` on dispatches
- [ ] Migration via `prisma migrate diff`; commit SQL

## 2. Shared package

- [ ] Zod schemas: `shipment.ts`, `dispatch.ts`, `trackingEvent.ts`, `deliveryProof.ts`
- [ ] Shipment number generator (URL-safe, opaque, monotonic per tenant) in `packages/shared/src/utils`
- [ ] Re-export from index; `shared build` clean

## 3. API modules

### 3a. Shipments

- [ ] `ShipmentsModule`
- [ ] `POST /api/v1/shipments` (draft); `PATCH` for line edits while `draft`
- [ ] `POST /api/v1/shipments/:id/ready` — reserves inventory; transitions to `ready`
- [ ] `POST /api/v1/shipments/:id/cancel` — releases reservation; transitions to `cancelled` (only from `draft`/`ready`)
- [ ] Idempotency-Key on `ready`, `cancel`
- [ ] Permissions: `shipments.create` / `shipments.read`

### 3b. Dispatch

- [ ] `DispatchModule`
- [ ] `GET /api/v1/dispatch/board?branchId=&date=` — ready shipments grouped by destination
- [ ] `POST /api/v1/dispatch` — body assigns shipments to driver+vehicle; emits `pick` + `dispatch` movements
- [ ] Idempotency-Key on `POST /dispatch`
- [ ] Stop ordering hint (front-end provides; API stores; no optimization)
- [ ] Permissions: `shipments.dispatch`

### 3c. Driver mobile API (subset, optimised for low bandwidth)

- [ ] `GET /api/v1/driver/me/dispatches/today` — driver's stops in order
- [ ] `POST /api/v1/driver/dispatch-lines/:id/arrive` — records `arrived` tracking event with GPS
- [ ] `POST /api/v1/driver/dispatch-lines/:id/deliver` — uploads POD via multipart; creates `DeliveryProof`; transitions shipment to `delivered`
- [ ] `POST /api/v1/driver/dispatch-lines/:id/fail` — records `failed_delivery` with reason code + reschedule date
- [ ] All driver writes require Idempotency-Key (client-supplied UUID per stop action) — protects against connection-drop retries
- [ ] Permissions: `shipments.deliver`

### 3d. Tracking (public + authenticated)

- [ ] `TrackingModule`
- [ ] `GET /api/v1/track/:number` — **public**, no auth, rate-limited (60 req/min/IP), returns only customer-visible events
- [ ] `GET /api/v1/shipments/:id/tracking` — authenticated, returns full audit-grade timeline
- [ ] Tracking event visibility flag (`public: bool`) on each event type
- [ ] Permissions: `shipments.read` for authenticated endpoint

### 3e. File uploads (POD photos)

- [ ] `POST /api/v1/uploads/signed-url` — issues a short-lived signed PUT URL into the tenant's bucket prefix
- [ ] Tenant prefix isolation in the bucket
- [ ] Image moderation hook (placeholder; future change)
- [ ] Permissions: `shipments.deliver`

## 4. Cross-cutting

- [ ] `StockMovementService` extended to record `pick` + `dispatch` movement types with shipmentId reference
- [ ] `InventoryService.read()` excludes reserved quantity by default; `?includeReserved=true` opt-in
- [ ] Reservation lifecycle service (`ready` → reserve; `cancel`/`dispatched` → release/consume)
- [ ] AuditInterceptor coverage: tracking events, POD uploads, dispatch creation
- [ ] Reuse Idempotency-Key middleware (Phase 1); add per-driver client-supplied UUID validation

## 5. Web (Phase 3 UI slice)

- [ ] `/shipments` — list + create + drill-down to lines
- [ ] `/dispatch` — daily board, drag-to-assign UX
- [ ] `/track/:number` — **public route**, served by Next.js without auth, fetches public tracking
- [ ] `/driver` — mobile-first PWA shell:
  - Stops list, tap-to-arrive, tap-to-deliver, camera capture, signature pad, offline queue (queue persists; sync logic ships fully in Phase 4)

## 6. Tests

- [ ] Unit: state machine transitions, reservation invariants, POD validation
- [ ] e2e: create → ready → dispatch → deliver → tracking timeline shows expected events
- [ ] e2e: cancel from `ready` releases reservation
- [ ] e2e: replayed driver-arrival idempotency
- [ ] Web Vitest: shipment form validation, dispatch board interaction

## 7. Docs

- [ ] Update `README.md` + `CLAUDE.md` phase status
- [ ] Flip `openspec/project.md` Phase 3 row → "shipped"
- [ ] Move this change to `openspec/changes/archive/`
- [ ] Promote spec-deltas into `openspec/specs/{shipments,dispatch,tracking,delivery}/`
