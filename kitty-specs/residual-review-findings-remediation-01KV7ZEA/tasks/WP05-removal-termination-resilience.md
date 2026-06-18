---
work_package_id: WP05
title: Removal termination resilience + honest docs/test (FR-008/009/010/011)
dependencies: []
requirement_refs:
- FR-008
- FR-009
- FR-010
- FR-011
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts for this feature were generated on main. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into main unless the human explicitly redirects the landing branch.
base_branch: kitty/mission-residual-review-findings-remediation-01KV7ZEA
base_commit: bd014fd7e410d050e22156101d25f543593945ce
created_at: '2026-06-18T15:39:43.775727+00:00'
subtasks:
- T008
- T009
- T010
- T011
phase: Phase 2 - Removal resilience
assignee: ''
agent: "claude:opus:implementer:implementer"
shell_pid: "39259"
history:
- timestamp: '2026-06-18T00:00:00Z'
  agent: system
  action: Prompt generated via /spec-kitty.tasks
authoritative_surface: src/store/detection-store
execution_mode: code_change
owned_files:
- src/store/detection-store.ts
- .claude/adr/0019-per-batch-stall-watchdog-and-faithful-partial.md
- src/adapters/fake-removal-executor.ts
- test/store/detection-store.test.ts
- test/integration/removal-termination.test.ts
- test/adapters/fake-removal-executor.test.ts
tags: []
---

# Work Package Prompt: WP05 — Removal termination resilience + honest docs/test

## Objective

One atomic work package for everything that touches the removal **termination /
outcome-apply** path — all coupled through `src/store/detection-store.ts`:

- **FR-008 (sibling):** an `AbortError`-while-`stalled` still dispatches a terminal outcome.
- **FR-011 (NEW-3):** correct the false `applyTerminalOutcome` "removed is always empty" JSDoc.
- **FR-009 (RISK-1):** ADR-0019 + watchdog/`executeRemoveSet` JSDoc honestly state the batch-boundary abort limit.
- **FR-010 (RISK-1):** the `hang` fake is non-abort-aware and the termination test asserts real production behaviour.

This WP is necessarily larger because FR-008/009/011 are compile-/edit-coupled in
one hub file (spec-kitty one-file-per-WP ownership), and FR-010's test exercises
the same path — consistent with the prior mission's atomic-store-WP decision.

Charter gates absolute on `main`: TDD (failing test first for the behavioural
FR-008 change and the FR-010 test), 100% line/branch coverage, strict TS. **C-001:
no promise-race / timer-wins termination mechanism may be (re)introduced.**

## Context

- **FR-008 defect:** `detection-store.ts:618-625` (`executeRemoveSet` catch) swallows
  **all** `AbortError`s. The `:620` comment claims "a stall never lands here" — but a
  defensive executor could reject with `AbortError` after the watchdog aborts, and
  then no `removeComplete` is dispatched → the row stays stuck in `removing`. The
  trip flag `stalled` is in scope (`:589-593`); the resolve-path re-stamps
  `provenance: 'stalled'` at `:608-613`. Fix: in the catch, when `e` is `AbortError`
  **and** `stalled === true`, dispatch a terminal `'stalled'` outcome (no host partial
  on rejection, so e.g. `removed: []`, `failed: removeSet.tracks`, `provenance: 'stalled'`)
  via `applyTerminalOutcome`; a non-stalled `AbortError` (user cancel/reset) is still
  swallowed. Correct the `:620` comment.
- **FR-011 (NEW-3):** `applyTerminalOutcome` JSDoc (`:535-539`) falsely claims `removed`
  is empty in every synthesised case. It is also the apply path for **host-success**
  (`:617`) and **stalled-partial** (`:611-612`) outcomes — both with **non-empty**
  `removed`. Rewrite to describe those paths and the true no-throw rationale: every
  removed key is a real member of `result` **by construction**, so `applyRemovalOutcome`
  cannot throw `outcome-mismatch`.
- **FR-009 (RISK-1):** ADR-0019 and the `createStallWatchdog` / `executeRemoveSet` JSDoc
  must state the abort takes effect only at **batch boundaries** and cannot interrupt an
  in-flight host await; remove any "never-settling call is guaranteed to terminate" claim.
- **FR-010 (RISK-1):** make the `hang` double in `fake-removal-executor.ts` **not** resolve
  on abort (model a genuinely never-settling host call); rewrite `removal-termination.test.ts`
  to assert real behaviour (row stays `removing`; route-reset is the escape). Do **not**
  assert the watchdog terminates the in-flight call.
- Read: `src/store/detection-store.ts` (`executeRemoveSet`, `applyTerminalOutcome`,
  `createStallWatchdog`), `src/adapters/fake-removal-executor.ts`,
  `test/integration/removal-termination.test.ts`, ADR-0017/0019/0020,
  `src/domain/detection-state.ts` (`stalled → partial`).

## Branch strategy

Planning/base `main`; merge target `main`. No dependencies.

Start command:

```bash
spec-kitty agent action implement WP05 --agent <name>
```

---

### T008 — AbortError-while-stalled defensive terminal dispatch (FR-008)

**Purpose**: Guarantee a terminal outcome even if a stalled executor rejects.

**Steps**:
1. In `executeRemoveSet`'s catch, branch the `AbortError` case on `stalled`: if stalled,
   apply a terminal `'stalled'` outcome via `applyTerminalOutcome`; else swallow.
2. Correct the `:620` comment.

**Validation (TDD)**: executor rejects with `AbortError` after the watchdog trips →
`removeComplete` dispatched; row leaves `removing` → `partial`. Regression: plain
user-cancel `AbortError` (watchdog not tripped) still swallowed; resolve-path stall
handling (`:608-613`) unchanged.

---

### T009 — Rewrite applyTerminalOutcome JSDoc (FR-011 / NEW-3)

**Purpose**: Doc matches the real apply paths.

**Steps**:
1. Replace the "empty in every synthesised case" claim: it applies host-success,
   stalled-partial, executor-failed, and compute-failed outcomes; `removed` may be
   non-empty (host-success / stalled-partial).
2. State the by-construction no-throw rationale.

**Validation**: doc-only; `npx tsc --noEmit` clean; existing store tests green.

---

### T010 — Honest termination docs: ADR-0019 + watchdog/removal JSDoc (FR-009 / RISK-1)

**Purpose**: Docs state the batch-boundary limit; no termination guarantee.

**Steps**:
1. Correct ADR-0019: abort takes effect only at batch boundaries; cannot interrupt an
   in-flight host await; remove any never-settling-terminates claim.
2. Align `createStallWatchdog` / `executeRemoveSet` JSDoc with that limit.

**Validation**: doc-only; `npx tsc --noEmit` clean; no behavioural change.

---

### T011 — Non-abort-aware hang fake + faithful termination test (FR-010 / RISK-1)

**Purpose**: The stall test exercises real production behaviour.

**Steps**:
1. Make the `hang` double in `fake-removal-executor.ts` **not** resolve on abort.
2. Rewrite `removal-termination.test.ts`: a never-settling host call leaves the row in
   `removing`; route-reset is the escape. Remove any "watchdog terminates the call"
   assertion. Update `fake-removal-executor.test.ts` for the new `hang` semantics.

**Validation (TDD)**: the rewritten test fails against the old abort-aware fake and
passes once the fake is non-abort-aware; watchdog/abort-path coverage stays 100%.

---

## Definition of Done

- [ ] All four subtasks complete; T008 + T011 test-first.
- [ ] `npx tsc --noEmit` clean; `npm run test:coverage` 100% line/branch/func/stmt, no skips; full suite green.
- [ ] Stalled-then-reject dispatches a terminal outcome; user-cancel abort still swallowed.
- [ ] `applyTerminalOutcome` JSDoc accurate (non-empty-`removed` paths + by-construction no-throw).
- [ ] ADR-0019 + JSDoc state the batch-boundary limit; no never-settling termination guarantee.
- [ ] `hang` fake non-abort-aware; termination test asserts row stays `removing` (route-reset escape).
- [ ] **No promise-race / timer-wins mechanism introduced (C-001).**
- [ ] WHEN DONE: commit in the worktree, then run the WP's spec-kitty completion commands — do not hand off mid-WP.

## Reviewer guidance

- Confirm **no** termination mechanism was added (C-001) — FR-009/010 are docs + test only.
- Confirm the FR-008 change is scoped to the `AbortError && stalled` sub-case; genuine user-cancel still swallowed.
- Confirm the `hang` fake no longer resolves on abort and the test would fail against the old fake (not false-positive-only).
- Confirm the JSDoc no longer claims empty `removed` and cites the by-construction reason.
- Confirm watchdog/abort coverage stays 100% after the fake change.

## Activity Log

- (pending)
- 2026-06-18T15:39:44Z – claude:opus:implementer:implementer – shell_pid=39259 – Assigned agent via action command
- 2026-06-18T15:51:20Z – claude:opus:implementer:implementer – shell_pid=39259 – Ready for review: abort-while-stalled terminal dispatch (FR-008); applyTerminalOutcome JSDoc accurate (FR-011); ADR-0019+watchdog/executeRemoveSet JSDoc state batch-boundary limit (FR-009); non-abort-aware hang fake + cooperative stall-resolve script + faithful termination test that fails against old fake (FR-010); no termination mechanism added (C-001); tsc clean, 100% coverage, architecture green
