# tracking capability (delta — modifies Phase 3 proposal)

## Purpose

(Was: public + authenticated tracking endpoints.) Now: acknowledges that current ops uses WhatsApp/Viber-driven tracking (the legacy flyer lists "Track your box via Viber +639318034260 / +639602508741"); the API endpoint exists today and the messaging integration is a deferred change.

## Requirements

### Requirement: Public tracking endpoint exists per Phase 3 proposal

The system SHALL expose `GET /api/v1/track/:shipmentNumber` per the original Phase 3 spec — unauthenticated, rate-limited, public-events only. No change here.

### Requirement: Tracking events reflect the new container-leg model

The system SHALL emit these public-visible event types corresponding to the ExSpeed workflow:

| Event type                      | Public?                         | When emitted                                        |
| ------------------------------- | ------------------------------- | --------------------------------------------------- |
| `intake_received`               | yes                             | At branch intake or agent / manifest reconciliation |
| `deposit_collected`             | yes                             | When the box_deposit PaymentLine is added           |
| `declaration_signed`            | yes                             | At Declaration sign                                 |
| `packed`                        | yes                             | Service Order → `packed`                            |
| `payment_received`              | yes                             | Each receipt (amount not shown publicly)            |
| `paid_in_full`                  | yes                             | Service Order → `paid_in_full`                      |
| `palletized`                    | yes                             | Box → Pallet                                        |
| `containerized`                 | yes                             | Pallet → Container                                  |
| `container_departed_origin`     | yes                             | Container departure                                 |
| `container_arrived_destination` | yes                             | Container arrival                                   |
| `customs_clearing`              | yes                             | Container in customs                                |
| `customs_released`              | yes                             | Container released                                  |
| `ph_warehouse_received`         | yes                             | PH-side branch_received                             |
| `out_for_delivery`              | yes                             | Driver picks up at PH branch                        |
| `delivered`                     | yes                             | POD captured                                        |
| `failed_delivery`               | yes (reason redacted)           | failed_delivery event                               |
| `pending_abandonment`           | yes                             | 60-day HK trigger                                   |
| `transferred_to_ph_warehouse`   | yes                             | Move to PH side                                     |
| `disposed`                      | yes (only the fact, not reason) | After 6-month PH no-claim                           |

### Requirement: Internal-only events

The system SHALL keep these internal (`public: false`):

- Identity of internal handlers (driver name, staff name) — show roles only publicly
- Recipient address details
- Specific failure-reason codes (publicly show "delivery attempted" not "address invalid")
- Agent commission deductions
- Loyalty stamp accruals

### Requirement: Messaging-integration tracking is a deferred change

The system SHALL NOT integrate with WhatsApp / Viber in Phase 3. The legacy flyer's "Track via Viber" model is delegated to a future `add-messaging-tracking` change. The API endpoint remains the canonical machine source.

#### Scenario: A future change adds Viber bot

- GIVEN this spec marks messaging integration as deferred
- WHEN a future change `add-messaging-tracking` is proposed
- THEN it builds on this tracking spec without re-defining event taxonomy

### Requirement: This refines Phase 3 with the concrete event taxonomy

The Phase 3 `add-cargo-shipments` proposal listed generic event types. This delta provides the concrete taxonomy. The Phase 3 implementation MUST emit exactly these event types in exactly these places.
