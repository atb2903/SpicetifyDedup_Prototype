---
work_package_id: WP07
title: "RISK-1 — honest termination docs (ADR-0019 + JSDoc) and faithful stall test"
dependencies:
- WP06
requirement_refs:
- FR-009
- FR-010
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts for this feature were generated on main. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into main unless the human explicitly redirects the landing branch.
subtasks:
- T011
- T012
phase: Phase 3 - Docs & dead code
assignee: ''
agent: ''
shell_pid: ''
history:
- timestamp: '2026-06-18T00:00:00Z'
  agent: system
  action: Prompt generated via /spec-kitty.tasks
authoritative_surface: test/integration/removal-termination
execution_mode: code_change
owned_files:
- .claude/adr/0019-per-batch-stall-watchdog-and-faithful-partial.md
- src/store/detection-store.ts
- src/adapters/fake-removal-executor.ts
- test/integration/removal-termination.test.ts
- test/adapters/fake-removal-executor.test.ts
tags: []
---

# Work Package Prompt: WP07 — RISK-1 honest termination docs + faithful stall test

## Objective

Resolve RISK-1 by **honest documentation + a faithful test**, not a behavioural
change (C-001 — no promise-race/timer-wins termination may be reintroduced):

1. **FR-009:** ADR-0019 and the watchdog/removal JSDoc accurately state that the
   abort takes effect only at **batch boundaries** and cannot interrupt an
   in-flight host call; remove any claim that a never-settling host call is
   guaranteed to terminate.
2. **FR-010:** Make the `hang` removal test double **non**-abort-aware so a
   never-settling host call is modelled truthfully, and rewrite
   `removal-termination.test.ts` to assert the real production behaviour (the row
   stays in `removing`; route-reset is the documented escape).

Charter gates absolute on `main`: TDD, 100% coverage, strict TS.

## Context

- The current `hang` fake resolves on abort (`fake-removal-executor.ts:225` and the
  hang path), which masks the real limitation: production cannot interrupt the
  in-flight host `await`. The stall test therefore over-claims termination.
- `createStallWatchdog` and `executeRemoveSet` live in `detection-store.ts`; their
  JSDoc must reflect the batch-boundary limit (FR-009). This is why WP07 depends on
  **WP06** (shared `detection-store.ts`).
- The accepted end-state: a genuinely never-settling host call leaves the row in
  `removing`; the only escape is route-reset (documented, low realistic probability
  per the 2026-06-13 live verification). Do **not** add a timer-wins race (C-001).
- Read: `.claude/adr/0019-per-batch-stall-watchdog-and-faithful-partial.md`,
  `src/adapters/fake-removal-executor.ts`, `test/integration/removal-termination.test.ts`,
  `src/store/detection-store.ts` (`createStallWatchdog`, `executeRemoveSet`), ADR-0017.

> **Sequencing**: depends on **WP06** (shared `detection-store.ts`); last in the
> store chain (WP05 → WP06 → WP07).

## Branch strategy

Planning/base `main`; merge target `main`. Base includes WP05 + WP06.

Start command (depends on WP06):

```bash
spec-kitty agent action implement WP07 --agent <name>
```

---

### T011 — Honest termination docs (ADR-0019 + watchdog/removal JSDoc)

**Purpose**: Docs match implemented behaviour (FR-009).

**Steps**:
1. Correct ADR-0019: state the abort takes effect only at batch boundaries and
   cannot interrupt an in-flight host await; remove any never-settling-terminates
   guarantee.
2. Align `createStallWatchdog` / `executeRemoveSet` JSDoc (`detection-store.ts`) with
   the batch-boundary limitation.

**Validation**: doc-only; `npx tsc --noEmit` clean; no behavioural change.

---

### T012 — Non-abort-aware `hang` fake + faithful termination test

**Purpose**: The stall test exercises real production behaviour (FR-010).

**Steps**:
1. Make the `hang` double in `fake-removal-executor.ts` **not** resolve on abort
   (model a never-settling host call).
2. Rewrite `removal-termination.test.ts` to assert: a never-settling host call
   leaves the row in `removing`; route-reset is the escape. Remove any assertion
   that the watchdog *terminates* the in-flight call. Keep watchdog/abort-path
   coverage at 100%.

**Validation (TDD)**: the rewritten test fails against the old abort-aware fake
(proving it now reflects production) and passes once the fake is non-abort-aware;
fake-removal-executor unit tests updated for the new `hang` semantics; gates green.

---

## Definition of Done

- [ ] Both subtasks complete; T012 test-first.
- [ ] `npx tsc --noEmit` clean; `npm run test:coverage` 100%, no skips; full suite green.
- [ ] ADR-0019 + JSDoc state the batch-boundary limit honestly; no termination guarantee for a never-settling call.
- [ ] `hang` fake is non-abort-aware; termination test asserts the row stays `removing` with route-reset as the escape.
- [ ] No promise-race / timer-wins mechanism introduced (C-001).
- [ ] WHEN DONE: commit in the worktree, then run the WP's spec-kitty completion commands — do not hand off mid-WP.

## Reviewer guidance

- Confirm **no** termination mechanism was added (C-001) — this is docs + test only.
- Confirm the `hang` fake no longer resolves on abort and the test would fail against the old fake (not a false-positive-only test).
- Confirm watchdog/abort coverage stays at 100% after the fake change.

## Activity Log

- (pending)
