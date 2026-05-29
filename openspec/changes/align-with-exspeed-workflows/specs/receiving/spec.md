# receiving capability (delta — overrides Phase 2 proposal)

## Purpose

(Was: abstract "session opens, lines added, putaway happens".) Now: receiving is **the act of completing a Service Order** in one of 6 modes. Each mode has its own required intake fields.

## Requirements

### Requirement: Receiving is mode-driven

The system SHALL require the receiving endpoint to declare the `mode` and SHALL validate the payload against the mode's required field set:

| Mode           | Required intake fields                                                                 |
| -------------- | -------------------------------------------------------------------------------------- |
| `deliver_box`  | `pickupAddress`, `scheduledPickupAt`, `boxTypeCode`, `boxCount`                        |
| `pick_up_box`  | `boxTypeCode`, `boxCount`, `branchId`                                                  |
| `instant_pack` | `boxTypeCode`, `boxCount`, `branchId`, contents per box (forces immediate declaration) |
| `storage`      | `branchId`, items to store (line: description, weight/dim?), `storageReasonNote`       |
| `agent_intake` | `agentId`, `boxTypeCode`, `boxCount`, pre-printed `boxNumbers[]` from agent's batch    |
| `macau_intake` | `manifestId`, `manifestLineIds[]` (driven through `manifests`)                         |

#### Scenario: Missing pickup address on deliver_box

- GIVEN a `deliver_box` intake request without `pickupAddress`
- WHEN the endpoint is called
- THEN the response is 400 with detail `"pickupAddress required for deliver_box mode"`

### Requirement: Instant pack requires same-day completion

The system SHALL refuse to leave an `instant_pack` Service Order in `deposit_collected` state across midnight HKT. The cron SHALL flag any such order at 23:59 HKT and either auto-transition (if all required fields present) or alert the branch admin.

### Requirement: Storage intake creates a storage item, not a box (initially)

The system SHALL allow `storage`-mode receiving to record loose items (not yet packed into a box). A separate `packing_scheduled → packed` flow later converts items to boxes. Until packed, the boxes are not on the Service Order.

#### Scenario: Customer drops 4 storage items

- GIVEN a `storage`-mode ServiceOrder
- WHEN staff records 4 storage items
- THEN no Box rows are created
- AND 4 `StorageItem` rows are created against the ServiceOrder
- AND status moves from `deposit_collected` to `stored`

### Requirement: Agent intake consumes from batch

The system SHALL validate every `boxNumber` against the agent's batches (see `agents` capability). Invalid numbers SHALL fail the entire receiving call (atomic).

### Requirement: Macau intake feeds through manifest

The system SHALL allow `macau_intake` only via the `manifests` reconciliation flow. Direct receiving POSTs without `manifestId` SHALL fail with 400.

### Requirement: Box numbers assigned at receipt for direct modes

The system SHALL generate URL-safe opaque numbers (≥80 bits entropy) for `deliver_box`, `pick_up_box`, `instant_pack`, `storage` modes at the moment of receipt. The customer SHALL be given the number on the printed receipt.

### Requirement: Idempotency-Key required

The system SHALL require an `Idempotency-Key` on every receiving endpoint. Replays SHALL return the same response and SHALL NOT create new boxes, payments, or movements.

### Requirement: Bin assignment is per-branch policy

The system SHALL allow the branch's default-bin policy to assign newly-received boxes to a default holding bin (e.g. "INTAKE" bin). Putaway to a specific rack/bin happens later. This SUPERSEDES Phase 2's "putaway is part of receiving" model — they're now separate operations.

### Requirement: Permissions

The system SHALL gate receiving reads behind `receiving.read` and the receiving write per-mode:

- `deliver_box`, `pick_up_box`, `instant_pack`, `storage` → `receiving.manage` (warehouse_staff, warehouse_admin)
- `agent_intake` → `receiving.agent_intake` (granted to agent role) OR `receiving.manage` (super_admin)
- `macau_intake` → `receiving.manage` AND `manifests.manage`

### Requirement: This replaces Phase 2's generic receiving model

The Phase 2 "ReceivingSession with N lines and a putaway step" model is SUPERSEDED by the mode-driven receiving + separate putaway. The `add-inventory-management` change MUST be revised before implementation.
