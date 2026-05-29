# Design notes — add inventory management

## Why stock movements as events

Stock totals **derive from** movements. They aren't stored independently and updated. This keeps the model auditable end-to-end: any disagreement between `bin_quantities` and the sum of movements is a bug we can spot and fix from data alone.

```
StockMovement {
  id, tenantId, type, requestId
  productId, skuId, batchId?
  fromBinId?  ─┐
  toBinId?    ─┤  exactly one (receive: only toBinId; pick: only fromBinId; transfer: both)
  quantity    ─┘
  reason     // free text; required for adjust + write-off
  createdAt, createdBy
}
```

`bin_quantities` is a materialised projection updated inside the same DB transaction as the movement insert. We don't expose endpoints that mutate `bin_quantities` directly.

## Why Idempotency-Key is mandatory on receiving

The legacy "operator double-clicked → two boxes" bug came from a non-idempotent intake endpoint. The middleware that fixes this is already wired in Phase 1 — receiving just **requires** the header. Behavior:

- First call with key K: process, store `(K → 200 response, snapshot of movements created)` in Redis for 24h
- Replay with same K: serve cached response; **do not** create new movements
- Different payload, same K: respond 409 Conflict

## Capacity enforcement

`Bin.capacity` (from `warehouse-structure`) is the upper bound. Putaway computes the proposed bin total post-movement and rejects if it would exceed capacity. Capacity is enforced **at putaway**, not at receiving session creation — a session can be opened against an unknown final bin assignment.

## Adjustments require a reason

`POST /api/v1/inventory/adjustments` requires a non-empty `reason` field — every adjustment becomes a movement with `type=adjust` and the reason inlined. This makes shrinkage analysis trivial: filter movements by type + group by reason.

## Concurrency

Two operators putaway-ing the same SKU into different bins is fine — Postgres row-level locks on `bin_quantities (binId, skuId, batchId?)` serialise updates per bin. We use `SELECT ... FOR UPDATE` inside the movement transaction. No application-level locks.

## What we explicitly defer to a later change

| Topic | Why deferred |
|---|---|
| Lot / serial tracking beyond expiry batches | Phase 4 — needed for high-value cargo; current customers don't ask |
| Cycle count workflows | Captured as `inventory.adjust` for now; structured cycle count is a separate UX |
| Valuation (FIFO/LIFO/weighted) | Phase 5 — only matters once we report cost-of-goods |
| Damage / write-off | Use `adjust` with reason `damage` initially; structured workflow later |
| Multi-currency price conversion | Price stored in tenant base currency; FX is Phase 5 |
| Customer self-service receiving | Phase 4 — counter staff drives receiving in Phase 2 |
