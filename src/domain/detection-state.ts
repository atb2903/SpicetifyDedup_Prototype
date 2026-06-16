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
import type { RemovalOutcome, RemovalProgressEvent } from './removal-types';

// ── §5 — RemovalState ────────────────────────────────────────────────────────

/**
 * The removal sub-state nested on the `loaded` detection state (ADR-0013).
 * Models the confirm → (confirm again) → remove → outcome flow for one
 * collection. Lives only inside `loaded`; a row that is not `loaded` has no
 * removal phase.
 *
 * Phases:
 * - `none`        — no removal in progress (initial, and after a clean finish).
 * - `confirming`  — first confirmation dialog shown (FR-005).
 * - `confirming2` — second confirmation shown for bulk deletes > 25 (FR-006).
 * - `removing`    — a removal is executing; `progress` updates per batch
 *                   (NFR-002). Reachable **only** via a user confirm action —
 *                   see the no-auto-run guarantee on `transition`.
 * - `partial`     — the removal finished with at least one failure (FR-010 /
 *                   AS-8); `outcome.failed` lists what could not be deleted so
 *                   the UI keeps those copies visible.
 */
export type RemovalState =
  | { phase: 'none' }
  | { phase: 'confirming' }
  | { phase: 'confirming2' }
  | { phase: 'removing'; progress?: RemovalProgressEvent }
  | { phase: 'partial'; outcome: RemovalOutcome };

// ── §5.1 — DetectionState ────────────────────────────────────────────────────

/**
 * Discriminated union of all per-collection detection states.
 *
 * - `idle`     — no scan requested or scan was cancelled. No payload.
 * - `scanning` — a scan is in flight. Carries the latest `ProgressEvent`
 *                so subscribers can render live progress bars.
 * - `loaded`   — scan completed successfully. Carries the full
 *                `DetectionResult` payload (groups + counts) **and** the
 *                nested `RemovalState` (initially `{ phase: 'none' }`), so the
 *                removal flow lives entirely within `loaded`.
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
  | { kind: 'loaded'; result: DetectionResult; removal: RemovalState }
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
 *
 * Removal sub-actions (valid **only** from `loaded`; ignored from
 * `idle`/`scanning`/`failed` — late-callback safety):
 * - `removeRequest`  — user clicked "Remove duplicates". `none → confirming`;
 *                      `partial → confirming` (retry the still-present copies).
 *                      Ignored while a confirm/remove is already in flight
 *                      (FR-012).
 * - `confirmFirst`   — user confirmed the first dialog. Carries
 *                      `requiresSecondConfirm`, a boolean the **store** derives
 *                      from `result.removableTrackCount > 25` (FR-006). Keeping
 *                      the count→boolean mapping in the store leaves this
 *                      branch pure in the FSM: `true → confirming2`,
 *                      `false → removing`.
 * - `confirmSecond`  — user confirmed the bulk-delete second dialog.
 *                      `confirming2 → removing`.
 * - `removeCancel`   — user dismissed a confirm dialog. `confirming` /
 *                      `confirming2 → none` (FR-007 — nothing removed).
 * - `removeProgress` — executor reported batch progress. `removing → removing`.
 * - `removeComplete` — removal finished. Carries the already-applied
 *                      `applyRemovalOutcome` `result` (the store computes it)
 *                      and the `outcome`. Routes on `outcome.provenance`
 *                      (NOT on `failed.length` alone): `'compute-failed'`,
 *                      `'stalled'`, and `'executor-failed'` always go to
 *                      `partial` (so their copy is reachable — FR-003/FR-009);
 *                      only `'host'` keeps the `failed.length === 0 → none`
 *                      full-success rule, else `partial`.
 */
export type DetectionAction =
  | { type: 'start' }
  | { type: 'progress'; event: ProgressEvent }
  | { type: 'complete'; result: DetectionResult }
  | { type: 'fail'; reason: DetectionError }
  | { type: 'cancel' }
  // ── removal sub-actions ──
  | { type: 'removeRequest' }
  | { type: 'confirmFirst'; requiresSecondConfirm: boolean }
  | { type: 'confirmSecond' }
  | { type: 'removeCancel' }
  | { type: 'removeProgress'; event: RemovalProgressEvent }
  | { type: 'removeComplete'; result: DetectionResult; outcome: RemovalOutcome };

// ── §5.3 / §5.4 — transition ─────────────────────────────────────────────────

/**
 * Pure FSM transition function. Implements the scan transition table from
 * data-model.md §5.3 plus the removal sub-FSM from §5.1.
 *
 * Contract:
 * - Never mutates `state`.
 * - Returns a new object for every "active" cell (a transition that changes
 *   state or payload).
 * - Returns `state` by reference for every "ignored" cell (no change) so
 *   subscribers skip unnecessary re-renders.
 * - `cancel` always returns `{ kind: 'idle' }` — no condition guards it
 *   (FR-012); it resets the whole row regardless of removal phase.
 * - Removal sub-actions are valid **only** from `loaded`; from
 *   `idle`/`scanning`/`failed` they return the input by reference.
 *
 * No-auto-run guarantee (FR-011): there is **no** time-, mount-, or
 * completion-triggered edge into `removing`. The only transitions that reach
 * `removing` are `confirmFirst` with `requiresSecondConfirm: false` and
 * `confirmSecond` — both originate from an explicit user click. A removal can
 * therefore never start without user action.
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
      // progress / complete / fail / removal-actions from idle are ignored
      // (protects against late callbacks arriving after cancel — R-003).
      return state;

    case 'scanning':
      switch (action.type) {
        case 'progress':
          // Allocate a new state so subscribers detect the change;
          // the inner `progress` is the action's event by reference.
          return { kind: 'scanning', progress: action.event };
        case 'complete':
          // The only site that constructs a `loaded` literal — initialize the
          // nested removal sub-state to `none`.
          return { kind: 'loaded', result: action.result, removal: { phase: 'none' } };
        case 'fail':
          return { kind: 'failed', reason: action.reason };
        default:
          // `start` from scanning (and any removal action) is ignored; the
          // store prevents double-scan at its level; the UI disables the
          // button (defense in depth).
          return state;
      }

    case 'loaded':
      // `start` re-triggers the scan (explicit re-scan flow), discarding any
      // removal sub-state. The store aborts the prior signal before dispatching.
      if (action.type === 'start')
        return {
          kind: 'scanning',
          progress: { stage: 'enumerating', processed: 0, total: null },
        };
      // progress / complete / fail are ignored from loaded; removal actions
      // drive the nested removal sub-FSM.
      return transitionRemoval(state, action);

    case 'failed':
      // `start` re-triggers the scan (FR-011 explicit re-scan flow).
      if (action.type === 'start')
        return {
          kind: 'scanning',
          progress: { stage: 'enumerating', processed: 0, total: null },
        };
      // progress / complete / fail / removal-actions from failed are ignored.
      return state;
  }
}

/**
 * Removal sub-FSM applied to a `loaded` state. Implements the §5.1 table cell
 * for cell. Every active cell allocates a fresh `loaded` object with a fresh
 * `removal` object; every ignored cell returns `state` by reference so no
 * spurious subscriber re-render fires.
 *
 * @param state  - A `loaded` `DetectionState` (the only state with a removal phase).
 * @param action - Any `DetectionAction`; non-removal actions return by reference.
 * @returns      The next state — a fresh `loaded` for active cells, `state`
 *               by reference for ignored cells.
 */
function transitionRemoval(
  state: Extract<DetectionState, { kind: 'loaded' }>,
  action: DetectionAction,
): DetectionState {
  const { phase } = state.removal;

  switch (action.type) {
    case 'removeRequest':
      // none → confirming; partial → confirming (retry). Ignored while a
      // confirm/remove is already in flight (FR-012 concurrency).
      if (phase === 'none' || phase === 'partial')
        return withRemoval(state, { phase: 'confirming' });
      return state;

    case 'confirmFirst':
      // confirming → confirming2 (bulk, > 25) or removing (≤ 25). The store
      // supplies the discriminator; ignored from any other phase.
      if (phase === 'confirming')
        return withRemoval(
          state,
          action.requiresSecondConfirm ? { phase: 'confirming2' } : { phase: 'removing' },
        );
      return state;

    case 'confirmSecond':
      // confirming2 → removing. Ignored elsewhere.
      if (phase === 'confirming2') return withRemoval(state, { phase: 'removing' });
      return state;

    case 'removeCancel':
      // confirming | confirming2 → none (FR-007 — nothing removed). Ignored
      // from removing (a started removal is not dialog-cancellable) and from
      // none/partial.
      if (phase === 'confirming' || phase === 'confirming2')
        return withRemoval(state, { phase: 'none' });
      return state;

    case 'removeProgress':
      // removing → removing carrying the new progress. Ignored elsewhere.
      if (phase === 'removing')
        return withRemoval(state, { phase: 'removing', progress: action.event });
      return state;

    case 'removeComplete':
      // removing → loaded(result, none | partial). The `result` is the
      // already-applied applyRemovalOutcome output supplied by the store.
      // Route on `outcome.provenance`, not on `failed.length` alone (NFR-004):
      // a compute-failed outcome (removed:[], failed:[]) and a successful
      // stalled partial (removed:[N], failed:[]) must still reach `partial` so
      // their copy renders (FR-003 / FR-009) — `failed.length === 0 → none`
      // applies to a full host success only.
      if (phase === 'removing')
        return {
          kind: 'loaded',
          result: action.result,
          removal: removalAfterComplete(action.outcome),
        };
      return state;

    default:
      // start/progress/complete/fail are handled by the caller; nothing else
      // affects the removal sub-state.
      return state;
  }
}

/**
 * Map a terminal `removeComplete` outcome to the resulting removal phase,
 * branching on `outcome.provenance` (NFR-004 — control flow comes from the
 * typed discriminator, never a `reason` string):
 *
 * - `'compute-failed'` → `partial` — `computeRemoveSet` threw before any host
 *   call; `removed`/`failed` are both empty but the user must still see the
 *   "couldn't compute the removal" copy (FR-009).
 * - `'stalled'` → `partial` — the per-batch watchdog tripped. `removed` is
 *   whatever the host confirmed before the trip (FR-003 — may be `> 0` or `0`);
 *   either way the partial view renders the truthful count.
 * - `'executor-failed'` → `partial` — a whole-operation fault (`failed` is
 *   non-empty by construction); behaviour unchanged from the prior rule.
 * - `'host'` → the host-truthful result: a clean full success
 *   (`failed.length === 0`) returns to `none`; any host failure is `partial`.
 *
 * The `switch` is exhaustive over `RemovalOutcomeProvenance` and every arm
 * returns, so `tsc` (strict, no implicit return) flags a missing arm as an
 * error — matching the default-less exhaustive-switch idiom `transition` uses
 * over `state.kind` above. No `default` is needed (and none is reachable, so
 * none would be coverable).
 *
 * @param outcome - The terminal `RemovalOutcome` carried by `removeComplete`.
 * @returns The removal phase the `loaded` state should carry next.
 */
function removalAfterComplete(outcome: RemovalOutcome): RemovalState {
  switch (outcome.provenance) {
    case 'compute-failed':
    case 'stalled':
    case 'executor-failed':
      return { phase: 'partial', outcome };
    case 'host':
      return outcome.failed.length === 0
        ? { phase: 'none' }
        : { phase: 'partial', outcome };
  }
}

/**
 * Allocate a fresh `loaded` state with the same `result` and a new `removal`.
 * Keeps the active-cell immutability contract in one place.
 */
function withRemoval(
  state: Extract<DetectionState, { kind: 'loaded' }>,
  removal: RemovalState,
): DetectionState {
  return { kind: 'loaded', result: state.result, removal };
}
