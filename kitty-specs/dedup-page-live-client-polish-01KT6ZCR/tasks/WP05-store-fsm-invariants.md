---
work_package_id: WP05
title: Store FSM Invariants (reset + triggerLoad gate)
dependencies: []
requirement_refs:
- FR-007
- FR-009
- FR-012
- FR-013
planning_base_branch: get_library
merge_target_branch: get_library
branch_strategy: Planning artifacts for this feature were generated on get_library. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into get_library unless the human explicitly redirects the landing branch.
base_branch: kitty/mission-dedup-page-live-client-polish-01KT6ZCR
base_commit: 497a812dcfef5739a052f84728f45ae753c10d29
created_at: '2026-06-03T20:34:01.884181+00:00'
subtasks:
- T027
- T028
- T029
- T030
- T031
- T032
shell_pid: "221262"
agent: "claude:opus-4-7:implementer:implementer"
history:
- timestamp: '2026-06-03T19:01:12Z'
  actor: tasks-generator
  note: Initial work package created from plan.md WP-03 (store side) + WP-05 (triggerLoad gate). Bundled because both edit playlists-store.ts.
authoritative_surface: src/store/playlists-store
execution_mode: code_change
mission_slug: dedup-page-live-client-polish-01KT6ZCR
owned_files:
- src/store/playlists-store.ts
- test/store/playlists-store.test.ts
priority: P3+P5-MEDIUM
tags: []
---

# WP-05 — Store FSM Invariants (`reset` + `triggerLoad` gate)

**Closes**: spec §1 P3 (store side — FR-007/FR-009) and spec §1 P5 (FR-012/FR-013).
**Requirements**: FR-007 (reset action), FR-009 (reset does NOT call loader), FR-012 (triggerLoad no-op from non-idle), FR-013 (per-state coverage of T-1..T-4).
**Acceptance test (independent)**: from any source state, `reset()` lands the FSM in idle without calling the loader; from any non-idle source state, `triggerLoad()` is a no-op (state unchanged, loader not called).

This WP makes two surgical edits to `src/store/playlists-store.ts`:
1. Adds a new `reset()` action per contracts/store-reset-action.md §1.
2. Narrows `triggerLoad`'s precondition to `kind === 'idle'` per contracts/store-reset-action.md §2.

Both edits live in the same file, so this WP owns the file outright. **WP-03 depends on this WP** because its `NavigationProvider` calls `s.reset` — that action must exist before WP-03's typecheck passes.

---

## Branch Strategy

- **Planning base / merge target**: `get_library`.
- **This lane's workspace and branch**: assigned by `finalize-tasks` (see `lanes.json`).
- **Sequencing**: WP-03 depends on WP-05. This lane should be implemented early so WP-03 can start.
- **Merge cadence**: lane merges back to `get_library` on done.

---

## Context — design summary

**Reset action** (contracts/store-reset-action.md §1):
- Add `reset: () => void` to `PlaylistsState`.
- Implementation: `reset() { set({ loadState: { kind: 'idle' } }); }` — single-line direct assignment.
- **MUST NOT** call `loader.load()` directly or transitively (FR-009).
- Total over the FSM: defined for every source state.
- Synchronous; no awaitable.
- Idempotent: `reset()` from `idle` is a no-op.
- Does NOT flow through the FSM `transition` function (it's a system-level override, not a user-driven action).

**TriggerLoad gate** (contracts/store-reset-action.md §2):
- Narrow `triggerLoad` to:
  ```ts
  async triggerLoad() {
    const before = get().loadState;
    if (before.kind !== 'idle') return; // FR-012
    set({ loadState: transition(before, { type: 'trigger' }) });
    await runLoad();
  }
  ```
- Mirror of the existing `retry` gate at lines 114-119.
- FSM `transition` continues to ignore `trigger` from non-idle (current behavior); the store-level gate stops the `runLoad()` call (the real concern per mission-review RISK-3).

**Concurrency** (R-6): a late `load-succeeded` arriving after `reset()` is a no-op because `transition(idle, { type: 'load-succeeded' })` already returns `idle` per the FSM table.

---

## Subtasks

### T027 — TDD reset() R-1..R-5 (per source state)

**Purpose**: encode FR-007 + FR-009 totality + idempotence + loader-isolation.

**File**: `test/store/playlists-store.test.ts` (existing — extend).

**Steps**:
1. Add a `describe('reset()', …)` block.
2. For each of the five source states, add a failing test:
   - **R-1**: `it('R-1 — reset from idle leaves state at idle and does not call loader', …)`. Construct store with a loader whose `load` is `vi.fn()`. Without calling `triggerLoad`, call `store.getState().reset()`. Assert `store.getState().loadState.kind === 'idle'` AND `loader.load` call count is 0.
   - **R-2**: `it('R-2 — reset from loading returns state to idle', …)`. Use a controllable loader (promise that resolves on test command). Call `triggerLoad()` without awaiting; state is now `loading`. Call `reset()`. Assert state is now `idle` AND loader call count is 1 (the in-flight call already happened) — but no NEW call.
   - **R-3**: `it('R-3 — reset from loaded returns state to idle and does not re-call loader', …)`. Await `triggerLoad()` to completion (state becomes `loaded`). Note loader call count. Call `reset()`. Assert state is `idle` AND loader call count is unchanged.
   - **R-4**: `it('R-4 — reset from empty returns state to idle', …)`. Use a loader that returns empty playlists + zero-track liked songs. Await `triggerLoad()`. State is `empty`. Call `reset()`. Assert state is `idle`.
   - **R-5**: `it('R-5 — reset from failed returns state to idle and does not call loader', …)`. Use a loader that rejects. Await `triggerLoad()`. State is `failed`. Call `reset()`. Assert state is `idle` AND loader call count is unchanged.
3. Run — all five tests must fail (the `reset` action does not exist yet).
4. Capture the failure output in the commit message (NFR-001).

**Validation**: five tests fail with a clear "reset is not a function" (or equivalent) message.

---

### T028 — Implement `reset()` in store

**Purpose**: ship the action.

**File**: `src/store/playlists-store.ts` (existing — minor edit).

**Steps**:
1. Update `PlaylistsState` type:
   ```ts
   export type PlaylistsState = {
     loadState: LoadState<CollectionViewModel>;
     triggerLoad: () => Promise<void>;
     retry: () => Promise<void>;
     reset: () => void; // NEW
   };
   ```
2. Add JSDoc explaining: "Lifecycle override — resets FSM to idle from any state without calling the loader. Wired by NavigationProvider (WP-03) to the route-back transition. MUST NOT trigger a load (FR-009)."
3. In the `createPlaylistsStore` factory's returned object, add the `reset` action:
   ```ts
   reset() {
     set({ loadState: { kind: 'idle' } });
   },
   ```
4. Re-run T027 — all five tests green.

**Validation**: typecheck passes; tests green; existing consumers of `PlaylistsState` still type-check (the addition is purely additive).

---

### T029 — TDD R-6 concurrency test

**Purpose**: encode the navigate-away-mid-load race contract.

**File**: `test/store/playlists-store.test.ts` (existing — extend).

**Steps**:
1. Add `it('R-6 — reset during an in-flight load results in idle after the load resolves', …)`.
2. Use a controllable loader: a Promise resolved by a test-side `resolveLoad(payload)` call.
3. Call `store.getState().triggerLoad()` without awaiting — state moves to `loading`.
4. Call `store.getState().reset()` — state moves to `idle`.
5. Call `resolveLoad({ playlists: [<some>], likedSongs: <some> })` — the loader's promise resolves.
6. `await` the original `triggerLoad` promise.
7. Assert `store.getState().loadState.kind === 'idle'` — the late `load-succeeded` was a no-op because the FSM ignores it from `idle`.

**Validation**: assertion holds. Capture the test failure-then-pass cycle in the commit history.

**Note**: the controllable loader pattern is lifted from the prior mission's retry tests (see `test/store/playlists-store.test.ts` for the existing pattern). If the existing pattern is awkward, factor a small test helper `makeControllableLoader()` inside the test file (test-local — do NOT add to production code).

---

### T030 — TDD triggerLoad T-1..T-4 (per non-idle source state)

**Purpose**: encode FR-012 + FR-013 per non-idle source state.

**File**: `test/store/playlists-store.test.ts` (existing — extend).

**Steps**:
1. Add `describe('triggerLoad idle-gate (FR-012, FR-013)', …)`.
2. For each non-idle source state, add a failing test:
   - **T-1**: `it('T-1 — triggerLoad from loading is a no-op', …)`. Use controllable loader. Call `triggerLoad()`, state is `loading`. Note loader call count (1). Call `triggerLoad()` again. Assert state still `loading` AND loader call count still 1.
   - **T-2**: `it('T-2 — triggerLoad from loaded is a no-op', …)`. Await `triggerLoad()` to `loaded`. Note loader call count. Call `triggerLoad()` again. Assert state still `loaded` AND loader call count unchanged.
   - **T-3**: `it('T-3 — triggerLoad from empty is a no-op', …)`. Same shape with empty result.
   - **T-4**: `it('T-4 — triggerLoad from failed is a no-op', …)`. Same shape with failed result.
3. Run — all four tests must fail (current `triggerLoad` calls `runLoad()` regardless of state, so loader count increments).

**Validation**: four tests fail with assertion mismatches on loader call count.

---

### T031 — Implement `triggerLoad` idle-gate

**Purpose**: ship the narrowed precondition.

**File**: `src/store/playlists-store.ts` (existing — minor edit at the `triggerLoad` action).

**Steps**:
1. Locate `triggerLoad`:
   ```ts
   async triggerLoad() {
     set({ loadState: transition(get().loadState, { type: 'trigger' }) });
     await runLoad();
   },
   ```
2. Narrow to (mirroring `retry`'s gate):
   ```ts
   async triggerLoad() {
     const before = get().loadState;
     if (before.kind !== 'idle') return; // FR-012
     set({ loadState: transition(before, { type: 'trigger' }) });
     await runLoad();
   },
   ```
3. Update the file's JSDoc + the action-level JSDoc to reflect the narrowed precondition.
4. Re-run T030 — all four tests green.

**Validation**: typecheck passes; tests green.

---

### T032 — T-5 regression assertion: triggerLoad from idle still loads

**Purpose**: confirm the gate did not over-fire.

**File**: `test/store/playlists-store.test.ts` (existing — extend).

**Steps**:
1. Add `it('T-5 — triggerLoad from idle still calls loader and transitions to loaded', …)`. Note: this assertion may already exist in the file under the prior mission's coverage; if so, T032 is a no-op subtask — close it out with a note that the assertion is pre-existing.
2. If absent: construct fresh store, assert state starts at `idle`, call `triggerLoad()`, assert loader called once AND state transitions to `loading` then `loaded` (or `empty`/`failed` per loader behavior).

**Validation**: green; coverage at 100/100.

---

## Definition of Done

This WP is done when **all** of the following hold:

1. T027 (R-1..R-5) written and observed failing, then green after T028.
2. T028 ships the `reset()` action; `PlaylistsState` type updated.
3. T029 (R-6) green; concurrency contract honored.
4. T030 (T-1..T-4) written and observed failing, then green after T031.
5. T031 ships the `triggerLoad` idle-gate; `triggerLoad` JSDoc updated.
6. T032 (T-5) green (or confirmed pre-existing).
7. `npm run test:run` exits 0.
8. `npm run typecheck` exits 0.
9. `npm run test:coverage` reports `lines: 100%` and `branches: 100%`.
10. Architecture test green.
11. JSDoc on the updated `PlaylistsState` type AND both edited actions (`reset`, `triggerLoad`) reflects the new contract (NFR-008).
12. Per NFR-001: failing-test commits precede fix commits within this WP.

The implementing agent runs the spec-kitty handoff commands so the lane state advances, review begins, and WP-03 can start from this WP's merged state.

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Controllable loader pattern is awkward in existing tests | Lift the prior mission's `retry` test pattern; if the existing pattern is unclear, factor a small `makeControllableLoader()` helper inside `test/store/playlists-store.test.ts` (test-local only). |
| R-6 races test runner timing | Use explicit Promise resolvers + `await Promise.resolve()` ticks; do NOT use `setTimeout`/wall-clock delays — research §1 charter forbids time-based assertions. |
| Existing consumers of `PlaylistsState` break (e.g. selectors) | `reset` is purely additive; existing selectors do not need updates. Verify by running the full suite after T028. |
| Mocking `transition` accidentally | Tests should NOT mock `transition`; it's pure and deterministic. Mock only the loader. |
| `triggerLoad` gate over-fires (T-5 regresses) | T032 is the safeguard. Reviewer enforces. |

---

## Reviewer Guidance

A reviewer should check:

1. **NFR-001**: failing-test commits precede fix commits per subtask.
2. **FR-009**: in the `reset()` implementation, grep for `runLoad`, `loader.`, `load()` — must be zero hits. The action is `set({ loadState: { kind: 'idle' } })`, period.
3. **FR-012 gate shape**: `triggerLoad`'s gate mirrors `retry`'s gate. Both check `before.kind !== '<target>'` and return early. Same shape, same intent.
4. **R-6 concurrency test**: asserts late `load-succeeded` after `reset()` is a no-op. The FSM's existing behavior (transition ignores `load-succeeded` from idle) makes this work without store-level concurrency guards.
5. **JSDoc** on `PlaylistsState`, `reset`, and the updated `triggerLoad` reflects the new contract (NFR-008).
6. **No new imports** in `playlists-store.ts`.
7. **Coverage**: 100/100 (NFR-002). The reset action's single line counts as one line + the type declaration; the gate adds one branch.
8. **Out of scope**: no change to `retry`'s gate (it's already correct). No change to the FSM `transition` function (research §6 confirmed).

---

## Out of Scope (do NOT do in this WP)

- Navigation port + adapter (covered by WP-03).
- `NavigationProvider` (covered by WP-03 — depends on this WP).
- DedupPage layout / scroll surface (covered by WP-01).
- View styling (covered by WP-02).
- Adapter `playlist-v2` widening (covered by WP-04).
- Modifying the FSM `transition` function (research §6 confirmed the bug is in store wiring, not the FSM).
- Adding cross-action concurrency guards beyond what R-6 verifies (the FSM's existing ignore-from-wrong-state behavior is sufficient).
- Exposing `window._dedupStore` for live probes — only for ad-hoc DevTools work, NEVER committed.

## Activity Log

- 2026-06-03T20:34:02Z – claude:opus-4-7:implementer:implementer – shell_pid=221262 – Assigned agent via action command
