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
import type { ScanRequest } from '../domain/detection-types';
import { transition, type DetectionState } from '../domain/detection-state';
import { DetectionError, isDetectionError } from '../domain/detection-errors';

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
};

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Build a fresh detection store wired to the given scanner.
 *
 * The store starts with an empty `rows` map and makes no scanner call until
 * `scanCollection` is invoked, preserving the explicit-action invariant
 * (FR-010 / C-004).
 *
 * @param scanner — `DetectionScanner` implementation to delegate scans to.
 * @returns Vanilla Zustand `StoreApi<DetectionStoreState>`.
 */
export function createDetectionStore(
  scanner: DetectionScanner,
): StoreApi<DetectionStoreState> {
  // Closure-level AbortController map — NOT part of public Zustand state
  // because React should not observe controller lifecycle; only `rows` (the
  // FSM states) needs to be observed by subscribers.
  const controllers: Record<string, AbortController> = {};

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
        // Abort ALL in-flight controllers first.
        for (const key of Object.keys(controllers)) {
          controllers[key].abort();
          delete controllers[key];
        }
        // Clear all row state atomically.
        set({ rows: {} });
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
