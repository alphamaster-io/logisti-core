# manifests capability (proposed)

## Purpose

Inbound manifest reconciliation. Today's concrete need: Macau (EGL Cargo) emails a manifest of boxes shipped to HK; staff at HK receive the physical boxes and reconcile line-by-line. The same pattern generalises to other cross-border partners and to future carrier feeds.

## Requirements

### Requirement: Manifest header + lines

The system SHALL model `Manifest` with: `id`, `tenantId`, `sourcePartnerId` (FK to Agent of type `cross_border_partner`), `sourceReference`, `expectedAt`, `receivedAt?`, `status` (`uploaded` | `reconciling` | `closed`), audit fields. Lines (`ManifestLine`) carry: `senderName`, `consigneeCity`, `boxTypeCode`, `weight?`, `notes?`, `reconciledBoxId?` (FK to Box when matched).

### Requirement: Upload via file or API

The system SHALL accept manifests via `POST /api/v1/manifests` either with inline JSON lines or with a CSV upload (multipart). CSV columns SHALL be: `sender_name`, `consignee_city`, `box_size_code`, `weight_kg?`, `notes?`.

#### Scenario: CSV with 100 rows

- GIVEN a CSV with 100 rows uploaded by warehouse_admin
- WHEN POST `/api/v1/manifests` with the file
- THEN one Manifest with 100 ManifestLines is created
- AND status is `uploaded`

### Requirement: Reconciliation flow

The system SHALL accept `POST /api/v1/manifests/:id/reconcile` with `{ manifestLineId, boxNumber, weightActualKg? }`. The system SHALL:

1. Verify `boxNumber` is unused (not in any Box row yet)
2. Create a Box bound to a ServiceOrder of `mode = macau_intake` (creating the order if not yet exists for this manifest)
3. Link `ManifestLine.reconciledBoxId = Box.id`
4. Move the manifest to `reconciling`

#### Scenario: Reconciling a line

- GIVEN a manifest in `uploaded` with line L (`sender = "Maria S"`, `consignee_city = "Cebu"`, `box_size = JUMBO`)
- WHEN staff POSTs reconcile with `{ manifestLineId: L.id, boxNumber: "MAC-2024-0042" }`
- THEN a Box exists with number "MAC-2024-0042", boxTypeCode JUMBO, anchored to a ServiceOrder with `mode = macau_intake`
- AND L.reconciledBoxId = that Box.id
- AND manifest.status = `reconciling`

### Requirement: Discrepancy flagging

The system SHALL allow flagging a manifest line as `discrepancy_missing` (manifest expected but no physical box) or accepting a physical box not on the manifest via `POST /api/v1/manifests/:id/extra-boxes` (records the extra box and creates a follow-up task).

#### Scenario: Manifest says 100, only 99 arrived

- GIVEN 99 of 100 lines reconciled
- WHEN warehouse_admin marks the 100th line as `discrepancy_missing`
- THEN that line's status is recorded
- AND the manifest can transition to `closed` after the discrepancy review
- AND an audit row captures who marked it and when

### Requirement: Closing a manifest

The system SHALL allow `POST /api/v1/manifests/:id/close` (warehouse_admin) only when every line is either `reconciledBoxId IS NOT NULL` or `discrepancy_missing`. Once closed, no further reconciliations are accepted.

### Requirement: Permissions

The system SHALL gate reads behind `manifests.read` and mutations behind `manifests.manage`.

### Requirement: All reconciliations are audited

The system SHALL emit an audit row for every reconcile, extra-box, discrepancy-flag, and close action with `manifestId`, `manifestLineId?`, `boxId?`, `userId`, `requestId`.

### Requirement: Box numbering for macau_intake

The system SHALL allow the box number on `macau_intake` orders to be a free-form string (the manifest line ID, the EGL tracking number, or an internally assigned one). The numbering policy from `agents` (batch ranges) does NOT apply.
