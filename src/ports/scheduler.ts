/**
 * Port contract for the timer seam.
 *
 * Layer: `src/ports/` — may import from `src/domain/` only. This file imports
 * nothing, so it is trivially within the layer rule.
 *
 * `Scheduler` exists so the removal store's stall ceiling is deterministically
 * testable: production wires `defaultScheduler` (real platform timers), while
 * tests inject a controllable double (or drive `defaultScheduler` under
 * `vi.useFakeTimers()`). This mirrors the injected `clock = Date.now` default
 * of `createDetectionScanner` (`src/adapters/detection-scanner.ts`) — a real
 * dependency given a production default, swapped out for determinism in tests.
 *
 * `AbortSignal.timeout` was deliberately rejected for this seam (research §R-6)
 * because it cannot be advanced deterministically under fake timers.
 *
 * Architecture constraint (`test/architecture.test.ts`):
 * `src/ports/` must not import from `src/adapters/`, `src/store/`, or `src/ui/`.
 */

/** Minimal timer seam so the stall ceiling is deterministically testable. */
export interface Scheduler {
  /** Schedule `fn` after `ms`; returns a handle for cancellation. */
  setTimeout(fn: () => void, ms: number): TimerHandle;
  /** Cancel a pending timer (no-op if already fired/cleared). */
  clearTimeout(handle: TimerHandle): void;
}

/**
 * Opaque handle returned by {@link Scheduler.setTimeout} and consumed by
 * {@link Scheduler.clearTimeout}. Aliases the platform timer-id type so the
 * default delegates without casts and tests can model their own handles.
 */
export type TimerHandle = ReturnType<typeof setTimeout>;

/** Production default: delegates to the platform's real timers. */
export const defaultScheduler: Scheduler = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h),
};
