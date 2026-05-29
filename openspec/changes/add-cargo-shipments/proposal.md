# Add cargo and shipments (Phase 3)

## Why

Phase 2 puts stock _in_ the warehouse; Phase 3 gets it _out_, to a customer. That's the moment LogistiCore stops being a tracker and becomes a revenue engine — every delivered shipment is invoiceable.

The legacy ExSpeed business was specifically HK ↔ PH parcel forwarding. That flow — consolidate at origin, leg across, split at destination, last-mile to door — has to be modelled correctly here. It also has to support straightforward single-leg local delivery (a customer in Manila orders a box from the Manila warehouse), because the same code path serves both.

Three pain points the legacy app couldn't fix: drivers updating status by phone call, no proof of delivery audit, customers calling support for "where's my package". Phase 3 ends all three.

## What changes

### New capabilities

- **[+] Added** `shipments`
  - A `Shipment` is a contract to move N parcels from origin to destination on behalf of a consignor
  - States: `draft` → `ready` → `dispatched` → `in_transit` → `delivered` | `failed_delivery` | `cancelled`
  - Lines reference `Sku` + `quantity` (consumes inventory at `ready` → reserves, at `dispatched` → picks)
  - Multi-leg shipments: a parent shipment can have child legs (HK→consolidation hub, hub→MNL, MNL→door)
- **[+] Added** `dispatch`
  - Daily dispatch board for a branch: ready shipments grouped by destination, assigned to driver + vehicle
  - Dispatch event freezes the manifest and emits `pick` + `dispatch` movements (consumes Phase 2 inventory)
  - Route ordering hint (driver sees stops in order; full optimization is out of scope)
- **[+] Added** `tracking`
  - Every status change is a `TrackingEvent` (timestamped, geocoded if mobile, signed by the user who reported it)
  - Public read-only endpoint `GET /api/v1/track/:shipmentNumber` — no auth, rate-limited, used by customers
- **[+] Added** `delivery`
  - Proof of Delivery (POD): photo, signature, geo-coords, recipient name, notes
  - `delivered` only happens when POD is captured; no naked "marked delivered"
  - Failed-delivery flow: reason code + reschedule date + auto-tracking event

### Modified capabilities

- **[~] Modified** `stock-movements` — `pick` and `dispatch` types become **active** (Phase 2 reserved them but didn't emit)
- **[~] Modified** `inventory` — reservation semantics: stock in a `ready` shipment line is "reserved", not pickable for another shipment
- **[~] Modified** `users` — drivers gain a public-key field for signed mobile event submission (low-friction MFA for field staff)
- **[~] Modified** `rbac` — the existing `shipments.*` and `picking.*` permission keys become wired to endpoints

## Impact

**Capabilities affected**

- New: `shipments`, `dispatch`, `tracking`, `delivery`
- Modified: `stock-movements`, `inventory`, `users`, `rbac`

**Migration concerns**

- Adds tables: `shipments`, `shipment_lines`, `shipment_legs`, `dispatches`, `dispatch_lines`, `tracking_events`, `delivery_proofs`, `drivers` (extends `users` with driver-only fields), `vehicles`
- One additive migration; no backfill
- New indexes: `(tenantId, status, branchId)` on shipments for the dispatch board, `(shipmentId, createdAt)` on tracking events

**Backwards compatibility**

- `pick` / `dispatch` movement types were reserved in Phase 2 — wiring them now is non-breaking
- Reservation semantics modify Phase 2 `inventory.read` queries to exclude reserved quantity by default; an opt-in `?includeReserved=true` preserves the prior shape

**External integration**

- Customer tracking endpoint (`/api/v1/track/:number`) is unauthenticated and rate-limited; CORS opened only for the public tracking page
- Driver mobile uploads images (POD photos) — Phase 3 stores them in MinIO/GCS via signed-URL uploads

## Out of scope

- **Route optimization** — Phase 3 ships ordered stop hints; real optimization (TSP / time windows / capacity) is a later change
- **Carrier integrations** (LBC, J&T, SF Express) — operators are internal drivers only; carrier APIs are a later change
- **Customer self-service booking** — a customer can _track_ but not yet _book_ a shipment via API; booking lands with the customer portal (Phase 4)
- **Returns / RMA** — separate change after Phase 3 is stable
- **Customs declarations** — cross-border + duty handling is its own future change
- **Cash-on-delivery (COD)** — financial settlement at delivery is Phase 5 (billing)
- **Real-time map view** — tracking events update on a polling cadence here; live Socket.IO map is Phase 4
- **SLA / OTIF reporting** — Phase 5 (analytics)

## Success criteria

- A `dispatcher` can build a Shipment with lines drawn from current inventory, mark it `ready`, and the underlying Sku quantities are reserved
- A `dispatcher` can build today's Dispatch for HK-MAIN, assign Shipments to a Driver, and the manifest emits `pick` + `dispatch` movements that drain inventory consistently
- A `driver` opens their mobile route, sees today's stops in order, and on arrival captures POD (photo + signature + GPS) — only then does the shipment move to `delivered`
- A customer hits `GET /api/v1/track/<shipmentNumber>` without auth and sees the timeline of public-visible events
- Failed delivery records a reason, reschedules, and is auditable from the shipment timeline
- Replay protection: re-submitting a tracking event with the same client-side UUID is a no-op
- `pnpm typecheck && lint && test && build` all green; new endpoints in Swagger
