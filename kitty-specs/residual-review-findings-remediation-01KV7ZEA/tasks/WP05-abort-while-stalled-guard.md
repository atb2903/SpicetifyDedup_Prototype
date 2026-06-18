---
work_package_id: WP05
title: "sibling/FR-008 — AbortError-while-stalled still dispatches a terminal outcome"
dependencies: []
requirement_refs:
- FR-008
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts for this feature were generated on main. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into main unless the human explicitly redirects the landing branch.
subtasks:
- T008
phase: Phase 2 - Removal resilience
assignee: ''
agent: ''
shell_pid: ''
history:
- timestamp: '2026-06-18T00:00:00Z'
  agent: system
  action: Prompt generated via /spec-kitty.tasks
authoritative_surface: src/store/detection-store
execution_mode: code_change
owned_files:
- src/store/detection-store.ts
- test/store/detection-store.test.ts
tags: []
---

# Work Package Prompt: WP05 — sibling/FR-008 abort-while-stalled guard

## Objective

If the executor **rejects** with an `AbortError` *after* the stall watchdog has
tripped (`stalled === true`), the store must still dispatch a terminal removal
outcome rather than swallowing the rejection and leaving the row stuck in
`removing` (FR-008).

Charter gates absolute on `main`: TDD, 100% coverage, strict TS.

## Context

- Defect site: `detection-store.ts:618-625` (`executeRemoveSet` catch). The catch
  swallows **all** `AbortError`s (`:621-622 return`). The `:620` comment asserts "a
  stall never lands here: the executor resolves, it does not reject" — but a
  defensive/alternative executor could reject with `AbortError` after the watchdog
  aborts, and then no `removeComplete` is dispatched → the row stays `removing`.
- The trip flag `stalled` is already in scope (`:589-593`). The resolve-path stall
  handling at `:608-613` re-stamps `provenance: 'stalled'`; mirror that intent on
  the reject path.
- Fix: in the catch, when `e` is an `AbortError` **and** `stalled === true`,
  dispatch a terminal `'stalled'` outcome (no host partial available on rejection,
  so e.g. `removed: []`, `failed: removeSet.tracks`, `provenance: 'stalled'`) via
  `applyTerminalOutcome`; a non-stalled `AbortError` (genuine user cancel/reset) is
  still swallowed. Correct the `:620` comment.
- Do **not** alter the watchdog ceiling, the resolve-path stall handling, or the
  `executor-failed` path. This WP is the reject-path analogue only.
- Read: `src/store/detection-store.ts` (`executeRemoveSet`, `applyTerminalOutcome`,
  `createStallWatchdog`), `src/domain/detection-state.ts` (`stalled → partial`),
  ADR-0019.

> **Sequencing**: WP05 → WP06 → WP07 all touch `detection-store.ts`; run them in
> order. WP05 is the first of the chain.

## Branch strategy

Planning/base `main`; merge target `main`. No dependencies (first in the store chain).

Start command:

```bash
spec-kitty agent action implement WP05 --agent <name>
```

---

### T008 — Defensive terminal dispatch on AbortError-while-stalled

**Purpose**: Guarantee a terminal outcome even if a stalled executor rejects (FR-008).

**Steps**:
1. In `executeRemoveSet`'s catch, branch the `AbortError` case on `stalled`: if
   stalled, apply a terminal `'stalled'` outcome via `applyTerminalOutcome`; else
   swallow (unchanged user-cancel behaviour).
2. Correct the `:620` comment to reflect that a stalled rejection is now handled.

**Validation (TDD)**: executor configured to **reject** with `AbortError` after the
watchdog trips → `removeComplete` dispatched; row leaves `removing` and lands
`partial`. Regression: a plain user-cancel `AbortError` (watchdog not tripped) is
still swallowed (row already moved to `idle`); the resolve-path stall handling
(`:608-613`) is unchanged.

---

## Definition of Done

- [ ] Subtask complete, test-first.
- [ ] `npx tsc --noEmit` clean; `npm run test:coverage` 100%, no skips; full suite green.
- [ ] Stalled-then-reject dispatches a terminal outcome; user-cancel abort still swallowed.
- [ ] No change to watchdog ceiling or resolve-path stall handling.
- [ ] WHEN DONE: commit in the worktree, then run the WP's spec-kitty completion commands — do not hand off mid-WP.

## Reviewer guidance

- Confirm only the `AbortError && stalled` sub-case changed; genuine user-cancel is still swallowed.
- Confirm the terminal outcome uses `provenance: 'stalled'` and reaches `partial` (the row's copies stay reachable — FR-003).

## Activity Log

- (pending)
