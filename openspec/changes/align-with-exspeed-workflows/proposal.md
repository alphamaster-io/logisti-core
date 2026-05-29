# Align with ExSpeed business workflows

## Why

Phase 2 (`add-inventory-management`) and Phase 3 (`add-cargo-shipments`) were proposed against a **generic 3PL** mental model. The legacy ExSpeed business is more specific than that, and the proposed schemas would force operators into shapes that don't match how they actually work today. Source artifacts reviewed:

- HK Price List 20012024 — actual box catalog, regional pricing matrix (5 PH zones), accessories (padlock/tape/storage bag), TV pricelist, oversize surcharges
- HKG Packing List Terms & Conditions — abandonment policy, lien, claims window, prohibited items, liability caps per box size
- HKG Packing List P2 — the actual Export Declaration & Packing List form (sender/receiver fields, box code, branch+agent stamping, oversize accounting, deposit collection record)
- Workflow diagram — 5 client intake modes (Deliver Box / Pick Up Box / Instant Pack / Storage / Agent), Macau cross-border intake with manifest reconciliation, payment terms per mode
- Branch list — HK / Macau / PH locations; many HK branches are partner shop hosts (Liksang Plaza Shop 246, Tai Po Mee Wah Bldg, Sunday-only Shatin, etc.)
- Loyalty mechanics — stamps per box size, free-box redemption thresholds, physical-card-only redemption, signee-only

This change reconciles the proposed specs to that reality **before** any Phase 2/3 implementation code is written. Skipping this step would mean rewriting tables once operations tried to actually use the system.

## What changes

### New capabilities (additive)

- **[+] Added** `box-catalog` — Box is a first-class product type with fixed dimensions and a multi-zone price matrix
- **[+] Added** `service-orders` — The intake job: one ServiceOrder per customer engagement, mode-specific fields, deposit/full-payment lifecycle
- **[+] Added** `loyalty` — Loyalty cards, stamps accrual on full payment, free-box redemption thresholds per box size
- **[+] Added** `pallets-containers` — Aggregation hierarchy below Shipment: Bin → Pallet → Container → Ocean leg
- **[+] Added** `payments-deposits` — Deposit collection, full payment due windows, paid-storage triggers (4-month free + $5/day), abandonment thresholds (60 days HK, 6 months PH)
- **[+] Added** `agents` — Partner network with pre-printed box-number batches, commission accounting against consolidated payments
- **[+] Added** `manifests` — Inbound manifest reconciliation (Macau today; carrier feeds tomorrow)
- **[+] Added** `declarations` — Export Declaration & Packing List as a first-class entity with mandatory fields, prohibited-items checklist, sender's signature, oversize accounting

### Modified proposed capabilities (delta on Phase 2 + Phase 3 proposals)

- **[~] Modified** `products` (Phase 2) — Product subtype: `box` (managed via `box-catalog`), `accessory` (padlock, tape, storage bags), `tv` (separate price matrix), `oversize` (by quotation). Replaces the abstract Product/SKU model.
- **[~] Modified** `receiving` (Phase 2) — Receiving is the act of accepting goods against a ServiceOrder. The 5 service modes determine which fields are required.
- **[~] Modified** `shipments` (Phase 3) — Destinations are concrete PH regions (MNL/Rizal, Luzon A, Luzon B, Bicol/Visayas, Mindanao/Islands); liability is capped per box size ($250 King, $100 Budget); abandonment is automatic at 60 days HK / 6 months PH.
- **[~] Modified** `warehouse-structure` (Phase 1) — Branches gain `branchType` (`owned`, `partner_shop`, `cross_border_partner`) and operating-hours rules (e.g. Shatin: Sundays/holidays only).
- **[~] Modified** `tracking` (Phase 3) — Public tracking acknowledges WhatsApp/Viber-driven current ops; tracking-via-messaging integration is a deferred change.

### Project / repo-level

- **[~] Modified** `openspec/project.md` — Replaces the generic "WMS+TMS" description with the ExSpeed-specific business model (parcel forwarding, multi-zone PH delivery, B2B2C via agents)

## Impact

**Capabilities affected**

- New: 8 capabilities
- Modified (proposed): `products`, `receiving`, `shipments`
- Modified (live, Phase 1): `warehouse-structure`
- Modified (proposed): `tracking`

**Implementation impact**

- The Phase 2 PR (`add-inventory-management`) **cannot land as-is** — its products and receiving specs must be rewritten per this change before code is written.
- The Phase 3 PR (`add-cargo-shipments`) **needs delta** — destinations and liability are concrete, not abstract.
- 4 new permission key namespaces are needed and SHALL be added to `packages/shared/src/rbac/permissions.ts`: `service-orders.*`, `loyalty.*`, `agents.*`, `declarations.*`. Existing `payments.*`, `manifests.*` already absent from the catalog — add them too.

**Backwards compatibility**

- No live API surface is broken — Phase 1 only ships warehouse-structure-read + auth + users + RBAC + audit. The warehouse-structure delta adds an optional `branchType` field (default `owned`); existing reads are unaffected.

**Currency**

- Three live currencies confirmed: HKD (HK side), MOP (Macau partner — oversize surcharge differs), PHP (Philippines side). `bigint minor units + currencyCode` rule continues to apply; FX conversion is still deferred to Phase 5.

## Explicit deferrals (re-confirmed or new)

| Topic                                                                             | Status                                                                                                             |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Carrier integration (DHL/LBC/J&T/SF Express tracking poll)                        | Deferred — Phase 3 dispatches own drivers; agents and partners feed events manually                                |
| Customer-facing self-service portal (online booking + tracking dashboard)         | Phase 4                                                                                                            |
| WhatsApp / Viber tracking integration ("Track your box via Viber +639318034260…") | Deferred — current ops uses staff-answered messaging; integration is its own change                                |
| Cash on Delivery (COD) settlement                                                 | Phase 5                                                                                                            |
| FX conversion between HKD/MOP/PHP at invoice time                                 | Phase 5                                                                                                            |
| Customs declarations beyond Packing List/Export Declaration                       | Phase 5+                                                                                                           |
| Damage / loss claims workflow (15-day window, $250 King / $100 Budget caps)       | Designed in `declarations` spec; full workflow is a later change                                                   |
| Returns / RMA                                                                     | Post-Phase 3                                                                                                       |
| Loyalty card NFC / QR digital wallet                                              | Phase 4 (mobile features)                                                                                          |
| TV pricelist beyond a quotation-style line item                                   | Phase 2.1 — adds a TV product type but full TV intake (size diagonal validation, fragile-handling fee) is deferred |

## Success criteria

- A `warehouse_staff` user at HK Central can create a ServiceOrder for a customer choosing `pick_up_box` mode, collect HKD$50 deposit, register a King box from the pre-printed batch (or system-generated number), and the order appears as `awaiting_full_payment` with the 14-day timer running.
- An `agent` user can record an intake against their pre-printed batch, the system deducts agent commission from the consolidated payment, and the agent's account balance shows the running commission owed.
- A Macau intake arrives at HK port; the EGL Cargo manifest is uploaded; the staff reconcile pallet count line-by-line against the manifest; un-numbered boxes get system numbers at reconciliation time.
- A box accrues storage from day 0 (free); at day 121, the system auto-emits a `paid-storage` charge of HKD$5/day going forward; at day 60 without payment (HK), the box is auto-flagged for `pending_abandonment`; at 6 months in PH, disposal.
- A customer with a loyalty card with 75 King-stamps presents at any branch; the system verifies signee, marks the card `redeemed`, and issues a free King box at no charge in the ServiceOrder.
- The Export Declaration & Packing List for any shipment is downloadable as a PDF that includes sender/receiver, box codes, prohibited-item declaration, sender's signature placeholder, and the branch+agent stamping fields.
- Schemas across the application reflect the same shape: Prisma models match Zod schemas in `packages/shared` match TS types used by the web — verified at build time.

## Migration plan

1. **Merge this change first.** No Phase 2/3 code is written yet — this is cheap to land.
2. **Re-issue Phase 2 proposal** (`add-inventory-management`) as `revise-inventory-for-exspeed` referencing this alignment. Phase 2 spec deltas in `align-with-exspeed-workflows/` are the authoritative replacement.
3. **Re-issue Phase 3 proposal** (`add-cargo-shipments`) as `revise-shipments-for-exspeed` referencing this alignment.
4. **Implement in order**: box-catalog → service-orders → receiving → payments-deposits → loyalty → agents → manifests → declarations → pallets-containers → shipments (deltas) → tracking (deltas).
