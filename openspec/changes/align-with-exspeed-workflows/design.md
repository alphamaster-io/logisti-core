# Design notes — align with ExSpeed workflows

## Domain glossary (canonical names)

| Term              | Definition                                                                                                                                                                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Box Type**      | Fixed-dimension carton SKU: King 24x24x41, Super 24x24x36, Jumbo 24x24x26, Regular 24x24x22, Medium 24x16x20, Small 24x14x15, Ex-Budget 12x12x14. Plus dynamic categories `oversize` (by quotation, $30/inch surcharge) and `odd_size` (by quotation). |
| **Box**           | A physical instance of a Box Type assigned to a customer. Has a unique number (system-generated or pre-printed agent batch).                                                                                                                           |
| **Service Order** | The customer-facing engagement: who, which mode, which boxes, deposit collected, balance due, payment status.                                                                                                                                          |
| **Service Mode**  | One of: `deliver_box`, `pick_up_box`, `instant_pack`, `storage`, `agent_intake`, `macau_intake`.                                                                                                                                                       |
| **Region Zone**   | PH delivery zone (5 zones today): `MNL_RIZAL`, `LUZON_A`, `LUZON_B`, `BICOL_VISAYAS`, `MINDANAO_ISLANDS`. Each Box Type has a different price per zone.                                                                                                |
| **Pallet**        | Physical aggregation of N boxes for container loading. Has a pallet number.                                                                                                                                                                            |
| **Container**     | Ocean container HK port → PH port. Holds 1..N pallets.                                                                                                                                                                                                 |
| **Manifest**      | Inbound document listing boxes coming from a partner (e.g. EGL Cargo Macau). Reconciled against actual pallet count.                                                                                                                                   |
| **Declaration**   | The Export Declaration & Packing List signed by sender per Service Order. Lists contents, asserts no prohibited items, captures liability scope.                                                                                                       |
| **Loyalty Card**  | Per-person account accruing stamps on full payment. Stamps redeem for free boxes at fixed thresholds.                                                                                                                                                  |
| **Agent**         | Partner outlet that intakes on behalf of ExSpeed. Pre-allocated batches of box numbers; commission deducted from consolidated payment.                                                                                                                 |

## The five intake modes side by side

| Mode           | Customer action                     | Where packed                             | Number assigned                                    | Deposit                          | Full payment due                                     | Special                                                                                         |
| -------------- | ----------------------------------- | ---------------------------------------- | -------------------------------------------------- | -------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `deliver_box`  | Schedules pickup; ExSpeed van comes | Customer's place                         | System-generated at receipt                        | HKD$50 min, no discount          | 14 days after pickup (else $5/day)                   | Schedule depends on pickup area                                                                 |
| `pick_up_box`  | Collects empty box from a branch    | Customer packs at home; returns it       | System-generated at intake                         | HKD$50 min, discount by box size | 14 days from intake                                  | "Discount depends on box size"                                                                  |
| `instant_pack` | Brings items to a branch            | Packed in-branch within the business day | System-generated at intake                         | Pays in full same day            | Same day                                             | "Discount depends on box size"                                                                  |
| `storage`      | Brings items to a branch            | Packed when customer is ready            | System-generated at intake                         | HKD$50 min storage deposit       | After packing (deducted from deposit if within 4 mo) | 4-month free storage; $5/day after; max 6 months HK + 6 months PH; pickup fee $30/item, $90 min |
| `agent_intake` | Through partner agent               | At agent location                        | Pre-printed batch (agent gets in advance)          | Per agent terms                  | Consolidated payment via agent                       | Agent commission deducted from consolidated payment                                             |
| `macau_intake` | Customer drops at Macau partner     | Macau partner packs/relays               | **None at intake** — assigned at HK reconciliation | MOP, Macau-side terms            | Macau-side handles                                   | Manifest emailed; HK reconciles pallet count; oversize $30 MOP/inch (not HKD)                   |

Each mode is a flag on `ServiceOrder.mode`. All modes converge to the same physical flow once the box hits the warehouse: pallet count → load to container → ship → PH split → final-mile delivery.

## Box Catalog

```
BoxType {
  id, code (KING, SUPER, JUMBO, REGULAR, MEDIUM, SMALL, EX_BUDGET, OVERSIZE, ODD)
  dimensions: { lengthIn, widthIn, heightIn }    // null for oversize/odd
  loyaltyPointsPerBox: int                       // 6/5/4/3/2/1/0/0/0
  liabilityCapCents: bigint, currency             // King = 25000 HKD; Budget = 10000
  isActive: bool
}

BoxPrice {
  boxTypeId, regionZone, currency, priceCents
  serviceMode?: enum                              // null = regular; or instant_pack / take_out_box discount
}
```

A second `BoxAccessory` catalog covers padlock (HKD$12), tape (HKD$7), storage bag S/M/L/Logo. A `TvProduct` catalog covers TVs with the diagonal-inch matrix. These are separate Product subtypes — a Service Order line item can be Box, Accessory, or TV.

## Service Order lifecycle

```
[draft]               counter staff opens; selects mode
  ├─► [deposit_collected]    HKD$50 deposit recorded (and pre-printed/system number assigned)
  │     ├─► [packed]              for instant_pack: same day. for others: customer brings/collects
  │     │     └─► [awaiting_full_payment]    14-day window starts
  │     │           ├─► [paid_in_full]
  │     │           │     └─► [in_warehouse → palletized → shipped → delivered]
  │     │           └─► [overdue]    $5/day storage starts; auto-flag
  │     │                 ├─► [paid_in_full]    (with arrears)
  │     │                 └─► [pending_abandonment]    60 days HK → moved to PH WH
  │     │                       └─► [abandoned]    6 months PH → disposed/donated
  │     └─► [stored]    for storage mode: 4-month free; then $5/day
  │           └─► [packing_scheduled → packed → ...]
  └─► [cancelled]    pre-pickup; deposit policy applies
```

A Service Order's status is a derived view of its Boxes (each box is at its own stage), plus the payment state. The **payment state** drives storage/abandonment timers; the **physical state** drives shipment readiness. We track them separately, then derive the order-level status.

## Box numbering policy

| Source                                                    | Format                                               | Generated when                                              |
| --------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------- |
| Direct customer (Deliver, Pick Up, Instant Pack, Storage) | System-generated, opaque URL-safe (≥80 bits entropy) | At intake — when the box is registered to the Service Order |
| Agent intake                                              | Pre-printed batch issued to agent in advance         | Agent stamps the number on intake; system records it        |
| Macau intake                                              | None at intake                                       | Assigned at HK reconciliation against the manifest          |

`pre-printed batch` is a `BoxNumberBatch` table — issued to an agent, range of pre-allocated numbers, status (`unused` / `used` / `void`). The agent can only consume numbers from their assigned batches.

## Pallets and containers

```
Box ─► Bin (Phase 2 warehouse-structure)
         ▼
       Pallet (created at "Input to pallet count")
         ▼
       Container (one ocean shipment per container)
         ▼
       Ocean leg (multi-leg shipment leg #2)
         ▼
       PH warehouse → final-mile shipment
```

A Pallet is a transient grouping. Its lifecycle is short: created at pallet-count, populated as boxes are loaded, sealed when full, loaded onto a Container. Stock movements at pallet level emit `palletize` / `containerize` types (Phase 2's stock-movements grows two more enum values).

A Container has: container number (carrier-issued), seal number, departure date, arrival date, vessel/voyage. The container is the boundary at which HK custody ends and PH custody begins.

## Manifest reconciliation

Per the workflow diagram and current ops: Macau's EGL Cargo emails a manifest of boxes shipped to HK. HK receives the physical boxes from port. Staff perform a line-by-line reconciliation:

1. Manifest row lists `senderName, recipientCity, boxSize, weight` (no box number)
2. Staff scans/inputs each physical box
3. System assigns a box number, links to the manifest row
4. Discrepancies (manifest row with no physical box, or vice versa) get flagged for follow-up

A `Manifest` entity has lines, a status (`uploaded` / `reconciling` / `closed`), and an audit of who reconciled what when. This pattern generalises to any inbound cross-border feed.

## Payments + deposits lifecycle

Two distinct money flows per Service Order:

| Flow                   | Mode                    | Trigger                                            | Amount                                                            |
| ---------------------- | ----------------------- | -------------------------------------------------- | ----------------------------------------------------------------- |
| **Box deposit**        | All except instant_pack | At intake                                          | HKD$50 min per box; full price if instant_pack (no deposit phase) |
| **Box balance**        | All                     | Within 14 days of pickup                           | Regular price − deposit − discounts − loyalty redemption          |
| **Storage deposit**    | storage mode            | At intake                                          | HKD$50 min                                                        |
| **Storage fee**        | All                     | After 14 days (overdue) or 4 months (storage mode) | HKD$5/day                                                         |
| **Storage pickup fee** | storage mode            | If customer wants stored items collected           | HKD$30/item, HKD$90 min                                           |
| **Oversize surcharge** | All                     | At box registration if oversized                   | HKD$60/inch (HK), MOP$30/inch (Macau)                             |
| **Agent commission**   | agent_intake            | At consolidated payment                            | Per agent terms, deducted from consolidated remittance            |

Each becomes a `PaymentLine` on the Service Order. We never store deltas — every charge is a positive line, every payment is a positive line, balance is sum-of-charges − sum-of-payments. Currency is per-line (a Macau intake produces MOP lines that later get HKD lines for the HK leg, etc.).

## Loyalty

```
LoyaltyCard {
  id, tenantId, customerId, issuedAt, currentStamps (computed),
  signeeName, signeeIdNumber, isActive, redemptionCount
}

LoyaltyStamp {
  id, cardId, sourceServiceOrderId, sourcePaymentId, boxTypeCode, stampsEarned, accruedAt
}

LoyaltyRedemption {
  id, cardId, freeBoxTypeCode, stampsConsumed, redeemedAt,
  redeemedAtServiceOrderId, redeemedAtBranchId, staffUserId, cardSurrendered: bool
}
```

Rules verbatim from the loyalty mechanics image:

- 1 card per person at a time
- Stamps only after **full** payment (so accrual fires off the payment-state transition `awaiting_full_payment → paid_in_full`, not at deposit)
- Stamps per box: K=6, SJ=5, J=4, R=3, M=2, S=1, EB=0
- Redeem at fixed thresholds: K=75, SJ=60, J=50, R=35, M=25, S=15
- Only the signee can redeem
- Non-transferable; only full-points cards count
- Card must be **physically presented** for redemption (digital wallet is a Phase 4 change)
- Card surrendered on redemption — `cardSurrendered: true` and `isActive: false` after

The ID verification is offline (staff checks ID against signee name + ID number). The system records `staffUserId` so any abuse is auditable.

## Declaration form fields

From the actual Packing List form, the declaration captures:

**Sender** (HK side): Surname, Given Name, M.I., I.D. Number, Contact No, Room/Flat/Floor, Building, Street, Road, District

**Receiver** (PH side): Surname, Given Name, M.I., Contact No, House/Block/Lot, Street, Barangay, Town, City, Province

**Boxes** (one row per box on order): Box type code (K/SJ/J/R/M/S/EB/O), Destination region, optionally oversize inches

**Contents** (per box, free-form): Quantity + Description

**Declarations** (signature-affirming): no prohibited items, contents are accurately described, deposit non-refundable, liability cap acknowledged ($250 King / $100 Budget), 60-day HK + 6-month PH abandonment policy acknowledged

**Office use** (HK side): Pickup date, branch/agent, box size & amount, penalty/oversize amount, discount type (instant/take-out box), No. of striped bags, deposit amount, collected by, accounting flag

**Office use** (PH side): Date arrived, cleared on, branch received date, condition (Original Seal / Custom Check / Re-seal / Others), Received by signature

The Declaration is **append-only and immutable once signed**. Corrections are new versions; the previous version remains as an audit record.

## Prohibited items policy

The Terms & Conditions list these as non-acceptable:

> Currency, Precious Metals, Fire Arms & Ammunitions, Explosives/Toys/Guns, Money Orders, Drugs, Traveler's Checks, Perishables, Negotiable Instruments in Bearer Form, Electrical Appliances, Lewd/Obscene/Pornographic Materials, Gambling Paraphernalia, Industrial Carbons and Diamonds, Communication Equipment and Computers

Plus a quantity check:

> Will not accept commercial goods (i.e., more than a dozen of any kind)

This becomes a **server-side validation at declaration submission**, with each banned category being a checkbox the sender ticks "I confirm none of these are in my shipment". The quantity rule fires a warning if any line's quantity > 12.

## Branches and partners

The branch list reveals reality:

- Some branches are owned (Main Office Worldwide House, To Kwa Wan)
- Many are **inside existing partner shops** — Liksang Plaza Shop 246, Tai Po Mee Wah Bldg, Tsuen Wan inside another shop building, etc.
- Some operate **limited hours** — Shatin is Sundays/holidays only
- Macau (EGL Cargo) is a cross-border partner — not a regular branch

Schema needs `branchType` (`owned` | `partner_shop` | `cross_border_partner`), `partnerName` (the host shop's name), `operatingHours` (typed: `regular_7d`, `weekend_only`, `mon_fri`, `custom_<json>`), and `currency` (the branch's primary cash currency — HKD for HK, MOP for Macau, PHP for PH).

## Currency reality

Three currencies are live across the value chain:

| Currency | Where it's used                                                                            |
| -------- | ------------------------------------------------------------------------------------------ |
| **HKD**  | HK intake, HK deposit, HK paid storage, HK oversize surcharge, HK accessories pricelist    |
| **MOP**  | Macau intake oversize surcharge (the price list explicitly says "HKD$60/inch (HK), MOP30") |
| **PHP**  | PH delivery pricing matrix, PH-side discounts (instant pack, take-out box)                 |

The rule: **every PaymentLine has a `currencyCode`**. The Service Order doesn't have a single currency — it has lines in HKD and lines in PHP that are settled separately (HK collects HKD; PH collects PHP). FX conversion is **not** done at booking; it's done at month-end reporting (Phase 5).

## Where this collides with the Phase 2 / Phase 3 proposals

| Prior proposal said                                   | Reality says                                                                                                                                               |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Products are arbitrary SKUs"                         | Products are mainly Box Types (7 fixed), plus a small Accessory catalog and a TV pricelist                                                                 |
| "Receiving is opening a session and adding lines"     | Receiving is the act of completing a Service Order against one of 5 modes; the data captured varies sharply by mode                                        |
| "Shipments have a generic destination"                | Destinations are 5 named PH zones with concrete pricing differences                                                                                        |
| "Stock-movements emit putaway/transfer/pick/dispatch" | Add `palletize` and `containerize` between putaway and dispatch                                                                                            |
| "Audit covers every mutation"                         | Add specifically: declaration signing event, manifest reconciliation event, loyalty redemption event                                                       |
| "Multi-leg shipments have generic legs"               | Legs are concrete: branch→HK warehouse, HK warehouse→Container, Container→PH port, PH port→PH warehouse, PH warehouse→destination zone, zone hub→consignee |

These contradictions resolve here, in this proposal, before code.

## What's intentionally still abstract

- The exact accessory catalog beyond padlock/tape/storage bag (will add when operations gives the full list)
- TV pricelist details (only 5 size brackets shown; will spec the full taxonomy when the rest is provided)
- Specific carrier integration shapes (Phase 3 still ships own-driver-only)
- Specific WhatsApp/Viber tracking protocol (Phase 4)
- The CRM-side customer record (Phase 4 customer portal)

## Schema alignment guarantee

The `success criteria` includes:

> Schemas across the application reflect the same shape: Prisma models match Zod schemas in `packages/shared` match TS types used by the web — verified at build time.

To honor this: every spec in this change defines its data model in Requirements (Prisma-ish field listing). The Phase 2 implementation PRs will:

1. Add the Prisma model
2. Generate Zod schemas in `packages/shared/src/schemas/<capability>/` matching field-for-field
3. The web's API client consumes those Zod schemas — no duplicate hand-written types
4. CI fails if `pnpm --filter @logisti-core/shared build` and the API's `prisma generate` produce mismatched shapes (we add a compile-time check that asserts the Zod schema is assignable from the Prisma type)
