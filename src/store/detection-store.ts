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
 * - Wrap non-`DetectionError` throws in `DetectionError('catalog-rejected', …)`.
 *
 * Architecture: `src/store/` may import from `src/domain/` and `src/ports/` only
 * (ADR-0001, `test/architecture.test.ts`).
 */

import { createStore, type StoreApi } from 'zustand/vanilla';
import { useStore } from 'zustand';
import type { DetectionScanner } from '../ports/detection-scanner';
import type { RemovalExecutor } from '../ports/removal-executor';
import type { ScanRequest } from '../domain/detection-types';
import type { RemovalTarget, RemovalOutcome } from '../domain/removal-types';
import { transition, type DetectionState } from '../domain/detection-state';
import { DetectionError, isDetectionError } from '../domain/detection-errors';
import { RemovalError, isRemovalError } from '../domain/removal-errors';
import { computeRemoveSet } from '../domain/remove-set';
import { applyRemovalOutcome } from '../domain/apply-removal-outcome';

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
   * An `AbortError` is swallowed; any other throw is wrapped as
   * `RemovalError('executor-failed', …)` and surfaced as an **all-failed**
   * `partial` so the copies stay visible (AS-8).
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
 * @returns Vanilla Zustand `StoreApi<DetectionStoreState>`.
 */
export function createDetectionStore(
  scanner: DetectionScanner,
  removalExecutor?: RemovalExecutor,
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
          // Anything else: wrap as catalog-rejected (defensive guard).
          const reason = isDetectionError(e)
            ? e
            : new DetectionError(
                'catalog-rejected',
                'scanner.scan threw a non-DetectionError',
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
        // Abort ALL in-flight scan controllers first.
        for (const key of Object.keys(controllers)) {
          controllers[key].abort();
          delete controllers[key];
        }
        // Abort ALL in-flight removal controllers too — navigating away must
        // not leave a removal running (FR-012). The aborted executor rejects
        // with AbortError, which `confirmRemoval`'s catch swallows; clearing the
        // map here also releases the lock so a fresh scan/removal can proceed.
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

        // 5. Claim the in-flight slot with a fresh controller.
        const controller = new AbortController();
        removalControllers[key] = controller;

        try {
          // 6. Execute: compute → remove → apply → complete.
          const target = targetForKey(key);
          const removeSet = computeRemoveSet(result, target);
          const outcome = await removalExecutor.remove(
            target,
            removeSet.tracks,
            controller.signal,
            (event) => dispatch(key, { type: 'removeProgress', event }),
          );
          // Apply the outcome exactly once (idempotence guard vs WP02's
          // `outcome-mismatch` trap).
          const updated = applyRemovalOutcome(result, outcome, target);
          dispatch(key, { type: 'removeComplete', result: updated, outcome });
        } catch (e) {
          // AbortError: a cancel/reset moved the row; do not dispatch a failure.
          if (e instanceof DOMException && e.name === 'AbortError') {
            return;
          }
          // Wrap non-`RemovalError` throws for diagnostics, then surface the
          // fault as an all-failed `partial` (AS-8 — "surfaced, not swallowed"):
          // every requested track lands in `failed`, none in `removed`, so the
          // row shows `partial` and the copies stay visible. `removableTrackCount`
          // is unchanged because `applyRemovalOutcome` drops nothing.
          const reason = isRemovalError(e)
            ? e
            : new RemovalError(
                'executor-failed',
                'RemovalExecutor.remove threw a non-RemovalError',
                { cause: e },
              );
          const removeSet = computeRemoveSet(result, targetForKey(key));
          const allFailed: RemovalOutcome = {
            removed: [],
            failed: removeSet.tracks.map((track) => ({
              track,
              reason: `executor-failed: ${reason.message}`,
            })),
          };
          const unchanged = applyRemovalOutcome(
            result,
            allFailed,
            targetForKey(key),
          );
          dispatch(key, {
            type: 'removeComplete',
            result: unchanged,
            outcome: allFailed,
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
