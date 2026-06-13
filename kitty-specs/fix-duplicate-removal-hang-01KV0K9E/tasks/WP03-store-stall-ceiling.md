---
work_package_id: WP03
title: Stall ceiling in confirmRemoval (the fix)
dependencies:
- WP02
requirement_refs:
- FR-002
- FR-003
- FR-004
- FR-005
- FR-007
- FR-009
- FR-010
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts for this feature were generated on main. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into main unless the human explicitly redirects the landing branch.
created_at: '2026-06-13T18:51:29Z'
subtasks:
- T007
- T008
- T009
- T010
- T011
history:
- timestamp: '2026-06-13T18:51:29Z'
  action: created
  actor: tasks-prompt-generator
authoritative_surface: src/store/
execution_mode: code_change
owned_files:
- src/store/detection-store.ts
- test/store/detection-store.test.ts
tags: []
---

# WP03 — Stall ceiling in `confirmRemoval` (the fix)

## Objective

Bound the `await removalExecutor.remove(...)` inside `confirmRemoval` with an injected-scheduler
deadline so a hung host call can never leave the row in `removing` forever (NFR-001, FR-004). On
stall: `controller.abort()` to stop further batches **and** raise `RemovalError('stalled', …)`,
which flows through the **existing** non-`AbortError` catch (`detection-store.ts:371-395`) into an
**all-failed `partial`**. No new FSM state, no new action, confirmations untouched.

This is the crux WP. The single hardest constraint: **a stall must NOT take the `AbortError`-
swallow branch** (`detection-store.ts:363`) — that branch is reserved for user cancel/reset and
returns without a terminal dispatch; a stall going there would re-create the exact bug.

## Context — read first

- [`../plan.md`](../plan.md) "Technical Approach" — where the bound lives and why (store, per
  ADR-0007), why no new FSM state, stall ≠ cancel.
- [`../research.md`](../research.md) §R-3 (the race mechanism), §R-4 (stall-vs-cancel distinction),
  §R-5 (`STALL_CEILING_MS = 30_000`), §R-6 (deterministic scheduler boundary strategy).
- [`../data-model.md`](../data-model.md) §4 (the `raceStallCeiling` signature + the **at-boundary
  tie-break = deadline-wins**), §3 (`Scheduler` wiring as 3rd optional param).
- [`../contracts/removal-termination.md`](../contracts/removal-termination.md) — T1..T5 and the
  seven post-conditions tests must assert.
- `src/store/detection-store.ts` — the current `confirmRemoval` (lines 298-403): the in-flight
  lock (`removalControllers`), the `await executor.remove` (351), the `AbortError`-swallow (363),
  the non-Abort catch building all-failed `partial` (371-395), the own-entry `finally` (399-401).
- WP01's `diagnosis-evidence.md` — if it recorded a **non-hang** root cause, also apply that
  functional fix here (the ceiling is required regardless).

**TDD is mandatory.** T007 is the failing test, written and observed failing **before** T008/T009.

## Subtasks

### T007 — Failing regression test (C-003 / DIRECTIVE_034)

**Purpose.** Reproduce the hang at the store level and prove it fails before the fix.

**Steps.**

1. In `test/store/detection-store.test.ts`, add a deterministic fake scheduler helper
   (`makeFakeScheduler()`) exposing `advance(ms)` that fires due timers and `pending` count.
2. Build the store with the new 3-arg form:
   ```ts
   const exec = new FakeRemovalExecutor({ kind: 'hang' });   // never settles
   const scheduler = makeFakeScheduler();
   const store = createDetectionStore(scanner, exec, scheduler);
   ```
3. Drive a `loaded` row with ≥1 removable duplicate to `removing` (request → confirm).
4. `scheduler.advance(STALL_CEILING_MS); await flush();` then
   `expect(removalPhase(store, key)).toBe('partial')`.
5. Run `npm run test:run -- test/store/detection-store.test.ts` and **watch it fail** (today the
   row stays `removing`). Record that observation in the WP history/PR notes.

### T008 — `STALL_CEILING_MS` + the `raceStallCeiling` helper

**Purpose.** A pure, single-responsibility helper that races the executor promise against the
scheduler deadline (data-model §4).

**Steps.**

1. Add a named, documented constant in the store module:
   ```ts
   /** Hang guard (NOT a backend SLA): bounds a non-settling removal call. Tunable here. */
   export const STALL_CEILING_MS = 30_000;
   ```
2. Add the helper (store-local; pure aside from the injected scheduler):
   ```ts
   /**
    * Resolve with `work`'s value if it settles within `ms`; otherwise invoke
    * `onStall()` and reject with RemovalError('stalled', …). A late settlement of
    * `work` after the deadline is ignored — the work arm gets a no-op catch so a
    * post-deadline abort-rejection never surfaces as unhandled (research §R-7).
    * At-boundary tie-break: deadline-wins (the guard is never weaker than advertised).
    */
   function raceStallCeiling<T>(
     work: Promise<T>,
     ms: number,
     scheduler: Scheduler,
     onStall: () => void,
   ): Promise<T> { … }
   ```
   - Schedule the deadline via `scheduler.setTimeout`; on fire, call `onStall()` then reject with
     `new RemovalError('stalled', \`Removal timed out after ${ms / 1000}s — no tracks were removed.\`, { context: { ceilingMs: ms } })`.
   - On `work` settling first, `scheduler.clearTimeout(handle)` (no leaked timer) and resolve/reject
     with `work`'s result.
   - Attach a no-op `.catch(() => {})` to the `work` arm so a late rejection after the deadline does
     not become an unhandled rejection.

### T009 — Wire the ceiling into `confirmRemoval`

**Purpose.** Inject the scheduler and wrap the executor await; route the stall to the existing
all-failed `partial` path with stall-specific messaging (NFR-004).

**Steps.**

1. Add the 3rd optional parameter (data-model §3), back-compat with all existing callers:
   ```ts
   export function createDetectionStore(
     scanner: DetectionScanner,
     removalExecutor?: RemovalExecutor,
     scheduler: Scheduler = defaultScheduler,
   ): StoreApi<DetectionStoreState> { … }
   ```
2. Replace the bare `await removalExecutor.remove(...)` (line 351) with:
   ```ts
   const outcome = await raceStallCeiling(
     removalExecutor.remove(target, removeSet.tracks, controller.signal, onProgress),
     STALL_CEILING_MS,
     scheduler,
     () => controller.abort(),
   );
   ```
   (keep the `onProgress` dispatch wiring as-is).
3. The thrown `RemovalError('stalled')` lands in the existing catch. Because it satisfies
   `isRemovalError`, it does **not** take the `AbortError` branch — it builds the all-failed
   `partial`. Tag each failed entry's `reason` with a `stalled:` prefix (e.g.
   `\`stalled: ${reason.message}\``) so WP04's view can detect the stalled outcome.
4. Confirm the `controller.abort()` from `onStall` makes the executor's subsequent `AbortError`
   **lose the race** and be ignored (the no-op catch on the work arm covers it).
5. `npm run typecheck`; re-run T007 — it must now pass (row → `partial`).

> Do **not** add timeout logic to the adapter or the port — the executor stays a pure seam
> (data-model §1, ADR-0007). The bound lives only here.

### T010 — Boundary tests (NFR-002)

Assert the three points around the ceiling with the deterministic scheduler:

- **under** — executor settles (ok / partial) *before* the deadline → normal `none`/`partial`;
  assert the timer was **cleared** (no leftover pending timer) and **no spurious abort** fired.
- **at** (`= STALL_CEILING_MS`) — deadline and settlement coincide → **deadline-wins → `stalled` →
  `partial`** (the documented tie-break).
- **over** — never settles → advance past the ceiling → `stalled` → all-failed `partial`;
  `result.removableTrackCount` unchanged (nothing removed — FR-007 truthful counts).

### T011 — Stall-vs-cancel + concurrency / late-settle

- **Stall ≠ cancel (research §R-4):** (a) stall → `partial` (terminal); (b) `reset()` mid-removal →
  executor throws `AbortError` → **swallowed** → row cleared by `reset` (NOT `partial`). Asserts the
  two abort sources stay distinguishable.
- **No double-fire (FR-009):** a second `confirmRemoval(key)` while one is in flight is rejected by
  the existing `removalControllers` lock — re-assert this holds across the stall path.
- **Late settle ignored:** after the deadline fires, settle the (previously hung) work promise and
  flush → no state change, no unhandled-rejection warning.
- **Confirmations intact (FR-010):** the stall path is only reachable after `confirming`
  (and `confirming2` for >25) — assert the ceiling does not bypass the confirm dialogs.

## Definition of Done

- [ ] T007 observed failing before the fix, passing after (recorded).
- [ ] `STALL_CEILING_MS` + `raceStallCeiling` implemented; bound lives only in the store.
- [ ] Stall → all-failed `partial` via the existing non-Abort catch; never the swallow branch;
      never a `none` (no false success — FR-007).
- [ ] Boundary suite (under/at/over) + stall-vs-cancel + no-double-fire + late-settle all green.
- [ ] `npm run typecheck` clean; `npm run test:coverage` 100% line/branch on the store.
- [ ] Existing callers (`app.tsx`, other store tests) still compile (3rd param is optional).

## Reviewer guidance

- The **single most important check**: a stall produces `partial`, a user cancel/reset produces a
  cleared row — verify the dedicated paired test exists and both assertions hold.
- Verify the timer is **cleared** on the under-ceiling path (no leaked timer, no late abort).
- Verify no unhandled-rejection surfaces when the hung work settles after the deadline.
- Verify the adapter/port were NOT given timeout logic (bound is store-only).
- Verify the `stalled:` reason prefix is on the failed entries (WP04 depends on it).

## Risks

- **Tie-break drift:** data-model pins at-boundary to deadline-wins. If the chosen primitive makes
  settle-wins cleaner, update the data-model §4 row **and** its test in lock-step — do not let code
  and contract disagree.
- **Coverage on the no-op catch:** ensure a test actually exercises the late-settle branch so the
  `.catch(() => {})` arm is covered.
