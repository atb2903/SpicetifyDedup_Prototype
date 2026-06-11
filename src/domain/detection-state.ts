/**
 * Per-collection detection state FSM.
 *
 * Pure data + a pure `transition` function. No React, no Zustand, no
 * Spicetify — tests run without happy-dom. The store (WP06) wires this up
 * to UI dispatches via `createDetectionStore`.
 *
 * The transition table is specified in data-model.md §5.3; this file
 * implements that table exactly, including all "ignored" cells which return
 * the input state by reference (no allocation — defensive against dispatch
 * races that would otherwise trigger spurious subscriber updates).
 *
 * Architectural constraint (ADR-0001 / test/architecture.test.ts):
 * `src/domain/` may only import other `src/domain/` files.
 */

import type { ProgressEvent, DetectionResult } from './detection-types';
import type { DetectionError } from './detection-errors';

// ── §5.1 — DetectionState ────────────────────────────────────────────────────

/**
 * Discriminated union of all per-collection detection states.
 *
 * - `idle`     — no scan requested or scan was cancelled. No payload.
 * - `scanning` — a scan is in flight. Carries the latest `ProgressEvent`
 *                so subscribers can render live progress bars.
 * - `loaded`   — scan completed successfully. Carries the full
 *                `DetectionResult` payload (groups + counts).
 * - `failed`   — scan ended in an unrecoverable error. Carries the
 *                `DetectionError` for UI rendering and diagnostics.
 *
 * Narrow by `kind` to access the variant's payload:
 * ```ts
 * if (state.kind === 'scanning') { state.progress; }
 * ```
 */
export type DetectionState =
  | { kind: 'idle' }
  | { kind: 'scanning'; progress: ProgressEvent }
  | { kind: 'loaded'; result: DetectionResult }
  | { kind: 'failed'; reason: DetectionError };

// ── §5.2 — DetectionAction ───────────────────────────────────────────────────

/**
 * Discriminated union of all actions that can be dispatched into the FSM.
 *
 * - `start`    — user requested a new scan. Valid from `idle`, `loaded`, and
 *                `failed`; ignored from `scanning` (the store gates this at
 *                the store level; the UI disables the button per FR-013).
 * - `progress` — scan emitted a `ProgressEvent`. Valid only from `scanning`;
 *                ignored from all other states (protects against late
 *                callbacks after `cancel`).
 * - `complete` — scan produced a `DetectionResult`. Valid only from
 *                `scanning`; ignored elsewhere.
 * - `fail`     — scan ended with a `DetectionError`. Valid only from
 *                `scanning`; ignored elsewhere.
 * - `cancel`   — unconditionally resets the row to `idle`, regardless of
 *                current state (FR-012). The store also aborts the in-flight
 *                signal before dispatching this.
 */
export type DetectionAction =
  | { type: 'start' }
  | { type: 'progress'; event: ProgressEvent }
  | { type: 'complete'; result: DetectionResult }
  | { type: 'fail'; reason: DetectionError }
  | { type: 'cancel' };

// ── §5.3 / §5.4 — transition ─────────────────────────────────────────────────

/**
 * Pure FSM transition function. Implements the 4×5 transition table from
 * data-model.md §5.3.
 *
 * Contract:
 * - Never mutates `state`.
 * - Returns a new object for every "active" cell (a transition that changes
 *   state or payload).
 * - Returns `state` by reference for every "ignored" cell (no change) so
 *   subscribers skip unnecessary re-renders.
 * - `cancel` always returns `{ kind: 'idle' }` — no condition guards it
 *   (FR-012).
 *
 * @param state  - Current `DetectionState` for this row.
 * @param action - Action dispatched into the FSM.
 * @returns      The next `DetectionState` — may be the same reference as
 *               `state` if the (state, action) pair is "ignored".
 */
export function transition(
  state: DetectionState,
  action: DetectionAction,
): DetectionState {
  // `cancel` is unconditional — resets any state to idle (FR-012).
  if (action.type === 'cancel') return { kind: 'idle' };

  switch (state.kind) {
    case 'idle':
      if (action.type === 'start')
        return {
          kind: 'scanning',
          progress: { stage: 'enumerating', processed: 0, total: null },
        };
      // progress / complete / fail from idle are ignored (protects against
      // late callbacks arriving after cancel — R-003).
      return state;

    case 'scanning':
      switch (action.type) {
        case 'progress':
          // Allocate a new state so subscribers detect the change;
          // the inner `progress` is the action's event by reference.
          return { kind: 'scanning', progress: action.event };
        case 'complete':
          return { kind: 'loaded', result: action.result };
        case 'fail':
          return { kind: 'failed', reason: action.reason };
        default:
          // `start` from scanning is ignored; the store prevents double-scan
          // at its level; the UI disables the button (defense in depth).
          return state;
      }

    case 'loaded':
    case 'failed':
      // `start` re-triggers the scan (FR-011 explicit re-scan flow).
      // The store aborts the prior signal before dispatching.
      if (action.type === 'start')
        return {
          kind: 'scanning',
          progress: { stage: 'enumerating', processed: 0, total: null },
        };
      // progress / complete / fail from terminal states are ignored.
      return state;
  }
}
