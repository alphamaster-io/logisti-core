# loyalty capability (proposed)

## Purpose

The ExSpeed loyalty program: customers earn stamps per box on full payment, redeem at fixed thresholds for a free box of the matching size. Per the published mechanics, cards are physical, non-transferable, only the signee redeems, and the card is surrendered on redemption.

## Requirements

### Requirement: One active card per customer

The system SHALL allow at most one `LoyaltyCard` with `isActive = true` per `(tenantId, customerId)` (or per `(tenantId, signeeIdNumber)` for walk-in customers without an account).

#### Scenario: Customer requests a second active card

- GIVEN a customer with an active card
- WHEN staff tries to issue a new card to the same customer
- THEN the response is 409 with detail `"customer already has an active loyalty card"`

### Requirement: Cards carry signee identity

The system SHALL require `signeeName` and `signeeIdNumber` (free-text identifier of the customer's photo ID) on issuance. These SHALL be displayed at every redemption attempt for staff to verify.

### Requirement: Stamps accrue only on `paid_in_full` transition

The system SHALL emit `LoyaltyStamp` rows only when a Service Order transitions to `paid_in_full`. The number of stamps per box SHALL equal `boxType.loyaltyPointsPerBox` for each Box on the order.

#### Scenario: Two-box order pays in full

- GIVEN a Service Order with one KING (6 stamps) and one JUMBO (4 stamps)
- WHEN the order transitions to `paid_in_full`
- THEN 10 stamps are accrued to the customer's active card
- AND 2 `LoyaltyStamp` rows are created (one per box) linking back to the order

### Requirement: No stamps before full payment

The system SHALL NOT accrue stamps at deposit collection, packing, or partial payment.

#### Scenario: Overdue order pays only the base price

- GIVEN an overdue order with $5/day storage accrued
- WHEN the customer pays the box price but not the storage fee
- THEN no stamps are accrued (payment is partial, not paid_in_full)

### Requirement: Redemption thresholds are fixed per box type

The system SHALL allow redemption of a free box of size B if the card has at least `redemptionThreshold[B]` stamps. Thresholds: KING=75, SUPER=60, JUMBO=50, REGULAR=35, MEDIUM=25, SMALL=15. EX_BUDGET, OVERSIZE, ODD_SIZE are not redeemable.

#### Scenario: 75 stamps redeems a KING

- GIVEN a card with currentStamps = 75
- WHEN the signee redeems for a KING box on a new ServiceOrder
- THEN a free-box line is added at price 0
- AND the card's currentStamps becomes 0 (full surrender per the mechanics — "only cards with full points")
- AND the card transitions to `isActive = false` with `cardSurrendered = true`

### Requirement: Only signee may redeem; staff confirms

The system SHALL require staff to check a confirmation that they verified the signee's ID before allowing redemption. The check SHALL be recorded on the `LoyaltyRedemption` row.

#### Scenario: Staff misses the ID confirmation

- GIVEN a redemption request
- WHEN staff submits without ticking `signeeIdVerified: true`
- THEN the response is 400 with detail `"signee ID verification required"`
- AND no redemption is created

### Requirement: Cards are physical-presence-required (Phase 3)

The system SHALL require the redemption endpoint to record `cardPresentedAt = now` and `cardPresentedAtBranchId`. Digital wallet / NFC card is deferred to Phase 4.

### Requirement: Redemption is one-shot per card

The system SHALL refuse a second redemption on the same card. The card is `cardSurrendered = true` after the first redemption.

#### Scenario: Card with surrender flag rejected

- GIVEN a card with `cardSurrendered = true`
- WHEN a redemption is attempted
- THEN the response is 409 with detail `"card already surrendered"`

### Requirement: Card listing + balance lookup

The system SHALL expose `GET /api/v1/loyalty/cards` (gated by `loyalty.read`) and `GET /api/v1/loyalty/cards/:id/balance` returning `currentStamps`, eligibility list per box size, and history of accruals.

### Requirement: All loyalty actions are audited

The system SHALL record card issuance, every stamp accrual, every redemption, and every card invalidation in the `audit` capability. Redemption audit rows SHALL include `staffUserId`, `branchId`, `signeeIdVerified`.
