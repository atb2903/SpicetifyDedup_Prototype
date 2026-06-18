/**
 * Zustand store owning per-row detection state and `AbortController` lifecycle.
 *
 * `createDetectionStore(scanner)` returns a vanilla `StoreApi<DetectionStoreState>`.
 * Tests instantiate with a stub scanner; the production singleton is wired in
 * `src/app.tsx` (WP09) with `createDetectionScanner(...)`.
 *
 * Responsibilities (data-model.md §8):
 * - Hold per-row `DetectionState` keyed by canonical collection key.
 * - Own `AbortController` lifecycle: allocate on scan start; abort on re-trigger,
 *   cancel, or reset.
 * - On `scanCollection`: abort any in-flight controller for the same row (atomic
 *   replace per FR-011); dispatch `start`; await `scanner.scan`; dispatch result.
 * - On `cancelScan`: abort the row's controller if present; dispatch `cancel`.
 * - On `reset`: abort ALL in-flight controllers; clear the rows map.
 * - Swallow `AbortError` — the cancel/reset already moved the row to `idle`.
 * - Wrap non-`DetectionError` throws in `DetectionError('internal-error', …)`
 *   (FR-004 — an honest internal fault, not a catalog/Spotify rejection).
 *
 * Architecture: `src/store/` may import from `src/domain/` and `src/ports/` only
 * (ADR-0001, `test/architecture.test.ts`).
 */

import { createStore, type StoreApi } from 'zustand/vanilla';
import { useStore } from 'zustand';
import type { DetectionScanner } from '../ports/detection-scanner';
import type { RemovalExecutor } from '../ports/removal-executor';
import { defaultScheduler, type Scheduler, type TimerHandle } from '../ports/scheduler';
import type { ScanRequest, DetectionResult } from '../domain/detection-types';
import type {
  RemovalTarget,
  RemovalOutcome,
  RemovalProgressEvent,
  RemoveSet,
} from '../domain/removal-types';
import { transition, type DetectionState } from '../domain/detection-state';
import { DetectionError, isDetectionError } from '../domain/detection-errors';
import { RemovalError } from '../domain/removal-errors';
import { computeRemoveSet } from '../domain/remove-set';
import { applyRemovalOutcome } from '../domain/apply-removal-outcome';

// ── Stall watchdog (FR-002 / NFR-007) ───────────────────────────────────────

/**
 * Per-batch stall window (NOT a backend SLA): the maximum time the store waits
 * for the executor to make **progress on a single batch** before it treats the
 * removal as hung. Re-scoped (ADR-0019) from "whole-removal elapsed" to "time
 * since the last `onProgress` event": each completed batch re-arms the window,
 * so a genuinely-progressing large removal is never aborted merely for taking
 * long (FR-002). Only a batch that makes no progress for the whole window — a
 * true hang — trips it. On a trip the store aborts the in-flight controller;
 * the executor then resolves with its accumulated host partial (FR-003), which
 * the store applies and stamps `provenance: 'stalled'` (R-3/T007).
 *
 * Tunable here; deliberately generous (data-model §5, research §R-1/§R-6).
 */
export const STALL_CEILING_MS = 30_000;

/**
 * A progress-resettable stall watchdog over the injected `scheduler`.
 *
 * `arm()` (re)starts the window; the store calls it once when the removal
 * begins and again on **every** `onProgress` event. If the window of `ms`
 * elapses without a re-arm, `onStall()` fires exactly once. `disarm()` cancels
 * any pending timer (called when the removal settles).
 *
 * `= ms` semantics: the timer fires when the scheduler reaches the window — the
 * boundary tests (T006) pin "29 999 continues / 30 000 trips / 30 001 trips".
 * No deadline-vs-settlement tie-break is asserted here; the watchdog is a
 * one-shot side effect, not a promise race (NFR-007 — the old `raceStallCeiling`
 * JSDoc claimed an unbacked tie-break; this design has no such claim).
 *
 * **Limit (FR-009 / RISK-1, honest scope):** `onStall` here aborts the shared
 * `AbortController`. That abort is observed only at a **batch boundary** — when
 * the executor next checks `signal` between batches — and a resolving executor
 * then returns its accumulated partial. The abort **cannot interrupt an
 * in-flight host await**: a host call that never settles (e.g. a hung network
 * request inside a batch) is not terminated by the watchdog. There is **no**
 * guarantee that a never-settling call terminates; in that case the row stays in
 * `removing` and route-reset (`reset()`) is the documented escape (ADR-0019).
 *
 * @param ms        - The per-batch window in milliseconds (`STALL_CEILING_MS`).
 * @param scheduler - Injected timer seam (deterministic under a fake in tests).
 * @param onStall   - Side effect run exactly once when the window elapses
 *                    without a re-arm (here: `controller.abort()`).
 * @returns `{ arm, disarm }` — `arm` re-starts the window; `disarm` cancels it.
 */
function createStallWatchdog(
  ms: number,
  scheduler: Scheduler,
  onStall: () => void,
): { arm: () => void; disarm: () => void } {
  let handle: TimerHandle | undefined;

  function disarm(): void {
    if (handle !== undefined) {
      scheduler.clearTimeout(handle);
      handle = undefined;
    }
  }

  function arm(): void {
    // Re-arming cancels any pending window and starts a fresh one, so at most
    // one timer is ever live — `onStall` fires at most once per window.
    disarm();
    handle = scheduler.setTimeout(() => {
      handle = undefined;
      onStall();
    }, ms);
  }

  return { arm, disarm };
}

// ── Public types ──────────────────────────────────────────────────────────────

/**
 * Per-row detection state alias. The store records one `DetectionRowState`
 * per canonical collection key (playlist URI or `'liked-songs'`).
 */
export type DetectionRowState = DetectionState;

/**
 * Public store shape consumed by UI selectors and the `RouteResetContext`.
 *
 * - `rows` — map keyed by canonical collection key; absent keys are implicitly
 *   `idle`.
 * - `scanCollection` — trigger a scan; aborts any in-flight scan on the same
 *   row first (FR-011 atomic replace).
 * - `cancelScan` — cancel an in-flight scan on one row; no-op otherwise.
 * - `reset` — lifecycle override: abort all in-flight scans, clear `rows`.
 *   Wired to `RouteResetContext` so navigation away discards all results (FR-012).
 *
 * @see data-model.md §8
 */
export type DetectionStoreState = {
  /** Map keyed by canonical collection key. Absent keys are implicitly `idle`. */
  rows: Readonly<Record<string, DetectionRowState>>;
  /**
   * Trigger a duplicate-detection scan on `collectionKey`. Aborts any in-flight
   * scan on the same row before starting, ensuring atomic replace (FR-011).
   *
   * No-op while the row is already scanning AND this is a re-entry from an older
   * in-flight async frame (the FSM rejects `start` from `scanning`). The button
   * is disabled by the UI as a first line of defense (FR-013).
   *
   * @param collectionKey — Canonical key: playlist URI or `'liked-songs'`.
   * @param request       — Discriminated payload forwarded to the scanner.
   */
  scanCollection(collectionKey: string, request: ScanRequest): Promise<void>;
  /**
   * Cancel an in-flight scan on `collectionKey`. Dispatches `cancel` to the FSM
   * regardless of whether a controller was present (covers `loaded`/`failed` rows
   * too — the FSM moves them to `idle`). No-op if the key has no row entry.
   *
   * @param collectionKey — Canonical key of the row to cancel.
   */
  cancelScan(collectionKey: string): void;
  /**
   * Lifecycle override — aborts every in-flight scan and clears all per-row
   * state. Wired to `RouteResetContext` so navigating away resets the page
   * to idle (FR-012). Synchronous; idempotent from `{}`.
   */
  reset(): void;
  /**
   * Open the first removal confirmation for `collectionKey` (FR-005). Pure FSM
   * dispatch of `removeRequest`: `loaded.none → confirming` and (retry)
   * `loaded.partial → confirming`. The FSM is the authority on which
   * transitions are ignored — it rejects the action while a confirm/remove is
   * already in flight (FR-012) and from any non-`loaded` row — so this method
   * carries no redundant guard. Makes **no** executor call (FR-007/FR-011).
   *
   * @param collectionKey — Canonical key: playlist URI or `'liked-songs'`.
   */
  requestRemoval(collectionKey: string): void;
  /**
   * Advance the removal flow for `collectionKey` and, once the user has cleared
   * the required confirmation(s), execute the deletion through the injected
   * `RemovalExecutor` (FR-003/FR-008).
   *
   * Orchestration (data-model §7): reads the row; no-ops unless it is `loaded`.
   * From `confirming` it derives `requiresSecondConfirm = removableTrackCount >
   * 25` (FR-006) — when `true` it shows the second dialog (`confirming2`) and
   * returns; when `false` it falls through to execute. From `confirming2` it
   * proceeds to execute. Any other phase is a no-op (covers concurrency and
   * late/invalid calls).
   *
   * Execution runs `computeRemoveSet → RemovalExecutor.remove →
   * applyRemovalOutcome → removeComplete`, applying the outcome exactly once
   * (guards the `outcome-mismatch` idempotence trap). A concurrent removal of
   * the same collection is rejected by a closure-level in-flight lock (FR-012).
   * A per-batch stall watchdog (FR-002) re-armed on each progress event aborts
   * a genuinely-hung removal; the executor then resolves with its accumulated
   * host partial (FR-003), stamped `provenance: 'stalled'`. A user
   * cancel/reset `AbortError` is swallowed; a whole-operation executor fault
   * yields `provenance: 'executor-failed'` (real RemoveSet refs); a
   * `computeRemoveSet` failure yields `provenance: 'compute-failed'` with no
   * fabricated track (FR-009). Provenance is a typed discriminator, not a
   * `reason`-string prefix (NFR-004).
   *
   * Fails loud with `RemovalError('executor-failed', …)` if execution is
   * reached while no `RemovalExecutor` was injected (production always injects
   * one; back-compat callers that never confirm-to-execute are unaffected).
   *
   * @param collectionKey — Canonical key of the row to remove from.
   * @returns A promise that resolves when the step (or execution) settles.
   */
  confirmRemoval(collectionKey: string): Promise<void>;
  /**
   * Dismiss an open removal confirmation for `collectionKey` (FR-007). Pure FSM
   * dispatch of `removeCancel`: `confirming|confirming2 → none`; ignored from
   * every other phase/state (the FSM is the authority). Removes **nothing** and
   * makes **no** executor call.
   *
   * @param collectionKey — Canonical key of the row whose dialog to dismiss.
   */
  cancelRemoval(collectionKey: string): void;
};

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Derive the `RemovalTarget` from a canonical collection key. The key already
 * encodes the collection: `'liked-songs'` is the Liked Songs library; anything
 * else is a playlist URI. Centralising the derivation here keeps the executor
 * call honest about single-collection scope (C-003) without threading a target
 * through every caller.
 *
 * @param key — Canonical collection key (playlist URI or `'liked-songs'`).
 * @returns The `RemovalTarget` for that key.
 */
function targetForKey(key: string): RemovalTarget {
  return key === 'liked-songs'
    ? { kind: 'liked-songs' }
    : { kind: 'playlist', playlistUri: key };
}

/**
 * Build a fresh detection store wired to the given scanner and (optionally) a
 * removal executor.
 *
 * The store starts with an empty `rows` map and makes no scanner call until
 * `scanCollection` is invoked, and **no** executor call until an explicit
 * `confirmRemoval` reaches execution — preserving the explicit-action /
 * no-auto-run invariant (FR-010 / FR-011 / C-002 / C-004).
 *
 * `removalExecutor` is an **optional** second parameter so existing callers
 * (`createDetectionStore(scanner)` in tests and the legacy `app.tsx` wiring)
 * keep compiling. When it is `undefined`, `requestRemoval`/`cancelRemoval`
 * (pure FSM dispatches) still work, but a `confirmRemoval` that reaches
 * execution fails loud with `RemovalError('executor-failed', …)`. Production
 * (`app.tsx`, WP07) always injects a `SpicetifyRemovalExecutor`.
 *
 * @param scanner — `DetectionScanner` implementation to delegate scans to.
 * @param removalExecutor — Optional `RemovalExecutor` the removal flow deletes
 *   through. Defaults to `undefined` (back-compat); execution then fails loud.
 * @param scheduler — Optional `Scheduler` timer seam backing the stall ceiling
 *   (NFR-001). Defaults to `defaultScheduler` (real platform timers); tests
 *   inject a deterministic double. Third optional parameter so every existing
 *   caller (`app.tsx`, store tests) keeps compiling (data-model §3).
 * @returns Vanilla Zustand `StoreApi<DetectionStoreState>`.
 */
export function createDetectionStore(
  scanner: DetectionScanner,
  removalExecutor?: RemovalExecutor,
  scheduler: Scheduler = defaultScheduler,
): StoreApi<DetectionStoreState> {
  // Closure-level AbortController map — NOT part of public Zustand state
  // because React should not observe controller lifecycle; only `rows` (the
  // FSM states) needs to be observed by subscribers.
  const controllers: Record<string, AbortController> = {};

  // Closure-level in-flight guard for removals, mirroring `controllers`. An
  // entry exists for the duration of a `confirmRemoval` execution; its presence
  // is the concurrency lock that prevents overlapping removals of the same
  // collection (FR-012).
  const removalControllers: Record<string, AbortController> = {};

  return createStore<DetectionStoreState>((set, get) => {
    /**
     * Apply `action` to the row identified by `key` and update `rows`
     * immutably. Reads the current row state (defaulting to `idle` for
     * absent keys) then calls `transition`.
     */
    function dispatch(
      key: string,
      action: Parameters<typeof transition>[1],
    ): void {
      const current = get().rows[key] ?? { kind: 'idle' as const };
      const next = transition(current, action);
      set((state) => ({ rows: { ...state.rows, [key]: next } }));
    }

    return {
      rows: {},

      async scanCollection(key, request) {
        // Abort any in-flight scan on this row (FR-011 atomic replace).
        if (controllers[key]) {
          controllers[key].abort();
        }

        // Allocate a fresh controller for this scan.
        const controller = new AbortController();
        controllers[key] = controller;

        // Transition the row to scanning.
        dispatch(key, { type: 'start' });

        try {
          const result = await scanner.scan(
            request,
            controller.signal,
            (event) => dispatch(key, { type: 'progress', event }),
          );
          dispatch(key, { type: 'complete', result });
        } catch (e) {
          // AbortError: the cancel/reset already moved the row to idle.
          // Do NOT dispatch fail — just return.
          if (e instanceof DOMException && e.name === 'AbortError') {
            return;
          }
          // DetectionError: pass through.
          // Anything else: an unexpected non-`DetectionError` throw is an
          // honest INTERNAL fault in the scan pipeline (FR-004) — NOT a Spotify
          // / catalog rejection (the live, inline-enricher pipeline performs no
          // catalog lookup, ADR-0011). Wrap it as `internal-error`; no
          // `context.status` is plumbed (FR-008 — nothing reads it).
          const reason = isDetectionError(e)
            ? e
            : new DetectionError(
                'internal-error',
                'an unexpected internal error occurred during the scan',
                { cause: e },
              );
          dispatch(key, { type: 'fail', reason });
        } finally {
          // Guard: only delete if we still own the entry (prevents an
          // overlapping scan's AbortController from being deleted if this
          // `finally` runs after a re-trigger replaced `controllers[key]`).
          if (controllers[key] === controller) {
            delete controllers[key];
          }
        }
      },

      cancelScan(key) {
        // Abort and remove the controller if one exists.
        if (controllers[key]) {
          controllers[key].abort();
          delete controllers[key];
        }
        // Dispatch cancel to the FSM for every row that exists (covers
        // loaded and failed rows that have no controller but whose FSM
        // should move to idle on explicit cancel).
        if (get().rows[key] !== undefined) {
          dispatch(key, { type: 'cancel' });
        }
      },

      reset() {
        // PLACEMENT (NFR-008 / ADR-0005 / ADR-0019): `reset()` is a deliberate
        // lifecycle OVERRIDE, not a per-row FSM transition. It aborts every
        // in-flight controller and clears `rows` directly — there is no
        // `transition()` action with a per-row edge for "discard everything",
        // because reset is a whole-store boundary event (route change / unmount,
        // ADR-0005) rather than a state machine step on any single row. Reasoning
        // about reachable per-row lifecycle therefore never needs to account for
        // a `reset` edge; it sits outside the transition tables on purpose.
        // No structural change here — see ADR-0019 §reset() for the rationale.

        // Abort ALL in-flight scan controllers first.
        for (const key of Object.keys(controllers)) {
          controllers[key].abort();
          delete controllers[key];
        }
        // Abort ALL in-flight removal controllers too — navigating away must not
        // leave a removal running (FR-012). The aborted executor resolves with
        // its accumulated host partial (FR-003); the resulting late
        // `removeComplete` targets a now-cleared row, which the FSM ignores
        // (own-entry guard). Clearing the map here also releases the lock so a
        // fresh scan/removal can proceed.
        for (const key of Object.keys(removalControllers)) {
          removalControllers[key].abort();
          delete removalControllers[key];
        }
        // Clear all row state atomically.
        set({ rows: {} });
      },

      requestRemoval(key) {
        // Pure FSM dispatch — the FSM ignores this from non-`loaded` rows and
        // from confirming/confirming2/removing phases (FR-012). No executor
        // call (FR-007/FR-011).
        dispatch(key, { type: 'removeRequest' });
      },

      cancelRemoval(key) {
        // Pure FSM dispatch — confirming|confirming2 → none; ignored elsewhere.
        // Nothing is removed and no executor call is made (FR-007).
        dispatch(key, { type: 'removeCancel' });
      },

      async confirmRemoval(key) {
        // 1. Read the row. Only a `loaded` row has a removal phase to advance;
        //    anything else (idle/scanning/failed/absent) is a late/invalid call.
        const row = get().rows[key];
        if (row?.kind !== 'loaded') return;
        const result = row.result;
        const phase = row.removal.phase;

        // 2. Concurrency lock — if a removal for this key is already running,
        //    bail before touching the FSM (FR-012). This is the single
        //    authority that prevents overlapping executes of the same
        //    collection, independent of FSM phase (a `removing`-phase re-entry
        //    is caught here).
        if (removalControllers[key]) return;

        // 3. Two-step confirmation branch (data-model §7).
        if (phase === 'confirming') {
          // The store holds the count, so it derives the > 25 discriminator and
          // hands the FSM a pure boolean (FR-006). Boundary: 24/25 → false
          // (execute now); 26 → true (show the second dialog).
          const requiresSecondConfirm = result.removableTrackCount > 25;
          dispatch(key, { type: 'confirmFirst', requiresSecondConfirm });
          // Bulk delete: stop here — the second dialog re-calls confirmRemoval.
          if (requiresSecondConfirm) return;
          // else fall through to execute (now `removing`).
        } else if (phase === 'confirming2') {
          dispatch(key, { type: 'confirmSecond' });
          // fall through to execute (now `removing`).
        } else {
          // none / removing / partial → no-op (invalid call; `removing` here
          // means a removal raced in without holding the lock, which cannot
          // happen — the lock above already returned — so this covers the
          // none/partial late-call cases).
          return;
        }

        // 4. No-executor guard — fail loud BEFORE allocating a controller so
        //    nothing is half-initialised. Production always injects one.
        if (removalExecutor === undefined) {
          throw new RemovalError(
            'executor-failed',
            'no RemovalExecutor configured',
          );
        }

        // 5. Claim the in-flight slot with a fresh controller and execute.
        const controller = new AbortController();
        removalControllers[key] = controller;
        const target = targetForKey(key);

        try {
          // 6a. Compute the RemoveSet EXACTLY ONCE, structurally (T008 / R-8):
          //     the set is computed here and threaded as a parameter into the
          //     execute helper, so the failure path **cannot** re-invoke
          //     `computeRemoveSet` (the ADR-0017 Defect A invariant becomes a
          //     signature-level one). A compute failure is its own terminal
          //     outcome (FR-009) — no host call, no fabricated track.
          let removeSet: RemoveSet;
          try {
            removeSet = computeRemoveSet(result, target);
          } catch {
            // Compute-failed: no host call, nothing removed. Pass `result`
            // through UNCHANGED — do NOT run `applyRemovalOutcome`, whose
            // member-keying would itself throw on the same malformed members
            // (e.g. a missing `uid`) that failed the compute (FR-009 / Defect A).
            dispatch(key, {
              type: 'removeComplete',
              result,
              outcome: computeFailedOutcome(),
            });
            return;
          }

          // 6b. Execute the (already-computed) RemoveSet against the executor,
          //     bounded by the per-batch stall watchdog (FR-002), and apply the
          //     resulting outcome with its stamped provenance (FR-003/T007).
          await executeRemoveSet({
            dispatch,
            key,
            result,
            target,
            removeSet,
            executor: removalExecutor,
            controller,
            scheduler,
          });
        } finally {
          // Only delete if we still own the entry (mirror scanCollection's
          // own-entry guard against an overlapping replacement).
          if (removalControllers[key] === controller) {
            delete removalControllers[key];
          }
        }
      },
    };
  });
}

// ── confirmRemoval execute helpers (T008 / NFR-003) ─────────────────────────

/** The `dispatch` closure shape `confirmRemoval`'s helpers consume. */
type RowDispatch = (
  key: string,
  action:
    | { type: 'removeProgress'; event: RemovalProgressEvent }
    | { type: 'removeComplete'; result: DetectionResult; outcome: RemovalOutcome },
) => void;

/**
 * Synthesise the truthful **compute-failed** outcome (FR-009 / R-3): no host
 * call was made, so nothing was removed and nothing failed. It fabricates **no**
 * `TrackRef` — in particular it never names the collection URI / `'liked-songs'`
 * sentinel as a "track". `reason` strings are diagnostics only.
 *
 * @returns A `provenance: 'compute-failed'` outcome with empty partitions.
 */
function computeFailedOutcome(): RemovalOutcome {
  return { removed: [], failed: [], provenance: 'compute-failed' };
}

/**
 * Synthesise an **executor-failed** outcome from a whole-operation executor
 * fault (R-3): nothing removed; every requested track from the *real* RemoveSet
 * lands in `failed` (never synthesised from a collection URI). `reason` carries
 * a human diagnostic only — provenance is the typed control signal (NFR-004).
 *
 * @param removeSet - The already-computed RemoveSet (the real TrackRefs).
 * @param cause     - The originating executor rejection, preserved as diagnostic.
 * @returns A `provenance: 'executor-failed'` all-failed outcome.
 */
function executorFailedOutcome(removeSet: RemoveSet, cause: unknown): RemovalOutcome {
  // `RemovalError extends Error`, so the `instanceof Error` test covers both.
  const message = cause instanceof Error ? cause.message : String(cause);
  return {
    removed: [],
    failed: removeSet.tracks.map((track) => ({ track, reason: message })),
    provenance: 'executor-failed',
  };
}

/**
 * Apply a terminal `RemovalOutcome` to the row and dispatch the terminal
 * `removeComplete` (T007). This is the single apply path for **every** terminal
 * outcome `executeRemoveSet` produces, not only the empty-`removed` ones:
 *
 * - **host-success** (`provenance: 'host'`, `removed` non-empty) — the executor
 *   resolved with the tracks it actually deleted.
 * - **stalled-partial** (`provenance: 'stalled'`) — a resolving executor's
 *   accumulated host partial re-stamped on a watchdog trip; `removed` may be
 *   non-empty (FR-003 — never forced to `[]`).
 * - **stalled-reject** (`provenance: 'stalled'`, `removed: []`) — a defensive
 *   executor that rejected `AbortError` after the watchdog tripped (FR-008).
 * - **executor-failed** / **compute-failed** (`removed: []`) — synthesised
 *   all-failed / no-op outcomes.
 *
 * So `removed` is **not** always empty. The no-throw guarantee does not rest on
 * emptiness: every key in `outcome.removed` is, **by construction**, a real
 * member of `result` (host-success/stalled-partial removed sets come from the
 * executor acting on `removeSet`, which was derived from `result`; the
 * synthesised outcomes carry `removed: []`). `applyRemovalOutcome` therefore
 * never encounters a removed key absent from `result`, so it cannot throw
 * `outcome-mismatch`; the row's counts stay truthful.
 *
 * @param dispatch - The row dispatch closure.
 * @param key      - The collection key.
 * @param result   - The pre-removal `DetectionResult`.
 * @param target   - The removal target (selects the apply key function).
 * @param outcome  - The terminal outcome (`removed` may be non-empty).
 */
function applyTerminalOutcome(
  dispatch: RowDispatch,
  key: string,
  result: DetectionResult,
  target: RemovalTarget,
  outcome: RemovalOutcome,
): void {
  const updated = applyRemovalOutcome(result, outcome, target);
  dispatch(key, { type: 'removeComplete', result: updated, outcome });
}

/**
 * Run the (already-computed) RemoveSet against the executor under the per-batch
 * stall watchdog, then apply the resulting outcome with truthful provenance.
 *
 * Outcomes (T007 / FR-008):
 * - executor resolves, watchdog never tripped → pass the executor's `'host'`
 *   outcome through (full or boundary-abort partial — FR-003).
 * - watchdog tripped, executor **resolves** → the boundary abort made the
 *   executor return its accumulated host partial; re-stamp it `'stalled'` and
 *   apply it (FR-003 — `removed` is never forced to `[]`).
 * - watchdog tripped, executor **rejects** `AbortError` → a defensive executor
 *   threw on abort instead of resolving; synthesise an all-failed terminal
 *   `'stalled'` outcome so the row still terminates (FR-008 — no stuck row).
 * - executor rejects `AbortError` with the watchdog **not** tripped → a user
 *   cancel/reset moved the row; swallow (the row already left `removing`).
 * - executor rejects otherwise → `'executor-failed'` (real RemoveSet refs).
 *
 * **Termination limit (FR-009 / RISK-1, honest):** the watchdog's abort is
 * observed only at **batch boundaries** (see `createStallWatchdog`). It cannot
 * interrupt an in-flight host await, so a genuinely never-settling host call is
 * **not** guaranteed to terminate — the row stays in `removing` until a
 * route-reset (`reset()`) discards it (ADR-0019). The watchdog guards a hang
 * *between* batches, not *within* one.
 *
 * Compute-once is structural: this helper receives `removeSet` as a parameter
 * and never calls `computeRemoveSet` (ADR-0017 / T008).
 */
async function executeRemoveSet(args: {
  dispatch: RowDispatch;
  key: string;
  result: DetectionResult;
  target: RemovalTarget;
  removeSet: RemoveSet;
  executor: RemovalExecutor;
  controller: AbortController;
  scheduler: Scheduler;
}): Promise<void> {
  const { dispatch, key, result, target, removeSet, executor, controller, scheduler } = args;

  // The watchdog re-arms on each batch progress (FR-002). A trip marks the
  // termination as a stall so the resolved partial is re-stamped `'stalled'`.
  let stalled = false;
  const watchdog = createStallWatchdog(STALL_CEILING_MS, scheduler, () => {
    stalled = true;
    controller.abort();
  });
  watchdog.arm();

  try {
    const outcome = await executor.remove(
      target,
      removeSet.tracks,
      controller.signal,
      (event) => {
        // A completed batch is progress → re-arm the stall window.
        watchdog.arm();
        dispatch(key, { type: 'removeProgress', event });
      },
    );

    if (stalled) {
      // The watchdog aborted; the executor resolved with its accumulated host
      // partial. Re-stamp `'stalled'` (FR-003 — never force `removed: []`).
      const stalledOutcome: RemovalOutcome = { ...outcome, provenance: 'stalled' };
      applyTerminalOutcome(dispatch, key, result, target, stalledOutcome);
      return;
    }

    // Host-truthful outcome (full completion or boundary-abort partial).
    applyTerminalOutcome(dispatch, key, result, target, outcome);
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      // Two abort sources reach here, distinguished by the `stalled` trip flag:
      //
      // - watchdog-stalled (`stalled === true`): the abort came from the stall
      //   watchdog and a defensive executor *rejected* `AbortError` instead of
      //   resolving its accumulated partial (the `if (stalled)` resolve path
      //   above handles the resolving executor). Without this branch no
      //   `removeComplete` would
      //   be dispatched and the row would stay stuck on `removing` (FR-008). The
      //   rejection carries no host partial, so synthesise the truthful
      //   all-failed terminal `'stalled'` outcome (`removed: []`, every requested
      //   track `failed`) — routed to `partial` by the FSM.
      // - user cancel/reset (`stalled === false`): the row already moved away
      //   (the FSM's own-entry guard would ignore a late `removeComplete`), so
      //   swallow — dispatching nothing is correct.
      if (stalled) {
        applyTerminalOutcome(dispatch, key, result, target, {
          removed: [],
          failed: removeSet.tracks.map((track) => ({
            track,
            reason: 'removal aborted while stalled',
          })),
          provenance: 'stalled',
        });
      }
      return;
    }
    // A whole-operation executor fault → executor-failed (real RemoveSet refs).
    applyTerminalOutcome(dispatch, key, result, target, executorFailedOutcome(removeSet, e));
  } finally {
    watchdog.disarm();
  }
}

// ── Hook factory ──────────────────────────────────────────────────────────────

/**
 * Bind a selector-based React hook to a concrete store instance.
 *
 * WP09 builds the production singleton via
 * `createDetectionStore(createDetectionScanner(…))` and calls this helper to
 * expose `useDetectionStore` for UI consumers.
 *
 * Exporting a factory rather than a module-level singleton hook keeps this file
 * free of host-side construction side-effects (the Spicetify entry point is the
 * only place authorised to instantiate the production scanner).
 *
 * @param store — `StoreApi<DetectionStoreState>` instance to bind.
 * @returns A selector hook: `<T>(selector: (s) => T) => T`.
 */
export function bindDetectionHook(store: StoreApi<DetectionStoreState>) {
  return function useDetectionStore<T>(
    selector: (state: DetectionStoreState) => T,
  ): T {
    return useStore(store, selector);
  };
}
