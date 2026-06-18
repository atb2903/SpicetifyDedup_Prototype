---
work_package_id: WP06
title: NEW-5 — remove orphaned RemovalErrorCode 'stalled' dead code
dependencies: []
requirement_refs:
- FR-012
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts for this feature were generated on main. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into main unless the human explicitly redirects the landing branch.
base_branch: kitty/mission-residual-review-findings-remediation-01KV7ZEA
base_commit: bd014fd7e410d050e22156101d25f543593945ce
created_at: '2026-06-18T15:55:21.550648+00:00'
subtasks:
- T012
phase: Phase 3 - Dead code
assignee: ''
agent: "claude:opus:implementer:implementer"
shell_pid: "45439"
history:
- timestamp: '2026-06-18T00:00:00Z'
  agent: system
  action: Prompt generated via /spec-kitty.tasks
authoritative_surface: src/domain/removal-errors
execution_mode: code_change
owned_files:
- src/domain/removal-errors.ts
- test/domain/removal-errors.test.ts
tags: []
---

# Work Package Prompt: WP06 — NEW-5 remove orphaned RemovalErrorCode 'stalled'

## Objective

Remove the orphaned `'stalled'` member from the `RemovalErrorCode` union
(`src/domain/removal-errors.ts:44`) and delete its stale JSDoc bullet
(`:34-37`) — FR-012.

Charter gates absolute on `main`: TDD (union assertion), 100% coverage, strict TS.

## Context

- **DECISION D-3 — do not conflate two different symbols.** Remove **only**
  `RemovalErrorCode.'stalled'`. Verified: there is **no producer** of
  `RemovalError('stalled')` anywhere in `src/` (it is dead code; the stall path was
  reworked to `RemovalOutcome.provenance: 'stalled'` in ADR-0019/0020).
- The live `RemovalOutcomeProvenance.'stalled'` (`removal-types.ts:91`), the FSM
  `case 'stalled'` (`detection-state.ts:326`), and the watchdog re-stamp
  (`detection-store.ts:611`) are **correct** and must be left untouched — different symbol.
- This WP is independent: it touches only `removal-errors.ts`, which no other WP owns,
  and the removal is type-only (no compile coupling to the store).
- Read: `src/domain/removal-errors.ts`, `src/domain/apply-removal-outcome.ts` (the
  `outcome-mismatch` throw — a surviving code), ADR-0018 (the detection-side analogue
  cleanup), ADR-0020 (typed provenance).

## Branch strategy

Planning/base `main`; merge target `main`. No dependencies.

Start command:

```bash
spec-kitty agent action implement WP06 --agent <name>
```

---

### T012 — Remove orphaned RemovalErrorCode 'stalled' (FR-012 / NEW-5)

**Purpose**: Delete the dead union member + stale JSDoc.

**Steps**:
1. Remove `'stalled'` from the `RemovalErrorCode` union (`:44`) and delete its JSDoc bullet (`:34-37`).
2. Do **not** touch `RemovalOutcomeProvenance.'stalled'` or any provenance handling (D-3).

**Validation (TDD)**: a type-level/exhaustiveness assertion that `RemovalErrorCode` has
exactly the four remaining codes (`malformed-result`, `outcome-mismatch`,
`executor-failed`, `host-unavailable`); `grep -R "RemovalError('stalled'" src` empty;
existing `isRemovalError` / code-handling tests green; full suite + strict typecheck pass.

---

## Definition of Done

- [ ] Subtask complete, test-first for the union assertion.
- [ ] `npx tsc --noEmit` clean; `npm run test:coverage` 100%, no skips; full suite green.
- [ ] `RemovalErrorCode` no longer has `'stalled'`; `RemovalOutcomeProvenance.'stalled'` untouched (D-3).
- [ ] WHEN DONE: commit in the worktree, then run the WP's spec-kitty completion commands — do not hand off mid-WP.

## Reviewer guidance

- Confirm NEW-5 touched **only** `RemovalErrorCode` — not the provenance union, FSM, or watchdog re-stamp (the classic conflation; D-3).
- Confirm no producer of `RemovalError('stalled')` existed (the removal is safe dead-code deletion).

## Activity Log

- (pending)
- 2026-06-18T15:55:22Z – claude:opus:implementer:implementer – shell_pid=45439 – Assigned agent via action command
- 2026-06-18T15:57:33Z – claude:opus:implementer:implementer – shell_pid=45439 – Ready for review: removed orphaned RemovalErrorCode 'stalled' + JSDoc; provenance/FSM untouched (D-3); no producer existed; gates green
