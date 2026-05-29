# agents capability (proposed)

## Purpose

Partner network. Agents intake on ExSpeed's behalf at remote locations, get issued pre-printed box-number batches, and earn a commission deducted from consolidated payments. Per the workflow diagram: "Order box stocks via call/portal" → "Agent client picks up box from agent" → "Agent client fills info via call/portal" → "Pickup consolidated client payments from agent (deduct agent comm)".

## Requirements

### Requirement: Agent is a first-class entity

The system SHALL model `Agent` with: `id`, `tenantId`, `name`, `code`, `branchId?` (anchor branch for reconciliation), `commissionPercent` OR `commissionPerBox`, `commissionCurrency`, `contactInfo`, `isActive`, audit fields.

#### Scenario: An agent is created

- GIVEN a `super_admin`
- WHEN they POST `/api/v1/agents` with `{ code: "AG-CW-001", name: "Causeway Bay Agent", commissionPercent: 5 }`
- THEN the agent is persisted with `isActive = true`

### Requirement: Agent receives pre-printed box-number batches

The system SHALL model `BoxNumberBatch` with: `id`, `tenantId`, `agentId`, `rangeStart`, `rangeEnd`, `issuedAt`, `issuedBy`, `numbersUsed` (computed), `status` (`issued` / `partially_used` / `exhausted` / `voided`).

#### Scenario: Issuing a batch

- GIVEN agent A
- WHEN a super_admin POSTs `/api/v1/agents/A.id/batches` with `{ count: 100 }`
- THEN one batch row is created with 100 consecutive box numbers
- AND each number is in a separate `BoxNumber` lookup table with `batchId = batch.id`, `status = unused`

### Requirement: Agent intake consumes from their batch only

The system SHALL refuse a box registration where `serviceOrderMode = agent_intake` and the provided box number is not in any of the agent's batches.

#### Scenario: Agent uses a number from another agent's batch

- GIVEN agent A with batch B1 (numbers 1000-1099)
- AND agent B with batch B2 (numbers 1100-1199)
- WHEN agent A tries to register box number 1150
- THEN the response is 400 with detail `"box number not in any of this agent's batches"`

### Requirement: Pre-printed numbers cannot collide

The system SHALL maintain a unique constraint on box numbers across all batches for a tenant. Issuing a batch with overlapping ranges SHALL fail at the application layer (not just at insert time) with a descriptive error.

### Requirement: Commission is deducted at consolidated payment

The system SHALL compute the agent's commission on each `received` PaymentLine from an `agent_intake` order: either `amount * commissionPercent` or `boxCount * commissionPerBox`. The system SHALL emit a corresponding `agent_commission` PaymentLine.

#### Scenario: Customer pays HKD$1000 through an agent

- GIVEN agent A with `commissionPercent = 5`
- WHEN a customer's HKD$1000 is recorded against the order
- THEN two PaymentLines are emitted: `received` HKD$1000 and `agent_commission` -HKD$50
- AND the agent's account balance increases by HKD$50

### Requirement: Agent account balance + remittance

The system SHALL expose `GET /api/v1/agents/:id/balance` returning the agent's cumulative commission owed minus remitted. A `POST /api/v1/agents/:id/remit` (super_admin) records remittance to the agent and zeros the balance.

#### Scenario: Reconciling at month-end

- GIVEN agent A with balance HKD$2500
- WHEN a super_admin POSTs `/api/v1/agents/A.id/remit` with `{ amount: 2500, reference: "BANK-...", remittedAt: "..."}`
- THEN the agent's balance becomes 0
- AND a `Remittance` row is created
- AND the action is audited

### Requirement: Agent user accounts

The system SHALL allow optionally creating a User account with role `agent` linked to an Agent (`User.agentId`). Agent-role users can read their own batches, register intakes against their own batches, and view their own balance — nothing else.

### Requirement: Permissions

The system SHALL gate agent CRUD behind `agents.manage`, agent reads behind `agents.read`, and self-service for agent users behind their natural scope (own data only — enforced by the existing tenant + entity-ownership checks).

### Requirement: Voiding a batch

The system SHALL allow voiding unused numbers in a batch via `POST /api/v1/agents/:id/batches/:batchId/void` (super_admin). Numbers already used SHALL remain valid; only `unused` numbers move to `voided` status.

#### Scenario: Agent loses pre-printed sheet

- GIVEN agent A with batch B with 30 unused numbers
- WHEN a super_admin voids B
- THEN all 30 unused numbers become `voided`
- AND any attempt to register an intake with a voided number fails 400
