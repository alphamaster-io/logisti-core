# payments-deposits capability (proposed)

## Purpose

The money side of every Service Order. Captures the deposit-then-balance lifecycle, the auto-emitted paid-storage charges, oversize surcharges, agent commissions, and the 60-day HK + 6-month PH abandonment policy. Every charge is a positive line, every receipt is a positive line, balance is computed.

## Requirements

### Requirement: PaymentLine is the unit of money

The system SHALL model every money event as a `PaymentLine` with: `id`, `tenantId`, `serviceOrderId`, `boxId?`, `kind` (enum), `amount` (bigint minor units), `currencyCode`, `reason` (string), `accruedAt`, `recordedBy`. PaymentLines SHALL be append-only — corrections are new lines with `kind = correction` linking the original.

#### Scenario: A correction is a new line

- GIVEN an erroneous PaymentLine L
- WHEN staff issues a correction
- THEN a new line C is created with `kind = correction`, `amount = -L.amount`, `currencyCode = L.currencyCode`, `relatedLineId = L.id`
- AND L is unchanged

### Requirement: PaymentLine kinds

The system SHALL accept the following kinds:

| Kind                    | Sign                          | Notes                                             |
| ----------------------- | ----------------------------- | ------------------------------------------------- |
| `box_deposit`           | + (charge)                    | At intake; HKD$50 min                             |
| `box_balance`           | + (charge)                    | Box price - applicable discounts                  |
| `instant_pack_discount` | − (deduction)                 | Per box type, HK side                             |
| `take_out_box_discount` | − (deduction)                 | Per box type, HK side                             |
| `loyalty_redemption`    | − (deduction)                 | Free box value at redemption                      |
| `oversize_surcharge`    | + (charge)                    | $60/inch HKD or $30/inch MOP                      |
| `storage_deposit`       | + (charge)                    | Storage mode; HKD$50 min                          |
| `paid_storage_charge`   | + (charge)                    | $5/day after day 121 (storage) or day 14 (others) |
| `storage_pickup_fee`    | + (charge)                    | $30/item, $90 min for stored item pickup          |
| `agent_commission`      | − (deduction from remittance) | On agent_intake consolidated payments             |
| `received`              | − (receipt)                   | Customer payment; reduces balance                 |
| `bounced`               | + (reverses receipt)          | When a cheque bounces                             |
| `correction`            | ±                             | Manual correction; requires reason                |

### Requirement: Deposit-then-balance for non-instant-pack modes

The system SHALL require a `box_deposit` line on every Box for `mode != instant_pack` before the order can transition to `packed`. For `instant_pack`, full payment SHALL be required same day; no separate deposit.

#### Scenario: Cannot pack without deposit

- GIVEN a deliver_box order with no `box_deposit` line
- WHEN staff tries POST `/api/v1/service-orders/:id/pack`
- THEN the response is 409 with detail `"deposit required before packing"`

### Requirement: 14-day full-payment window

The system SHALL track `fullPaymentDueAt = packedAt + 14 days` for non-storage modes. At midnight `fullPaymentDueAt`, the order transitions to `overdue` and a daily `paid_storage_charge` of HKD$5 begins.

### Requirement: 4-month free storage + day-121 charge

The system SHALL track `storageBillableFromAt = storedAt + 121 days` for storage mode. From that timestamp, the daily cron SHALL emit a `paid_storage_charge` of HKD$5 each midnight HKT until the box is moved out of `stored`.

### Requirement: Storage deposit is credited on packing within 4 months

The system SHALL emit a `storage_deposit_credit` PaymentLine (kind = `correction`, negative amount equal to the deposit) when a storage-mode order is packed before `storageBillableFromAt`.

#### Scenario: Customer returns at day 100 to pack

- GIVEN a storage-mode order with `storage_deposit` of HKD$50, stored 100 days
- WHEN the order is packed
- THEN a new PaymentLine with `kind = correction, amount = -5000 (HKD$50), reason = "storage_deposit_credit"` is added
- AND the storage_deposit line itself is not modified

### Requirement: Oversize surcharge calculation

The system SHALL compute `oversize_surcharge` per box at intake as `max(0, longestDimensionIn - 41) * unitSurcharge`, where `unitSurcharge` is HKD$60 for HK-origin and MOP$30 for Macau-origin Service Orders.

### Requirement: Loyalty redemption produces a negative line

The system SHALL emit a `loyalty_redemption` PaymentLine with `amount = -(boxPrice)`, `currencyCode = boxPriceCurrency` when the customer redeems for a free box. The `relatedRedemptionId` SHALL link the line to the `LoyaltyRedemption` row.

### Requirement: Balance computation

The system SHALL expose `GET /api/v1/service-orders/:id/balance` returning balances grouped by currency: `[{ currency, totalCharges, totalReceipts, balanceDue }]`. The system SHALL NOT auto-convert across currencies — HK lines and PH lines are reported separately.

### Requirement: Bounced cheque follow-up

The system SHALL accept `POST /api/v1/service-orders/:id/payment-lines/:lineId/bounce` which emits a `bounced` line reversing the original receipt. From that moment, the order's full-payment grace clock is 7 days per the T&Cs (then `pending_abandonment`).

### Requirement: Permissions

The system SHALL gate read endpoints behind `payments.read` and mutating endpoints behind `payments.manage`. Bounce/correction operations SHALL require `payments.adjust` (separate, more privileged).

### Requirement: Idempotency-Key required on all mutating money endpoints

The system SHALL require Idempotency-Key on every endpoint that emits a PaymentLine. Replays SHALL be no-ops.

#### Scenario: Double-clicking "record payment" doesn't double-receipt

- GIVEN a customer paying HKD$500
- WHEN staff posts the receipt with key K
- AND the network drops; staff retries with key K
- THEN exactly one `received` PaymentLine exists with amount = HKD$500
