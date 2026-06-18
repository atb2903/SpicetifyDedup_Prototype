---
work_package_id: WP04
title: NEW-4 — compute-failed is a terminal, non-retryable outcome
dependencies: []
requirement_refs:
- FR-007
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts for this feature were generated on main. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into main unless the human explicitly redirects the landing branch.
base_branch: kitty/mission-residual-review-findings-remediation-01KV7ZEA
base_commit: bd014fd7e410d050e22156101d25f543593945ce
created_at: '2026-06-18T11:41:26.691249+00:00'
subtasks:
- T007
phase: Phase 2 - Removal resilience
assignee: ''
agent: "claude:opus:implementer:implementer"
shell_pid: "25853"
history:
- timestamp: '2026-06-18T00:00:00Z'
  agent: system
  action: Prompt generated via /spec-kitty.tasks
authoritative_surface: src/ui/RemovalOutcomeView
execution_mode: code_change
owned_files:
- src/ui/RemovalOutcomeView.tsx
- src/ui/RemoveDuplicatesButton.tsx
- test/ui/RemovalOutcomeView.test.tsx
- test/ui/RemoveDuplicatesButton.test.tsx
tags: []
---

# Work Package Prompt: WP04 — NEW-4 compute-failed terminal outcome

## Objective

A `compute-failed` removal outcome must present a **terminal** explanation and
must **not** offer a retry affordance that would deterministically fail
identically (FR-007).

Charter gates absolute on `main`: TDD, 100% coverage, strict TS.

## Context

- A `compute-failed` outcome (`computeRemoveSet` threw before any host call) maps
  to FSM phase `partial` (`detection-state.ts:325-328`), and `partial` re-enables
  the `removeRequest` retry (`detection-state.ts:239-244`). Retrying recomputes the
  same RemoveSet → another `compute-failed`: the dead-end.
- **Decision D-2 (fix at the view layer):** `RemovalOutcomeView` already branches
  on `outcome.provenance` (`RemovalOutcomeView.tsx:61-98`, `compute-failed` case at
  `:62`). Render a terminal explanation there and **suppress the retry control** for
  this provenance only. Leave the FSM mapping intact so the truthful count still
  renders; the *retry control*, not the phase, is what's withheld. (A distinct
  terminal FSM phase was considered and rejected — larger blast radius on `partial`
  handling shared by `stalled`/`executor-failed`.)
- `compute-failed` is "impossible by construction" (spec §6 assumption); FR-007 is
  a UX safety net, not a fix for a reachable defect. Route-reset remains the escape.
- Read: `src/ui/RemovalOutcomeView.tsx`, `src/domain/detection-state.ts`
  (`provenance → phase` map and `removeRequest` guard), ADR-0020 (typed provenance).

## Branch strategy

Planning/base `main`; merge target `main`. No dependencies.

Start command:

```bash
spec-kitty agent action implement WP04 --agent <name>
```

---

### T007 — Terminal, no-retry view branch for compute-failed

**Purpose**: Withhold the retry affordance for `compute-failed` (FR-007).

**Steps**:
1. In `RemovalOutcomeView`'s `compute-failed` case, render a terminal explanation
   and do **not** render the retry control.
2. Leave `stalled`, `executor-failed`, and `host`-partial branches with their retry
   path unchanged.

**Validation (TDD)**: a `compute-failed` outcome renders the terminal message and
**no** retry control (retry cannot be dispatched from this view). Regression: each
of `stalled` / `executor-failed` / `host`-partial still offers retry. Provenance
exhaustiveness (`_exhaustive: never`) preserved.

---

## Definition of Done

- [ ] Subtask complete, test-first.
- [ ] `npx tsc --noEmit` clean; `npm run test:coverage` 100%, no skips; full suite green.
- [ ] `compute-failed` shows a terminal message with no retry control; other provenances retain retry.
- [ ] FSM phase mapping unchanged (D-2); count still truthful.
- [ ] WHEN DONE: commit in the worktree, then run the WP's spec-kitty completion commands — do not hand off mid-WP.

## Reviewer guidance

- Confirm the retry suppression is scoped to `compute-failed` only (no regression for other provenances).
- Confirm the FSM was not forked into a new terminal phase (D-2 consistency).

## Activity Log

- (pending)
- 2026-06-18T11:41:27Z – claude:opus:implementer:implementer – shell_pid=25853 – Assigned agent via action command
- 2026-06-18T11:43:07Z – claude:opus:implementer:implementer – shell_pid=25853 – Blocked: ownership/scope conflict. WP04 owns only src/ui/RemovalOutcomeView.tsx, but the dispatchable retry control is RemoveDuplicatesButton (rendered by DetectionLoadedSummary.tsx, self-gated in RemoveDuplicatesButton.tsx) which reappears whenever removal.phase==='partial'. compute-failed maps to 'partial' (detection-state.ts removalAfterComplete), and D-2 mandates leaving that mapping intact, so the live retry button stays clickable. RemovalOutcomeView renders ONLY a text message (incl. the 'You can try again' phrase); it does not render or receive the retry button and cannot suppress it from within this file. To withhold the interactive retry control (FR-007/SC-004: 'no retry control') an UNOWNED file (DetectionLoadedSummary.tsx or RemoveDuplicatesButton.tsx) must change. Stopping per the WP prompt's escalation instruction rather than editing out of scope or weakening the gate to a text-only change. Need: expand WP04 ownership to include the button-gating file, or add a sibling WP.
- 2026-06-18T15:35:42Z – claude:opus:implementer:implementer – shell_pid=25853 – Ready for review: RemoveDuplicatesButton withholds retry for compute-failed (provenance-gated, FSM intact); RemovalOutcomeView compute-failed message terminal; gates green
