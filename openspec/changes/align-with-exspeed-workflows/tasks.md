# Implementation tasks — align with ExSpeed workflows

Spec-only change: no implementation code in this PR. Tasks below are the ordered next steps **after** this proposal lands.

## 0. Spec landing (this PR)

- [ ] Merge proposal + design + deltas
- [ ] Update `openspec/project.md` business description to reflect the ExSpeed model
- [ ] Mark the existing `add-inventory-management` (Phase 2) and `add-cargo-shipments` (Phase 3) proposals as "needs revision per `align-with-exspeed-workflows`" via a banner at the top of their `proposal.md` files in a follow-up PR

## 1. Revised Phase 2 proposal (`revise-inventory-for-exspeed`)

A separate change proposal that supersedes `add-inventory-management`. Includes:

- [ ] `box-catalog` spec (from this change, promoted to authoritative)
- [ ] `service-orders` spec (from this change, promoted to authoritative)
- [ ] `loyalty` spec (from this change)
- [ ] `payments-deposits` spec (from this change)
- [ ] `agents` spec (from this change)
- [ ] `manifests` spec (from this change)
- [ ] `declarations` spec (from this change)
- [ ] Refined `products` spec (from this change)
- [ ] Refined `receiving` spec (from this change)
- [ ] Refined `stock-movements` spec — adds `palletize` / `containerize` enum values

## 2. Revised Phase 3 proposal (`revise-shipments-for-exspeed`)

- [ ] `pallets-containers` spec (from this change, promoted to authoritative)
- [ ] Refined `shipments` spec (from this change — region zones, liability caps, lien, abandonment)
- [ ] Refined `tracking` spec (from this change — concrete event taxonomy)
- [ ] Driver mobile API unchanged from Phase 3 proposal

## 3. Permission catalog updates

Update `packages/shared/src/rbac/permissions.ts`:

- [ ] Add `service-orders.*` namespace (create, read, manage)
- [ ] Add `loyalty.*` namespace (read, manage, redeem)
- [ ] Add `payments.*` namespace (read, manage, adjust)
- [ ] Add `agents.*` namespace (read, manage)
- [ ] Add `manifests.*` namespace (read, manage)
- [ ] Add `declarations.*` namespace (read, manage)
- [ ] Add `box-catalog.*` namespace (read, manage)
- [ ] Add `containers.*` namespace (read, manage, seal)
- [ ] Add `agent` role to `ROLES`
- [ ] Update `ROLE_PERMISSIONS` for each new role + each role × namespace
- [ ] Update seed to insert the new permission keys

## 4. Schema parity infrastructure

The success criteria require Prisma ↔ Zod ↔ TS shape parity. Build the check:

- [ ] Add `packages/shared/src/schemas/<capability>/*.ts` (Zod) for each new capability
- [ ] Add a `apps/api/src/generated/parity-check.ts` that imports both the Prisma payload type and the Zod-inferred type and asserts mutual assignability for each top-level entity (ServiceOrder, Box, BoxType, Pallet, Container, LoyaltyCard, PaymentLine, ManifestLine, Declaration, Agent, RegionZoneMap)
- [ ] Make `pnpm --filter @logisti-core/api typecheck` fail if any parity assertion breaks

## 5. Database migration plan

To be split across multiple migrations (one per capability is ideal). High-level groups:

- [ ] Migration: `box-catalog` — BoxType, BoxPrice, Accessory, TvProduct, RegionZoneMap (seeded from this change's tables)
- [ ] Migration: `service-orders` — ServiceOrder, ServiceOrderEvent, StorageItem
- [ ] Migration: `boxes` — Box, BoxNumberBatch, BoxNumber
- [ ] Migration: `loyalty` — LoyaltyCard, LoyaltyStamp, LoyaltyRedemption
- [ ] Migration: `payments` — PaymentLine
- [ ] Migration: `agents` — Agent, Remittance
- [ ] Migration: `manifests` — Manifest, ManifestLine
- [ ] Migration: `declarations` — Declaration (with version chain), prohibited-items checklist as JSON
- [ ] Migration: `pallets-containers` — Pallet, Container, container_status_history
- [ ] Migration: `warehouse-structure-amendments` — adds `branchType`, `partnerName`, `partnerShopRef`, `partnerContactPhone`, `operatingHoursProfile`, `cashCurrency`

## 6. API implementation order

After all spec-revisions are merged:

- [ ] Implement `box-catalog` (foundational; everything else references it)
- [ ] Implement `service-orders` (the order entity must exist before payments/boxes/declarations)
- [ ] Implement `payments-deposits` (so service orders can hold balances)
- [ ] Implement `agents` + `BoxNumberBatch` (needed before agent_intake mode)
- [ ] Implement `receiving` per the 6 modes
- [ ] Implement `declarations` (signed at packing)
- [ ] Implement `loyalty` (accrual on `paid_in_full` transition)
- [ ] Implement `manifests` (last to land in Phase 2 — needs everything before)
- [ ] Implement `pallets-containers` (Phase 3 territory)
- [ ] Implement `shipments` deltas + the container-leg model
- [ ] Implement `tracking` event taxonomy
- [ ] Implement driver mobile + POD per Phase 3 proposal (unchanged)

## 7. Cron jobs needed

- [ ] Daily 00:00 HKT: `paid_storage_charge` emission for storage orders past day 121
- [ ] Daily 00:00 HKT: `overdue` transition + daily $5 charge for orders past day 14
- [ ] Daily 00:00 HKT: `pending_abandonment_hk` transition for orders past day 60
- [ ] Daily 00:00 PHT: `pending_disposal` flag for boxes in PH warehouse > 6 months
- [ ] Daily 00:00 HKT: `quote_expired` flag for OddSize products quoted > 14 days ago

## 8. Web (UI implementation order, follows API)

- [ ] `/box-catalog` (super_admin / pricing_manager): manage BoxType, BoxPrice, accessories, TV pricelist
- [ ] `/service-orders` — create order picker (mode), customer search, line builder
- [ ] `/service-orders/:id` — order detail, balance, declaration link, action buttons (collect deposit, pack, mark paid, cancel)
- [ ] `/declarations/:id` — declaration form with prohibited-items checkboxes + signature pad + PDF preview
- [ ] `/loyalty` — card lookup, balance, redemption flow
- [ ] `/agents` — agent list, batch issuance, remittance
- [ ] `/manifests` — upload CSV, line-by-line reconciliation UI
- [ ] `/pallets-containers` — pallet builder, container manifest export
- [ ] Public `/track/:number` page — Phase 3 unchanged
- [ ] Driver `/driver` PWA — Phase 3 unchanged

## 9. Tests

- [ ] Unit: state-machine transitions for ServiceOrder, payment computations, loyalty accrual on paid_in_full, agent commission deduction, region zone matching, oversize surcharge calculation
- [ ] e2e: full happy path — instant_pack from intake → declaration → payment → palletize → containerize → tracking timeline matches expected events
- [ ] e2e: agent_intake — pre-printed number consumption, consolidated payment, commission deduction
- [ ] e2e: macau_intake — manifest upload, reconciliation, box number assignment
- [ ] e2e: overdue cron path — packed → day 14 → overdue → daily charges → day 60 → pending_abandonment → transfer
- [ ] e2e: loyalty 75-stamps → KING redemption → card surrender
- [ ] e2e: declaration → required prohibited-items unchecked → blocked sign

## 10. Docs

- [ ] Update `openspec/project.md` with the ExSpeed-specific model
- [ ] Update `README.md` phase status to show "revised Phase 2 in flight"
- [ ] Update `CLAUDE.md` with the canonical glossary
- [ ] Move this proposal to `openspec/changes/archive/` only after both revised proposals (`revise-inventory-for-exspeed`, `revise-shipments-for-exspeed`) are merged and the spec deltas are promoted into `openspec/specs/`
