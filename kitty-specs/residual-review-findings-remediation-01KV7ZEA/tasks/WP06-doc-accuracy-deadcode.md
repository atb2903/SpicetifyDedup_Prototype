---
work_package_id: WP06
title: "NEW-3 + NEW-5 — applyTerminalOutcome JSDoc accuracy + remove orphaned RemovalErrorCode 'stalled'"
dependencies:
- WP05
requirement_refs:
- FR-011
- FR-012
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts for this feature were generated on main. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into main unless the human explicitly redirects the landing branch.
subtasks:
- T009
- T010
phase: Phase 3 - Docs & dead code
assignee: ''
agent: ''
shell_pid: ''
history:
- timestamp: '2026-06-18T00:00:00Z'
  agent: system
  action: Prompt generated via /spec-kitty.tasks
authoritative_surface: src/domain/removal-errors
execution_mode: code_change
owned_files:
- src/store/detection-store.ts
- src/domain/removal-errors.ts
- test/domain/removal-errors.test.ts
tags: []
---

# Work Package Prompt: WP06 — NEW-3 doc accuracy + NEW-5 dead-code removal

## Objective

1. **NEW-3 (FR-011):** Correct the false `applyTerminalOutcome` JSDoc invariant
   ("`removed` is empty in every synthesised case").
2. **NEW-5 (FR-012):** Remove the orphaned `'stalled'` member from the
   `RemovalErrorCode` union and its stale JSDoc.

Charter gates absolute on `main`: TDD where behavioural (none here — doc + dead
type), 100% coverage, strict TS.

## Context

- **NEW-3:** `detection-store.ts:535-539` claims `applyTerminalOutcome`'s outcome
  has empty `removed` in every case, so `applyRemovalOutcome` can't throw
  `outcome-mismatch`. False: the function is also the apply path for **host-success**
  (`:617`) and **stalled-partial** (`:611-612`) outcomes, both of which carry
  **non-empty** `removed`. Rewrite the JSDoc to describe those paths and give the
  true no-throw rationale: every removed key is a real member of `result` **by
  construction** (the executor only reports tracks it was asked to remove), so
  `applyRemovalOutcome` cannot throw `outcome-mismatch`.
- **NEW-5 — DECISION D-3 (do not conflate):** remove **only**
  `RemovalErrorCode.'stalled'` (`removal-errors.ts:44`) and its JSDoc bullet
  (`:34-37`). Verified: there is **no producer** of `RemovalError('stalled')`
  anywhere in `src/`. The live `RemovalOutcomeProvenance.'stalled'`
  (`removal-types.ts:91`), the FSM `case 'stalled'` (`detection-state.ts:326`), and
  the watchdog re-stamp (`detection-store.ts:611`) are **correct** and must be left
  untouched — they are a different symbol.
- Read: `src/store/detection-store.ts` (`applyTerminalOutcome` + its three callers),
  `src/domain/removal-errors.ts`, `src/domain/apply-removal-outcome.ts` (the
  `outcome-mismatch` throw), ADR-0018 (the detection-side analogue cleanup),
  ADR-0020 (typed provenance).

> **Sequencing**: depends on **WP05** (shared `detection-store.ts`).

## Branch strategy

Planning/base `main`; merge target `main`. Base includes WP05.

Start command (depends on WP05):

```bash
spec-kitty agent action implement WP06 --agent <name>
```

---

### T009 — Rewrite applyTerminalOutcome JSDoc (NEW-3)

**Purpose**: Documentation matches the real apply paths (FR-011).

**Steps**:
1. Replace the "empty in every synthesised case" claim with an accurate
   description: applies host-success, stalled-partial, executor-failed, and
   compute-failed outcomes; `removed` may be non-empty (host-success / stalled-partial).
2. State the true no-throw rationale (every removed key is a real member of
   `result` by construction).

**Validation**: doc-only — no test. `npx tsc --noEmit` clean; existing
`detection-store` tests stay green.

---

### T010 — Remove orphaned RemovalErrorCode 'stalled' (NEW-5)

**Purpose**: Delete dead union member + stale JSDoc (FR-012).

**Steps**:
1. Remove `'stalled'` from the `RemovalErrorCode` union (`:44`) and delete its
   JSDoc bullet (`:34-37`).
2. Do **not** touch `RemovalOutcomeProvenance.'stalled'` or any provenance handling (D-3).

**Validation (TDD)**: a type-level/exhaustiveness assertion that `RemovalErrorCode`
has exactly the four remaining codes; full suite + strict typecheck pass (proving
no reference to the removed member). Existing `isRemovalError` / code-handling tests
stay green.

---

## Definition of Done

- [ ] Both subtasks complete (T010 test-first for the union assertion).
- [ ] `npx tsc --noEmit` clean; `npm run test:coverage` 100%, no skips; full suite green.
- [ ] `applyTerminalOutcome` JSDoc accurately describes non-empty-`removed` paths and the by-construction no-throw rationale.
- [ ] `RemovalErrorCode` no longer has `'stalled'`; `RemovalOutcomeProvenance.'stalled'` untouched (D-3).
- [ ] WHEN DONE: commit in the worktree, then run the WP's spec-kitty completion commands — do not hand off mid-WP.

## Reviewer guidance

- Confirm NEW-5 touched **only** `RemovalErrorCode` — not the provenance union, FSM, or watchdog re-stamp (the classic conflation; D-3).
- Confirm the new JSDoc no longer claims empty `removed` and cites the by-construction reason.

## Activity Log

- (pending)
