---
work_package_id: WP03
title: "NEW-2 — per-track fallback abort check + per-track progress"
dependencies: []
requirement_refs:
- FR-005
- FR-006
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts for this feature were generated on main. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into main unless the human explicitly redirects the landing branch.
subtasks:
- T005
- T006
phase: Phase 2 - Removal resilience
assignee: ''
agent: ''
shell_pid: ''
history:
- timestamp: '2026-06-18T00:00:00Z'
  agent: system
  action: Prompt generated via /spec-kitty.tasks
authoritative_surface: src/adapters/spicetify-removal-executor
execution_mode: code_change
owned_files:
- src/adapters/spicetify-removal-executor.ts
- test/adapters/spicetify-removal-executor.test.ts
tags: []
---

# Work Package Prompt: WP03 — NEW-2 fallback hardening

## Objective

Make the per-track fallback loop (run after a rejected bulk batch) abort-aware
and progress-emitting: check the abort signal **between** per-track retries and
stop issuing further single-track host deletions once aborted (FR-005); emit a
removal-progress event **per track** so the store's stall watchdog re-arms on
genuine progress (FR-006).

Charter gates absolute on `main`: TDD, 100% coverage, strict TS.

## Context

- Defect site: `spicetify-removal-executor.ts:191-200`. The fallback loop retries
  each track of a rejected batch individually but (a) never checks `signal.aborted`
  inside the loop — only at batch boundaries (`:172`), so a 100-track batch retries
  all 100 even after abort; (b) only fires `onProgress` once per batch (`:206`), so
  a long fallback looks stalled to the store watchdog.
- **Decision D-4:** reuse the existing `RemovalProgressEvent = { removedSoFar, total }`
  (`removal-types.ts:134-139`) for per-track progress — no new event variant.
- **RISK-1 limit (accepted, documented):** the single in-flight host await
  (`dispatchBatch` for one track) still cannot be interrupted; abort-responsiveness
  is *between* retries only. Assert this honestly; do not engineer around it (C-001).
- On abort mid-fallback, return the accumulated host-truthful partial (consistent
  with the batch-boundary abort at `:172-174`).
- Update the JSDoc that currently claims the fallback always runs to the batch end
  (`:18-19`, `:134-136`, `:203-206`).
- Read: `src/adapters/spicetify-removal-executor.ts`, `src/domain/removal-types.ts`,
  ADR-0019 (stall watchdog / faithful partial), ADR-0017 (hang root cause).

## Branch strategy

Planning/base `main`; merge target `main`. No dependencies.

Start command:

```bash
spec-kitty agent action implement WP03 --agent <name>
```

---

### T005 — Abort check between per-track retries

**Purpose**: Stop issuing per-track deletions promptly on abort (FR-005).

**Steps**:
1. In the fallback `for (const track of batch)` loop, check `signal.aborted` before
   each single-track `dispatchBatch`; on abort, break out and return the accumulated
   `{ removed, failed, provenance: 'host' }` partial.
2. Update the JSDoc to state the abort takes effect between per-track retries (the
   one in-flight host await still completes — RISK-1).

**Validation (TDD)**: a rejected batch of N where the signal aborts after the k-th
retry → at most k+1 single-track host calls issued; accumulated partial returned;
the one in-flight await asserted to complete (RISK-1, not engineered around).

---

### T006 — Per-track progress emission

**Purpose**: Re-arm the store's stall watchdog on genuine fallback progress (FR-006).

**Steps**:
1. Emit `onProgress?.({ removedSoFar: removed.length, total })` after each per-track
   retry (in addition to / instead of the per-batch emit, keeping `removedSoFar`
   monotonic and `<= total`).

**Validation (TDD)**: a rejected batch of N making progress → `onProgress` fires
per track with non-decreasing `removedSoFar`; invariant `0 <= removedSoFar <= total`
holds. Boundary (NFR-005): `BATCH_SIZE` (100) retained — 99 / 100 / 101 tracks; abort
at retry 0, mid, and last.

---

## Definition of Done

- [ ] Both subtasks complete, test-first.
- [ ] `npx tsc --noEmit` clean; `npm run test:coverage` 100%, no skips; full suite green.
- [ ] Abort stops further per-track host calls; progress fires per track; no termination guarantee for the in-flight await was added (C-001).
- [ ] JSDoc no longer claims the fallback always runs to the batch end.
- [ ] WHEN DONE: commit in the worktree, then run the WP's spec-kitty completion commands — do not hand off mid-WP.

## Reviewer guidance

- Confirm the abort check is **inside** the per-track loop, not only at the batch boundary.
- Confirm the existing `{ removedSoFar, total }` shape is reused (no new event variant).
- Confirm the RISK-1 in-flight-await limit is asserted honestly, not masked.
- Boundary tests present for `BATCH_SIZE` and abort position.

## Activity Log

- (pending)
