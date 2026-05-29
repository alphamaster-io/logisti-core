# Design notes — add cargo and shipments

## State machine

```
draft ─┬─► ready ─┬─► dispatched ─► in_transit ─┬─► delivered
       │          │                              ├─► failed_delivery ─► ready (reschedule) ──┐
       └─► cancelled (from draft or ready)       └─► cancelled                                 │
                                                                                              └─► back into the loop
```

Transitions are validated server-side. Illegal transitions return 409 with the current state in the problem document. No "set status directly" endpoint exists.

## Inventory reservation, not double-allocation

Phase 2 had no notion of "stock that's allocated but still physically in a bin". Phase 3 needs it. We add it as a thin overlay:

- A `shipment_lines` row with `status = ready` increments a per-`(skuId, branchId)` reserved counter
- `inventory` read endpoints subtract reserved-but-not-yet-picked from available by default
- Dispatch is the moment `pick` movements consume the reservation; the counter decrements as the movement increments physical movement

This avoids a separate "stock_reservations" table — reservation is just a derived view over shipment line status. Simpler to reason about, harder to drift.

If a Shipment is cancelled while `ready`, the reservation counter decrements; cancel after `dispatched` is illegal (the inventory has already moved).

## Multi-leg shipments

A single Shipment for "HK customer → MNL recipient" has three legs:

1. HK warehouse → HK consolidation hub (truck)
2. HK hub → MNL hub (sea or air freight, **external carrier**)
3. MNL hub → recipient door (truck)

Phase 3 models legs as child rows under the parent shipment. Leg 2 is initially a placeholder — operator updates it manually with carrier tracking number + ETA. Carrier integrations (auto-poll DHL etc.) are deferred.

Status on the parent shipment is "the worst of all leg statuses" — if any leg fails, the parent reflects failed_delivery; the parent is `delivered` only when all legs are `delivered`.

For local single-leg shipments, only one leg row is created — same code path.

## Driver mobile + offline

Phase 3's driver UI is a PWA but ships **without** a full offline queue (that's Phase 4). What Phase 3 does ship:

- Idempotency-Key per stop action using a client-supplied UUID
- Optimistic UI on arrive/deliver — UX feels instant even on bad signal
- A small retry queue in memory — if a POST fails, the app retries with backoff; surfaces a warning if it can't sync in 30s

Phase 4 replaces that with the IndexedDB-backed queue that survives app restarts.

## Proof of Delivery — what's mandatory

- Photo (camera direct, no gallery picker — prevents POD fraud via saved images)
- Signature (touch input on the canvas)
- GPS coords (HTML5 Geolocation; if denied, recorded as `"NOT_GRANTED"` and flagged)
- Recipient name (free text)
- Optional notes

The endpoint is the **only** path from `in_transit` to `delivered`. There's no admin override that skips POD; if a driver legitimately can't capture POD (recipient absent), they record `failed_delivery` instead.

## Public tracking endpoint

`GET /api/v1/track/:number` is unauthenticated. To prevent enumeration of shipment numbers:

- Numbers are URL-safe random (not sequential) — guessing one is infeasible
- Per-IP rate limit: 60 req/min, returns 429 with retry-after
- Response only includes events flagged `public = true` (we don't leak internal handoffs, who picked it up, internal failure reasons)
- No PII: recipient name/address shown only when caller is authenticated with `shipments.read`

## Idempotency for drivers

Drivers operate on flaky connections. Every driver-mobile endpoint requires an `Idempotency-Key` header (client-generated UUID). The Phase 1 middleware caches `key → response` for 24h. A retry from the same driver with the same key produces:

- Same response, no new tracking event, no new POD, no new movement

Different payload with same key: 409 Conflict — protects against a driver mistakenly reusing a UUID across different stops.

## What we explicitly defer

| Topic                                                    | Why deferred                                                                                                                   |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Route optimization (TSP, time windows, vehicle capacity) | Real OR problem — solving it is its own product. Phase 3 takes the ordered hint the dispatcher provides.                       |
| Carrier integrations                                     | Each carrier is its own API + SLA + on-call burden. Phase 3 dispatches its own drivers; partner integration is a later change. |
| Customer-facing booking API                              | Phase 4's customer portal. Booking touches identity, billing, and SLA — needs Phases 4+5 first.                                |
| Returns / RMA                                            | Workflow needs reverse logistics modelling; do once forward shipments are stable.                                              |
| SLA reporting (OTIF, dwell)                              | Phase 5 (analytics).                                                                                                           |
| Real-time map view (Socket.IO)                           | Phase 4 — needs the websocket infra. Phase 3 polls.                                                                            |
| Cash-on-delivery settlement                              | Phase 5 (billing).                                                                                                             |
| Customs declarations / duty calculation                  | Cross-border vertical; later change with its own legal review.                                                                 |
