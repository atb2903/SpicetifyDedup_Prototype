---
work_package_id: WP03
title: Catch hardening (hang fix) + stall ceiling in confirmRemoval
dependencies:
- WP02
requirement_refs:
- FR-004
- FR-006
- FR-007
- FR-009
- FR-010
- NFR-001
- NFR-002
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
agent: "claude:opus:reviewer:reviewer"
shell_pid: "96880"
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

# WP03 — Catch hardening (the hang fix) + stall ceiling in `confirmRemoval`

> **Revised after WP01 live diagnosis.** The original framing of this WP ("bound the `await`") was
> based on a never-settling-promise hypothesis that live evidence **falsified**:
> `PlaylistAPI.remove` is never called. The real hang is **Defect A** — see
> [`../diagnosis-evidence.md`](../diagnosis-evidence.md) and ADR-0017. The functional "removal
> actually deletes" fix (FR-002/FR-003/FR-005) now lives in **WP05** (the enricher), not here.

## Objective

Two coupled changes in `confirmRemoval`, both keeping the row out of a permanent `removing` state:

1. **Catch hardening — the actual hang fix (Defect A · FR-004/FR-006).** Today `confirmRemoval`
   calls `computeRemoveSet` in the `try` (line 350) **and again** in the `catch` (line 378). When
   the first call throws (e.g. `malformed-result`/`playlist-member-missing-uid`), the catch's
   recompute throws the *same* error a second time — now **inside the catch** — so it escapes
   `confirmRemoval` uncaught, the terminal `removeComplete` never dispatches, and the row stays
   `removing` forever. **Fix:** compute the remove-set **once** (before/outside the fragile catch),
   reuse it in the catch, so any `computeRemoveSet` failure surfaces as a **terminal** all-failed
   `partial` — never re-thrown.

2. **Stall ceiling — defense-in-depth (NFR-001).** Bound the `await removalExecutor.remove(...)`
   with an injected-scheduler deadline so a *future* hung host call can never spin forever. On
   stall: `controller.abort()` to stop further batches **and** raise `RemovalError('stalled', …)`.

Both faults flow through the **existing** non-`AbortError` catch (`detection-store.ts:371-395`) into
an **all-failed `partial`**. No new FSM state, no new action, confirmations untouched.

The single hardest constraint: **neither a stall nor a compute-failure may take the `AbortError`-
swallow branch** (`detection-store.ts:363`) — that branch is reserved for user cancel/reset and
returns without a terminal dispatch; either fault going there would re-create the exact bug.

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

### T007 — Failing regression tests (C-003 / DIRECTIVE_034)

**Purpose.** Reproduce **both** hang sources at the store level and prove they fail before the fix.

**T007a — the actual repro (compute-failure hang · Defect A).** This is the bug WP01 confirmed
live and the primary thing this WP fixes.

1. In `test/store/detection-store.test.ts`, drive a `loaded` row whose result makes
   `computeRemoveSet` throw — the realistic case is a **playlist** duplicate group member missing
   `uid` (mirror the live repro: build the detection result with a playlist target and a removable
   member whose `uid` is `undefined`, so `computeRemoveSet` throws
   `malformed-result/playlist-member-missing-uid`).
2. Request → confirm to reach `removing`, then `await flush()`.
3. `expect(removalPhase(store, key)).toBe('partial')` **and** assert no unhandled rejection escaped.
4. Run it and **watch it fail** — today the catch re-computes `computeRemoveSet`, re-throws, and the
   row stays `removing` (the uncaught-in-promise hang). Record the observation in the WP history/PR
   notes.

**T007b — the ceiling repro (never-settling hang · NFR-001 defense-in-depth).**

1. Add a deterministic fake scheduler helper (`makeFakeScheduler()`) exposing `advance(ms)` that
   fires due timers and a `pending` count.
2. Build the store with the new 3-arg form:
   ```ts
   const exec = new FakeRemovalExecutor({ kind: 'hang' });   // never settles
   const scheduler = makeFakeScheduler();
   const store = createDetectionStore(scanner, exec, scheduler);
   ```
3. Drive a `loaded` row with ≥1 removable duplicate (with a valid `uid`, so `computeRemoveSet`
   succeeds and the executor is actually reached) to `removing`.
4. `scheduler.advance(STALL_CEILING_MS); await flush();` then
   `expect(removalPhase(store, key)).toBe('partial')`. **Watch it fail** before the ceiling exists.

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

### T009 — Catch hardening (Defect A) + wire the ceiling into `confirmRemoval`

**Purpose.** The two coupled production changes: (i) compute the remove-set **once** so a
`computeRemoveSet` failure terminates instead of escaping the catch (the actual hang fix), and (ii)
inject the scheduler and wrap the executor await so a never-settling call is bounded; route both
faults to the existing all-failed `partial` path with fault-specific messaging (NFR-004).

**Steps — catch hardening (do this first; it is what fixes the live repro):**

a. Compute `computeRemoveSet(result, target)` **once** and structure the function so the `catch`
   block **never calls `computeRemoveSet` again** (today it re-calls it at line 378 and re-throws,
   escaping uncaught → the hang). Reuse the already-computed `removeSet` when building the all-failed
   outcome; if the compute itself throws, route it into the same all-failed-`partial` path without
   re-deriving.
b. A compute failure is a `RemovalError` (satisfies `isRemovalError`) → it takes the
   **non-`AbortError`** catch → all-failed `partial`; it must **never** take the `AbortError`-swallow
   branch. Counts stay unchanged (FR-007 truthful).
c. Re-run T007a — it must now pass (row → `partial`, no uncaught rejection).

**Steps — ceiling wiring:**

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

### T011 — Stall-vs-cancel + compute-failure-vs-cancel + concurrency / late-settle

- **Stall ≠ cancel (research §R-4):** (a) stall → `partial` (terminal); (b) `reset()` mid-removal →
  executor throws `AbortError` → **swallowed** → row cleared by `reset` (NOT `partial`). Asserts the
  two abort sources stay distinguishable.
- **Compute-failure ≠ cancel (Defect A):** a `computeRemoveSet` failure → `partial` (terminal,
  never re-thrown, never `removing`); a `reset()` still clears the row. Confirms the hardened catch
  routes a pre-executor throw to the non-`AbortError` path, not the swallow branch.
- **No double-fire (FR-009):** a second `confirmRemoval(key)` while one is in flight is rejected by
  the existing `removalControllers` lock — re-assert this holds across the stall path.
- **Late settle ignored:** after the deadline fires, settle the (previously hung) work promise and
  flush → no state change, no unhandled-rejection warning.
- **Confirmations intact (FR-010):** the stall path is only reachable after `confirming`
  (and `confirming2` for >25) — assert the ceiling does not bypass the confirm dialogs.

## Definition of Done

- [ ] T007a (compute-failure hang) **and** T007b (never-settling hang) observed failing before the
      fix, passing after (recorded).
- [ ] **Catch hardening:** `confirmRemoval` computes `computeRemoveSet` once; the `catch` never
      re-invokes it; a `computeRemoveSet` failure → terminal all-failed `partial`, never re-thrown,
      never leaving `removing` (the Defect A fix — FR-004/FR-006).
- [ ] `STALL_CEILING_MS` + `raceStallCeiling` implemented; bound lives only in the store.
- [ ] Stall and compute-failure → all-failed `partial` via the existing non-Abort catch; never the
      swallow branch; never a `none` (no false success — FR-007).
- [ ] Boundary suite (under/at/over) + stall-vs-cancel + compute-failure-vs-cancel + no-double-fire
      + late-settle all green.
- [ ] `npm run typecheck` clean; `npm run test:coverage` 100% line/branch on the store.
- [ ] Existing callers (`app.tsx`, other store tests) still compile (3rd param is optional).
- [ ] Scope check: WP03 does **not** touch the enricher (Defect B / FR-002/003/005 belong to WP05).

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

## Activity Log

- 2026-06-13T23:33:50Z – claude:opus:implementer:implementer – shell_pid=91844 – Started implementation via action command
- 2026-06-13T23:41:37Z – claude:opus:implementer:implementer – shell_pid=91844 – Ready for review — compute-once catch hardening + stall ceiling, both hangs now terminate to partial
- 2026-06-13T23:42:12Z – claude:opus:reviewer:reviewer – shell_pid=96880 – Started review via action command
