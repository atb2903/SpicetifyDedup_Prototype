---
work_package_id: WP05
title: Detection store removal actions
dependencies:
- WP01
- WP02
- WP03
requirement_refs:
- FR-003
- FR-006
- FR-007
- FR-008
- FR-009
- FR-011
- FR-012
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts for this feature were generated on main. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into main unless the human explicitly redirects the landing branch.
created_at: '2026-06-11T20:52:36Z'
subtasks:
- T016
- T017
- T018
- T019
agent: "claude:opus:implementer:implementer"
shell_pid: "60770"
history:
- timestamp: '2026-06-11T20:52:36Z'
  action: created
  actor: tasks-prompt-generator
authoritative_surface: src/store/
execution_mode: code_change
owned_files:
- src/store/detection-store.ts
- test/store/detection-store.test.ts
tags: []
---

# WP05 — Detection store removal actions

## Objective

Wire the removal flow into the existing `createDetectionStore`: the three public actions
(`requestRemoval` / `confirmRemoval` / `cancelRemoval`), the `> 25` two-step branch, the
`computeRemoveSet → RemovalExecutor.remove → applyRemovalOutcome → removeComplete` orchestration,
and the concurrency lock — all driven by an **optional** injected `RemovalExecutor` so the
~10 existing tests that call `createDetectionStore(scanner)` keep compiling unchanged.

100% line+branch on `detection-store.ts`; `tsc --noEmit` green; all pre-existing store tests
still pass.

## Context

The store is the orchestrator: it holds the `loaded` `DetectionResult`, knows
`removableTrackCount` (so it decides the `> 25` branch), and owns the controller lifecycle.
Read first:

- `src/store/detection-store.ts` (existing) — the file you extend. Note `createDetectionStore`,
  the closure-level `controllers` map, the `dispatch(key, action)` helper, the `scanCollection`
  abort/replace pattern, the `AbortError` swallow, and the non-`DetectionError` wrap. Mirror all
  of this for removal.
- [`../data-model.md`](../data-model.md) §7 (store surface additions) — the three signatures and
  the `confirmRemoval` orchestration order.
- [`../contracts/removal-state-fsm.md`](../contracts/removal-state-fsm.md) — the actions the
  store dispatches and the `confirmFirst` `requiresSecondConfirm` discriminator semantics.
- `src/domain/detection-state.ts` (WP01) — the removal actions: `removeRequest`, `confirmFirst`
  `{ requiresSecondConfirm }`, `confirmSecond`, `removeCancel`, `removeProgress`, `removeComplete`.
- `src/domain/remove-set.ts` + `apply-removal-outcome.ts` (WP02) — `computeRemoveSet`,
  `applyRemovalOutcome`, `isRemovableResult`.
- `src/ports/removal-executor.ts` (WP03) + `src/adapters/fake-removal-executor.ts` (WP03, used in
  tests) + `src/domain/removal-errors.ts` (WP01).

**Architectural constraint** (ADR-0001): `src/store/` imports `src/domain/` + `src/ports/` only.
The store imports the `RemovalExecutor` **port type**, never the Spicetify adapter (that is
injected from `app.tsx` in WP07).

**The `> 25` threshold** lives in the store (it holds the count); the FSM stays count-agnostic by
accepting `confirmFirst { requiresSecondConfirm }`. Boundary: 24/25 → single confirm
(`requiresSecondConfirm: false` → `removing`); 26 → double (`true` → `confirming2`).

## Branch strategy

Planning base & merge target: **`main`**. Workspace/branch assigned by
`spec-kitty agent action implement WP05 --agent <name>` from `lanes.json`. Depends on **WP01**,
**WP02**, **WP03**.

## Subtasks

### T016 — Extend store state + inject optional `RemovalExecutor`

**Purpose**: Add the removal actions to `DetectionStoreState` and accept an **optional** executor
without breaking existing callers.

**Changes**:
- Add to `DetectionStoreState` (JSDoc each, per data-model §7):
  ```ts
  requestRemoval(collectionKey: string): void;
  confirmRemoval(collectionKey: string): Promise<void>;
  cancelRemoval(collectionKey: string): void;
  ```
- Change the factory signature to:
  ```ts
  export function createDetectionStore(
    scanner: DetectionScanner,
    removalExecutor?: RemovalExecutor,
  ): StoreApi<DetectionStoreState>
  ```
  **It MUST be an optional second parameter** — making it required breaks ~10 existing test
  files and the existing `app.tsx` call. When `removalExecutor` is `undefined`, `confirmRemoval`
  that would reach the executor throws `RemovalError('executor-failed', 'no RemovalExecutor
  configured')` (or a clearly-typed guard) — but `requestRemoval`/`cancelRemoval` (pure FSM
  dispatches) still work. Document this default.
- Add a closure-level in-flight guard for removals mirroring the `controllers` map, e.g.
  `removalControllers: Record<string, AbortController>` (the executor takes an `AbortSignal`).

**Files**: `src/store/detection-store.ts` (changed).

### T017 — `requestRemoval` / `cancelRemoval` (pure FSM dispatches)

**Purpose**: The two synchronous actions that only move the FSM (no executor call).

**Implement**:
- `requestRemoval(key)` → `dispatch(key, { type: 'removeRequest' })`. The FSM moves
  `loaded.none → confirming` (and `partial → confirming` retry); it **ignores** the action from
  `confirming`/`confirming2`/`removing` (FR-012) and from non-`loaded` rows — so the store does
  not need its own guard here, but document that the FSM is the authority.
- `cancelRemoval(key)` → `dispatch(key, { type: 'removeCancel' })`. Moves
  `confirming|confirming2 → none`; ignored elsewhere. **No executor call** on cancel (FR-007).

**Files**: `src/store/detection-store.ts` (changed).

### T018 — `confirmRemoval` orchestration + concurrency lock

**Purpose**: The async heart of the feature (data-model §7 order).

**Implement `confirmRemoval(key)`**:
1. Read the row: `const row = get().rows[key]`. If not `kind: 'loaded'` → return (no-op;
   late/invalid call). Read `result = row.result`, `phase = row.removal.phase`.
2. **Two-step branch**:
   - If `phase === 'confirming'`: compute `requiresSecondConfirm = result.removableTrackCount > 25`.
     Dispatch `confirmFirst { requiresSecondConfirm }`. If `requiresSecondConfirm` is `true`, the
     FSM is now `confirming2` — **return** (the second dialog will call `confirmRemoval` again).
     If `false`, the FSM is now `removing` — fall through to execute.
   - If `phase === 'confirming2'`: dispatch `confirmSecond` → FSM `removing` — fall through.
   - Any other phase (`none`/`removing`/`partial`) → return (no-op; concurrency / invalid).
3. **Concurrency lock**: before executing, guard on the in-flight map — if
   `removalControllers[key]` already exists, return (a removal is already running; FR-012). The
   FSM `removing` phase also blocks a second `removeRequest`, but the closure guard prevents a
   double-execute from overlapping `confirmRemoval` calls. Allocate a fresh `AbortController` and
   store it.
4. **Executor present?** If `removalExecutor === undefined` → fail loud
   (`RemovalError('executor-failed', 'no RemovalExecutor configured')`), clean up the controller,
   and (decide) either dispatch a terminal that surfaces it or rethrow — document the choice;
   simplest is to throw before allocating the controller. (Production always injects one.)
5. **Execute** (wrap in try/catch/finally like `scanCollection`):
   - `const target = targetForKey(key, result)` — derive the `RemovalTarget` from the row. The
     store knows the key; `'liked-songs'` → `{ kind: 'liked-songs' }`, a playlist URI →
     `{ kind: 'playlist', playlistUri: key }`. (If the target must come from the caller instead,
     thread it through — but the key already encodes it; document the derivation.)
   - `const removeSet = computeRemoveSet(result, target)` (may throw `RemovalError`
     `malformed-result` → caught below).
   - `const outcome = await removalExecutor.remove(target, removeSet.tracks, controller.signal,
     (event) => dispatch(key, { type: 'removeProgress', event }))`.
   - `const updated = applyRemovalOutcome(result, outcome, target)`.
   - `dispatch(key, { type: 'removeComplete', result: updated, outcome })` — the FSM lands
     `loaded(updated, none|partial)`. **Apply the outcome exactly once** (the documented guard
     against the `outcome-mismatch` idempotence trap from WP02).
6. **Catch**:
   - `AbortError` → swallow (a cancel/reset moved the row); do not dispatch a failure.
   - `RemovalError` / other → wrap non-`RemovalError` as `RemovalError('executor-failed', …,
     { cause })`. Decide how to surface it: the spec has no dedicated removal-failure FSM state,
     so the pragmatic path is to dispatch `removeComplete` with an **all-failed** `outcome`
     (every requested track in `failed`) so the row shows `partial` (FR-010) and the copies stay
     visible — OR log + reset removal to `none`. Choose one, document it, and test it. (Recording
     it as a `partial` with all-failed is the most spec-aligned: AS-8 "surfaced, not swallowed".)
7. **Finally**: delete `removalControllers[key]` if we still own it (mirror `scanCollection`'s
   own-entry guard).

Add the private `targetForKey` helper (or inline) with JSDoc.

**Files**: `src/store/detection-store.ts` (changed).

### T019 — Store tests with `FakeRemovalExecutor`

**Purpose**: Prove the orchestration end-to-end against the WP03 fake (black-box, `DIRECTIVE_036`).

**Setup**: build the store with `createDetectionStore(stubScanner, new FakeRemovalExecutor(...))`;
seed a `loaded` row by dispatching a scan that completes (reuse the existing test helpers) or by
driving `scanCollection` with a stub scanner that returns a crafted `DetectionResult`.

**Tests**:
- **Single-collection scope (AS-4)**: `confirmRemoval('playlist:A')` → the fake's `calls` records
  exactly one call, `target` = playlist A; no other row touched.
- **Happy path full success**: fake scripted `ok` → after `requestRemoval` + `confirmRemoval`,
  the row is `loaded` with `removal.phase === 'none'`, `removableTrackCount === 0`, groups gone
  (AS-7). Executor called once with the `computeRemoveSet` tracks.
- **Partial failure (AS-8 / FR-010)**: fake scripted `partial` → row is `loaded`,
  `removal.phase === 'partial'`, the failed copies still present in `result`, the outcome on the
  `partial` state carries the failures.
- **Executor throws**: fake scripted `throw` (a `RemovalError`) → row reflects the documented
  failure handling (all-failed `partial`, per T018 choice); assert no unhandled rejection.
- **No-auto-run (FR-011 / AS-9 / C-002)**: building the store and seeding a `loaded` row makes
  **zero** executor calls; only an explicit `confirmRemoval` triggers `remove`. Assert
  `fake.calls.length === 0` after setup and after `requestRemoval` alone (confirming shows the
  dialog, does not execute).
- **Concurrency (FR-012)**: with a fake whose `remove` is a pending promise (resolve manually),
  a second `requestRemoval`/`confirmRemoval` during `removing` is a no-op — exactly one executor
  call; assert via `fake.calls.length === 1`.
- **Cancel (FR-007)**: `requestRemoval` then `cancelRemoval` → row back to `removal.phase ===
  'none'`; **zero** executor calls.
- **>25 boundary (NFR-003)**: seed results with `removableTrackCount` of **24, 25, 26**:
  - 24 → `confirmRemoval` once goes straight to `removing`/execute (single confirm).
  - 25 → single confirm → execute.
  - 26 → first `confirmRemoval` moves to `confirming2` and does **not** execute; a second
    `confirmRemoval` executes. Assert the executor call count at each step (0 after the first
    call for 26, 1 after the second).
- **Optional-executor back-compat**: `createDetectionStore(scanner)` (no executor) still
  constructs; `requestRemoval`/`cancelRemoval` work; `confirmRemoval` that would execute fails
  loud per T018. Assert one existing-style construction still compiles/runs.
- **Existing store tests unchanged**: run the full `detection-store` suite — all prior cases
  green.
- 100% line + branch.

**Files**: `test/store/detection-store.test.ts` (changed, +~300 lines).

## Test strategy

TDD (`DIRECTIVE_034`): failing test first (e.g. `confirmRemoval` calls the fake exactly once),
watch it fail, implement. Vitest, no happy-dom (the store is DOM-free). Use `FakeRemovalExecutor`
(WP03) as the injected double — never mock `computeRemoveSet`/`applyRemovalOutcome` (real domain
transforms run). Coverage gate: 100% line+branch on `detection-store.ts` including the new
branches (24/25/26, partial, throw, abort, no-executor).

## Definition of Done

- [ ] `requestRemoval`/`confirmRemoval`/`cancelRemoval` added to `DetectionStoreState`;
      `removalExecutor` is an **optional** second factory param (back-compat preserved).
- [ ] `confirmRemoval` orchestrates `computeRemoveSet → remove → applyRemovalOutcome →
      removeComplete`, branches `> 25` at the store, applies the outcome exactly once, and wraps
      non-`RemovalError` throws.
- [ ] Concurrency lock prevents overlapping removals of the same collection (FR-012); abort
      swallowed; controller cleanup mirrors `scanCollection`.
- [ ] Tests cover scope, full/partial/throw, no-auto-run, cancel, concurrency, 24/25/26, and
      optional-executor back-compat — all with `FakeRemovalExecutor`; existing suite still green.
- [ ] 100% line+branch; `npm run test:run` and `tsc --noEmit` green; architecture test clean.
- [ ] Store imports the `RemovalExecutor` **port**, not the Spicetify adapter.

## Risks

| Risk | Mitigation |
|---|---|
| Required `removalExecutor` breaks ~10 existing test files + app.tsx | It MUST be optional (second param); a dedicated back-compat test asserts `createDetectionStore(scanner)` still works. |
| Double-applying an outcome → `outcome-mismatch` throw | Apply exactly once in the single `removeComplete` dispatch; concurrency lock + FSM `removing` prevent re-entry. |
| `> 25` logic leaking into the FSM | Threshold computed in the store; FSM only sees `requiresSecondConfirm`; boundary-tested at 24/25/26 here. |
| Unhandled promise rejection from `confirmRemoval` | try/catch/finally mirrors `scanCollection`; throw case asserted to surface as `partial`, not an unhandled rejection. |

## Reviewer guidance

- Verify the optional executor and the no-executor fail-loud path.
- Verify the `> 25` branch and the 24/25/26 boundary call counts.
- Verify single-collection scope: the executor is called with exactly the acted target.
- Verify no-auto-run: no executor call without an explicit `confirmRemoval`.
- Verify the concurrency lock and the abort swallow match `scanCollection`'s pattern.

## Implementation command

```bash
spec-kitty agent action implement WP05 --agent <name>
```

## Activity Log
- 2026-06-12T19:58:30Z – claude:opus:implementer:implementer – shell_pid=60770 – Started implementation via action command
- 2026-06-12T20:07:35Z – claude:opus:implementer:implementer – shell_pid=60770 – Ready for review
