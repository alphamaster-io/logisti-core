# Working with OpenSpec in this repo

This directory drives **spec-driven development** for LogistiCore. Before writing code for a new capability or a substantive change, propose it as an OpenSpec change. The proposal is reviewed and merged separately from the implementation — so what we said we'd build, what we built, and what the system actually does, are all traceable.

## Directory map

```
openspec/
├── project.md                  # what LogistiCore is — read first
├── AGENTS.md                   # this file
├── specs/                      # current capabilities (the "is" of the system)
│   ├── auth/spec.md
│   ├── rbac/spec.md
│   ├── tenancy/spec.md
│   ├── users/spec.md
│   ├── warehouse-structure/spec.md
│   ├── audit/spec.md
│   └── master-impersonation/spec.md
└── changes/                    # proposed changes (the "will be")
    └── add-inventory-management/
        ├── proposal.md         # why + scope
        ├── tasks.md            # ordered implementation checklist
        ├── design.md           # optional — for architecturally heavy changes
        └── specs/              # spec deltas for each capability touched
            ├── products/spec.md
            ├── inventory/spec.md
            ├── receiving/spec.md
            └── stock-movements/spec.md
```

## When to write a proposal

| Change type                                       | Proposal required? |
| ------------------------------------------------- | ------------------ |
| New capability (anything not already in `specs/`) | **Yes**            |
| Breaking change to an existing spec               | **Yes**            |
| Adding a behavior to an existing capability       | **Yes**            |
| Bug fix that doesn't change documented behavior   | No                 |
| Refactor with no observable change                | No                 |
| Docs / typos / tooling                            | No                 |

When in doubt: write a small proposal. The thirty minutes you spend writing it pays back in arguing-after-the-fact you avoided.

## Lifecycle of a change

```
1. propose      → create openspec/changes/<change-id>/
2. review       → PR review, scope debate happens here, not later
3. merge        → proposal lands on main; capabilities NOT yet updated
4. implement    → write the code; tasks.md is the checklist
5. archive      → on merge of the implementation PR:
                  • move the spec deltas into openspec/specs/
                  • move the change folder to openspec/changes/archive/<change-id>/
                  • the proposal becomes a permanent record of the decision
```

## Spec format

Each capability spec is a single `spec.md` with this skeleton:

```markdown
# <capability> capability

## Purpose

One paragraph: what does this capability do, and who benefits.

## Requirements

### Requirement: <short imperative name>

The system SHALL <observable behavior>.

#### Scenario: <descriptive name>

- GIVEN <preconditions>
- WHEN <trigger>
- THEN <expected outcome>

### Requirement: ...
```

Rules:

- **SHALL** = must, **SHOULD** = strongly recommended, **MAY** = optional
- Every Requirement has at least one Scenario (otherwise it can't be tested)
- Scenarios use Given/When/Then; keep them concrete enough to write a test from
- Specs describe behavior, never implementation. "The user gets a 401" not "the JwtAuthGuard throws"
- Cross-link by capability name in backticks (e.g. `audit`), not by file path

## Change proposal format

`proposal.md`:

```markdown
# <Title>

## Why

The business / engineering driver. Link to the project.md roadmap row.

## What changes

Bullet list of new behaviors, with `[+] Added`, `[~] Modified`, or `[-] Removed` markers.

## Impact

- Capabilities affected: ...
- Migration concerns: ...
- Backwards compatibility: ...

## Out of scope

Bullet list of things people might assume but aren't included.
```

`tasks.md`:

```markdown
# Implementation tasks

## 1. Database

- [ ] Add Product, SKU tables to schema.prisma
- [ ] Migration: 20260601000000_inventory

## 2. API

- [ ] Module: ProductsModule
      ...
```

`specs/<capability>/spec.md`: The proposed spec for the capability AFTER this change lands. Will be moved into `openspec/specs/` on archive.

## Naming

- Change folder ids: `kebab-case`, present tense, action-led. `add-inventory-management`, `remove-bcrypt-fallback`, `tighten-master-impersonation-audit`.
- Spec folders: `kebab-case` of the capability noun. `warehouse-structure`, `master-impersonation`.

## When you're an AI agent working on this repo

1. **Read `project.md` first.** It contains the non-negotiables. Don't propose anything that violates them.
2. **Browse `openspec/specs/`** before proposing. Most "new" ideas are already covered or contradict an existing rule.
3. **Write the proposal, get it reviewed, then code.** Don't write code first and reverse-engineer a proposal to fit.
4. **If you have to write code to validate the proposal, mark it `wip` and don't push.** Sketches stay local.
5. **On merge, archive the change.** Update the index in `project.md` if a phase status flipped.

## Tooling

The `openspec` CLI (Node.js, `npx openspec`) validates structure. CI runs it on every PR that touches `openspec/`. If you don't have it locally, manual review still works — the format is plain markdown.
