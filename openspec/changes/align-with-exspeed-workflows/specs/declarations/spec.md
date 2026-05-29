# declarations capability (proposed)

## Purpose

The Export Declaration & Packing List that the customer signs. Records sender, consignee, contents per box, prohibited-item declaration, and acknowledgment of T&Cs (liability caps, abandonment, deposit non-refundable). Once signed, it is immutable — corrections are new versions.

## Requirements

### Requirement: Declaration fields per the form

The system SHALL store on a `Declaration`:

**Sender** (HK side): `senderSurname`, `senderGivenName`, `senderMiddleInitial`, `senderIdNumber`, `senderContactNumbers[]`, `senderAddress` (struct: `room/flat/floor`, `building`, `street`, `road`, `district`)

**Receiver** (PH side): `receiverSurname`, `receiverGivenName`, `receiverMiddleInitial`, `receiverContactNumbers[]`, `receiverAddress` (struct: `houseBlockLot`, `street`, `barangay`, `town`, `city`, `province`)

**Per-box contents**: `boxId`, `lines[]` of `{ quantity: int, description: string }`

**Prohibited-item declarations**: 14 explicit checkboxes (`noCurrency`, `noPreciousMetals`, `noFirearms`, `noExplosives`, `noMoneyOrders`, `noDrugs`, `noTravelersChecks`, `noPerishables`, `noNegotiableInstruments`, `noElectricalAppliances`, `noLewdMaterials`, `noGamblingParaphernalia`, `noIndustrialDiamonds`, `noCommunicationsEquipmentOrComputers`), each required `true`

**Commercial-goods warning**: `confirmsNotCommercialGoods` (no single line item > 12 units; or a warning is shown to staff)

**Acknowledgements**: `acknowledgesLiabilityCaps`, `acknowledgesDepositNonRefundable`, `acknowledgesAbandonmentPolicy`

**Signature**: `signedAt`, `signatureSvg`, `signatureCapturedAtBranchId`

**Office-use HK**: `pickupDate`, `intakeBranchId`, `agentId?`, `discountKind?` (`instant_pack` | `take_out_box` | none), `oversizeInches?`, `oversizeAmount?`, `depositAmount`, `depositCollectedByUserId`, `accountingFlaggedAt?`, `numberOfStripedBags?`

**Office-use PH** (filled at PH arrival): `phArrivedAt?`, `phClearedAt?`, `branchReceivedAt?`, `receivedCondition` (`original_seal` | `custom_check` | `re_seal` | `other_<text>`), `receivedByUserId?`

### Requirement: One declaration per Service Order

The system SHALL associate exactly one Declaration with a Service Order. The order transitions to `packed` only when the Declaration is `signed`.

#### Scenario: Pack without signed declaration

- GIVEN a Service Order with no signed Declaration
- WHEN staff POSTs `/api/v1/service-orders/:id/pack`
- THEN the response is 409 with detail `"signed declaration required"`

### Requirement: All 14 prohibited-item checkboxes must be true

The system SHALL refuse to sign a Declaration unless all 14 prohibited-item flags are `true`.

#### Scenario: One unchecked box

- GIVEN a Declaration with `noPerishables = false`
- WHEN the sender POSTs `/sign`
- THEN the response is 400 with detail `"all prohibited-item declarations must be confirmed"`

### Requirement: Quantity-warning fires at 12+

The system SHALL warn (not block) when any content line has `quantity > 12`. The warning SHALL appear in the response under `warnings[]`. If staff overrides with `acknowledgesCommercialGoodsRisk = true`, the Declaration may still be signed.

#### Scenario: 15 of one item

- GIVEN a content line with `quantity = 15, description = "men's t-shirts"`
- WHEN the sender attempts to sign
- THEN response includes `warnings: [ "commercial_goods_quantity_over_12" ]`
- AND the order cannot pack until `acknowledgesCommercialGoodsRisk = true`

### Requirement: Declaration is immutable after signing

The system SHALL refuse any `PATCH` or `DELETE` on a signed Declaration. Corrections SHALL create a new `Declaration` version with `previousVersionId` pointing at the prior one. The Service Order's `declarationId` SHALL move to the new version; the prior version SHALL remain queryable for audit.

#### Scenario: Customer realises a misspelled receiver name

- GIVEN signed Declaration D1
- WHEN they request a correction
- THEN a new Declaration D2 is created with `previousVersionId = D1.id`
- AND `serviceOrder.declarationId` is updated to D2.id
- AND D1 is unchanged in the database

### Requirement: Office-use PH section is filled by PH staff

The system SHALL gate the PH office-use fields behind `declarations.manage` AND a user whose `branch.type = owned` AND `branch.country = PH`. HK staff cannot fill the PH section.

### Requirement: Declaration PDF generation

The system SHALL expose `GET /api/v1/declarations/:id.pdf` returning a PDF that visually mirrors the legacy form (HK header, sender/receiver blocks, box codes, contents grid, declarations text, office-use sections). The PDF SHALL include the signature image and a tamper-evident hash of the Declaration's contents.

### Requirement: Permissions

The system SHALL gate Declaration reads behind `declarations.read`, mutations and signing behind `declarations.manage`.
