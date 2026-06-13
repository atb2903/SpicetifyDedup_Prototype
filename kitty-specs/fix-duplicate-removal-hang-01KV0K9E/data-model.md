# Data Model — Fix Indefinite Hang on Duplicate Removal

Phase 1 output. This is a **bug fix + one resilience seam**, so the data-model delta is small and
deliberately reuses existing types and states. Sections mirror the existing removal type modules.

---

## §1 · What does NOT change (consistency anchors)

These are reused verbatim — the fix adds no parallel concept:

- **`RemovalState` FSM phases** (`src/domain/detection-state.ts`): `none | confirming |
  confirming2 | removing | partial`. **No new phase.** A stall reuses `partial`.
- **`removeComplete` action** already routes `removing → partial` when
  `outcome.failed.length > 0` (`detection-state.ts:271-283`). The stall path dispatches
  `removeComplete` with an all-failed outcome — the same action, same edge.
- **`RemovalOutcome`** (`removal-types.ts §2.4`): an all-failed outcome (`removed: []`,
  every requested track in `failed`) is already a valid, total-accounted outcome. Reused for stall.
- **`RemovalExecutor` port** (`ports/removal-executor.ts`): **unchanged.** The executor remains a
  pure mutation seam; the ceiling is imposed by the caller (store), not the port.
- **Confirmation flow** (`confirming` / `confirming2`, >25 second confirm): **unchanged**
  (FR-010 / C-002).

---

## §2 · Type delta — `RemovalErrorCode` gains `'stalled'`

`src/domain/removal-errors.ts` §4.1 — add one literal to the closed union:

```ts
export type RemovalErrorCode =
  | 'malformed-result'
  | 'outcome-mismatch'
  | 'executor-failed'
  | 'host-unavailable'
  | 'stalled';          // NEW
```

**`'stalled'` semantics.** Raised by the store's stall-ceiling helper when the executor promise
neither resolves nor rejects before `STALL_CEILING_MS`. It is a `RemovalError` (so
`isRemovalError` returns `true`), which routes it through the existing non-`AbortError` catch
branch in `confirmRemoval` → all-failed `partial`. It is **distinct from `AbortError`** so the
user-cancel swallow branch is never taken for a stall (see research R-4).

- `code: 'stalled'`
- `message`: plain-language, e.g. `"Removal timed out after 30s — no tracks were removed."`
  (NFR-004 — no stack/raw exception in the primary UI message).
- `context` (optional): `{ ceilingMs: number, total: number }` for diagnostics.

The `isRemovalError` classifier is unchanged (it is `instanceof`-based, code-agnostic).

---

## §3 · New seam — `Scheduler` (timer injection)

A minimal interface over the platform timers, injected into `createDetectionStore`, defaulting to
real timers — mirroring `createDetectionScanner`'s injected `clock = Date.now` default.

```ts
/** Minimal timer seam so the stall ceiling is deterministically testable. */
export interface Scheduler {
  /** Schedule `fn` after `ms`; returns a handle for cancellation. */
  setTimeout(fn: () => void, ms: number): TimerHandle;
  /** Cancel a pending timer (no-op if already fired/cleared). */
  clearTimeout(handle: TimerHandle): void;
}
export type TimerHandle = ReturnType<typeof setTimeout>;

// default in production:
const defaultScheduler: Scheduler = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h),
};
```

**Wiring.** `createDetectionStore(scanner, removalExecutor?, scheduler = defaultScheduler)` — a
third optional parameter, back-compat with every existing caller (tests + `app.tsx`), exactly as
`removalExecutor` was added optionally. Placement TBD-at-implementation: this `Scheduler` may live
in `src/ports/` (a seam, like other ports) or alongside the store; the architecture test
(`test/architecture.test.ts`) decides the legal layer. Recommendation: `src/ports/scheduler.ts`,
since it is an injected boundary the store depends on.

---

## §4 · The stall-ceiling helper (pure, store-local or domain)

A small, single-responsibility helper that races a promise against the scheduler deadline:

```ts
/**
 * Resolve with `work`'s value if it settles within `ms`; otherwise invoke
 * `onStall` and reject with RemovalError('stalled', …). A late settlement of
 * `work` after the deadline is ignored (the executor arm gets a no-op catch so
 * a post-deadline abort-rejection never surfaces as unhandled).
 */
function raceStallCeiling<T>(
  work: Promise<T>,
  ms: number,
  scheduler: Scheduler,
  onStall: () => void,
): Promise<T>;
```

**Boundary contract (NFR-002 — the testable numeric bound):**

| Case | Executor settles | Deadline fires | Result |
|---|---|---|---|
| under | before `ms` | cancelled | `work`'s value; timer cleared (no leak) |
| at (`= ms`) | coincident with deadline | — | **deadline wins → `stalled`** (documented tie-break; the guard is conservative) |
| over | never / after `ms` | fires at `ms` | `onStall()` called, reject `RemovalError('stalled')` |

The "at" tie-break is pinned to **deadline-wins** so the guard is never weaker than advertised;
the boundary test asserts this explicitly. (If implementation finds settle-wins cleaner with the
chosen primitives, it must update this row and its test in lock-step.)

---

## §5 · FakeRemovalExecutor delta — `'hang'` script

`src/adapters/fake-removal-executor.ts` `FakeRemovalScript` gains a non-settling variant so the
store/integration tests can exercise a true hang through the real store (DIRECTIVE_036):

```ts
export type FakeRemovalScript =
  | { kind: 'ok' }
  | { kind: 'partial'; failUris: ReadonlyArray<string> }
  | { kind: 'partial-uids'; failUids: ReadonlyArray<string> }
  | { kind: 'throw'; error: unknown }
  | { kind: 'hang' };        // NEW — returns new Promise(() => {}) (never settles)
```

The `hang` call is still **recorded** in `calls` (it reaches the script stage) before returning
the non-settling promise, consistent with how `throw` is recorded before rejecting.

---

## §6 · Entity mapping to spec

| Spec entity | This model |
|---|---|
| **Duplicate set** | `DetectionResult.groups` (unchanged) → `computeRemoveSet` → `RemoveSet` |
| **Removal operation** | `confirmRemoval` execution: `computeRemoveSet → executor.remove (now ceiling-wrapped) → applyRemovalOutcome → removeComplete` |
| **Removal outcome** | `RemovalOutcome`: success (`failed: []` → `none`), failure (`failed` non-empty → `partial`), **stall** (all-failed `partial`, reason `stalled: …`) |

---

## §7 · Traceability

| Change | Satisfies |
|---|---|
| Stall ceiling around `await executor.remove` | FR-004, NFR-001 |
| Stall → all-failed `partial` (not success) | FR-006, FR-007, AS "no false success" |
| `'stalled'` code + plain message | NFR-004 |
| Distinct from `AbortError` (no swallow) | FR-004 (always reaches terminal state) |
| Existing in-flight lock + button guard | FR-009 (no double-fire) |
| Confirmations untouched | FR-010, C-002 |
| Boundary tests (under/at/over) + scheduler injection | NFR-002 |
| ADR-0017 (root cause + guard) | NFR-003 |
| Retry via existing `partial → confirming` edge | FR-008 |
