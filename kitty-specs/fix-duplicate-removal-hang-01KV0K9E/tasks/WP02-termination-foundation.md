---
work_package_id: WP02
title: Termination foundation — stalled code, scheduler seam, hang fake
dependencies:
- WP01
requirement_refs:
- FR-004
- FR-006
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts for this feature were generated on main. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into main unless the human explicitly redirects the landing branch.
base_branch: kitty/mission-fix-duplicate-removal-hang-01KV0K9E
base_commit: 9629e224ed58cade4e5dc115bab527b07892f18a
created_at: '2026-06-13T21:53:05.730277+00:00'
subtasks:
- T004
- T005
- T006
shell_pid: "74707"
agent: "claude:opus:implementer:implementer"
history:
- timestamp: '2026-06-13T18:51:29Z'
  action: created
  actor: tasks-prompt-generator
authoritative_surface: src/ports/scheduler.ts
execution_mode: code_change
owned_files:
- src/domain/removal-errors.ts
- src/ports/scheduler.ts
- src/adapters/fake-removal-executor.ts
- test/domain/removal-errors.test.ts
- test/ports/scheduler.test.ts
- test/adapters/fake-removal-executor.test.ts
tags: []
---

# WP02 — Termination foundation (`stalled` code · `Scheduler` seam · `hang` fake)

## Objective

Land the three small, independent scaffolding pieces the WP03 fix imports, each TDD'd to 100%
line/branch:

1. **`'stalled'` error code** — one literal added to the closed `RemovalErrorCode` union.
2. **`Scheduler` timer seam** — a new injectable port (`src/ports/scheduler.ts`) with a real-timer
   default, mirroring `createDetectionScanner`'s injected `clock` convention.
3. **`'hang'` fake script** — a never-settling variant on `FakeRemovalExecutor` so WP03's tests
   (and WP04's integration test) can drive a true non-settling call through the real store.

By the end, all three modules compile under `tsc --noEmit`, the architecture test
(`test/architecture.test.ts`) still passes, and each module's test file is green at 100%.

## Context — read first

- [`../data-model.md`](../data-model.md) §2 (the `'stalled'` literal + semantics), §3 (the
  `Scheduler` interface + `defaultScheduler`), §5 (the `'hang'` script).
- `src/domain/removal-errors.ts` — the existing closed union + `RemovalError` + `isRemovalError`
  (the classifier is `instanceof`-based and **does not change**).
- `src/adapters/fake-removal-executor.ts` — the existing `FakeRemovalScript` union + the
  record-then-act pattern (the `throw` script is recorded in `calls` before rejecting).
- `src/adapters/detection-scanner.ts:52-59` — the injected `clock = Date.now` default this WP's
  `Scheduler` default mirrors.
- `src/ports/detection-scanner.ts` — the house style for a port file (layer rule: `src/ports/` may
  import from `src/domain/` only).

TDD is mandatory (DIRECTIVE_034): write each test, watch it fail, then implement.

## Subtasks

### T004 — Add `'stalled'` to `RemovalErrorCode`

**Purpose.** Give the stall path a typed, code-agnostic-classifier-compatible error code that
routes through the existing non-`AbortError` catch in `confirmRemoval` (data-model §2).

**Steps.**

1. In `src/domain/removal-errors.ts` §4.1, add `| 'stalled'` to the `RemovalErrorCode` union.
2. Add a per-code JSDoc note matching the existing style, e.g.:
   *"`'stalled'` — the store's stall-ceiling fired: the executor promise neither resolved nor
   rejected before `STALL_CEILING_MS`. Routed through the existing non-Abort catch → all-failed
   `partial`; distinct from `AbortError` so the user-cancel swallow branch is never taken."*
3. `isRemovalError` is unchanged (assert this — it is `instanceof`-based).

**Test (`test/domain/removal-errors.test.ts`).** Extend the existing suite: a
`new RemovalError('stalled', 'Removal timed out after 30s — no tracks were removed.', { context: { ceilingMs: 30000, total: 1 } })`
has `code === 'stalled'`, `isRemovalError(e) === true`, preserves `context`, and `message` is the
plain-language string (no stack). Keep boundary/branch coverage at 100%.

### T005 — Create the `Scheduler` seam

**Purpose.** A minimal, injectable timer interface so WP03's stall ceiling is deterministically
testable (research §R-6), defaulting to real platform timers.

**Steps.**

1. Create `src/ports/scheduler.ts` with the interface and default from data-model §3:
   ```ts
   /** Minimal timer seam so the stall ceiling is deterministically testable. */
   export interface Scheduler {
     /** Schedule `fn` after `ms`; returns a handle for cancellation. */
     setTimeout(fn: () => void, ms: number): TimerHandle;
     /** Cancel a pending timer (no-op if already fired/cleared). */
     clearTimeout(handle: TimerHandle): void;
   }
   export type TimerHandle = ReturnType<typeof setTimeout>;

   /** Production default: delegates to the platform's real timers. */
   export const defaultScheduler: Scheduler = {
     setTimeout: (fn, ms) => setTimeout(fn, ms),
     clearTimeout: (h) => clearTimeout(h),
   };
   ```
2. Add a file-level JSDoc block in the house style (layer rule, why-it-exists, mirrors `clock`).
3. Confirm placement is legal: `src/ports/` may import from `src/domain/` only — this file imports
   nothing, so it is trivially legal.

**Test (`test/ports/scheduler.test.ts`).** Cover the `defaultScheduler` default at 100%: using
`vi.useFakeTimers()`, assert `setTimeout(fn, ms)` schedules `fn` (fires after advancing `ms`) and
`clearTimeout(handle)` cancels it (does not fire). This is the only branch surface in the module.

> The architecture test must still pass — verify `src/ports/scheduler.ts` does not trip any
> import-boundary assertion.

### T006 — Add the `'hang'` fake script

**Purpose.** A non-settling script so the store/integration tests can exercise a true hang through
the real store (DIRECTIVE_036), consistent with the existing `ok`/`partial`/`partial-uids`/`throw`
model (data-model §5).

**Steps.**

1. In `src/adapters/fake-removal-executor.ts`, add `| { kind: 'hang' }` to `FakeRemovalScript`,
   with a JSDoc line: *"`hang` — the call is recorded in `calls`, then returns a never-settling
   promise (`new Promise(() => {})`), modelling a host call that never resolves or rejects."*
2. In `remove(...)`, **after** recording the call (so `hang` is recorded just like `throw`), if the
   active script is `'hang'`, `return new Promise<RemovalOutcome>(() => {})` — never settles, never
   calls `onProgress`.
3. Keep the abort-at-entry guard first (a pre-aborted signal still throws before recording).
4. Ensure `partition`/`shouldFail` exhaustiveness is preserved (the `hang` branch returns before
   reaching `partition`, so the `Exclude<…, { kind: 'throw' }>` typing in the helpers is
   unaffected — verify `tsc` stays green).

**Test (`test/adapters/fake-removal-executor.test.ts`).** Add: a `hang` call (a) is recorded in
`calls` with a snapshot copy of `tracks`, (b) returns a promise that does not settle within a
microtask/`await Promise.resolve()` flush (assert via `Promise.race` against an immediately-
resolved sentinel), and (c) a pre-aborted signal still throws `AbortError` before recording even
under the `hang` script. Maintain 100% branch coverage.

## Definition of Done

- [ ] `RemovalErrorCode` includes `'stalled'`; `removal-errors.test.ts` green, 100% coverage.
- [ ] `src/ports/scheduler.ts` exports `Scheduler`, `TimerHandle`, `defaultScheduler`;
      `scheduler.test.ts` green, 100% coverage; architecture test passes.
- [ ] `FakeRemovalScript` includes `{ kind: 'hang' }`; the call is recorded then never settles;
      `fake-removal-executor.test.ts` green, 100% coverage.
- [ ] `npm run typecheck` clean; `npm run test:run` green; `npm run test:coverage` 100% line/branch.

## Reviewer guidance

- The classifier `isRemovalError` must be untouched (instanceof-based, code-agnostic).
- The `hang` script must be **recorded before** returning the non-settling promise (parity with
  `throw`), else WP04's integration test can't assert the call reached the executor.
- `defaultScheduler` must delegate to the real `setTimeout`/`clearTimeout` (no custom timing).

## Risks

- **happy-dom timer quirks** — keep the default's test on `vi.useFakeTimers()` and avoid relying on
  `AbortSignal.timeout` here (research §R-6 rejected that primitive for determinism).
- **Coverage on the never-settling branch** — assert the promise's *non-settlement* via a race,
  not by awaiting it (awaiting would hang the test).

## Activity Log

- 2026-06-13T21:53:06Z – claude:opus:implementer:implementer – shell_pid=74707 – Assigned agent via action command
