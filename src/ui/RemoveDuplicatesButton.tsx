/**
 * RemoveDuplicatesButton (T020 / WP06 / FR-001 / FR-002 / FR-012).
 *
 * The gated entry point into the removal flow. Reads its row from the
 * detection store (mirroring `DedupButton`) and self-gates on visibility: it
 * renders the button ONLY when the row is `loaded`, has at least one removable
 * track, and is not already mid-confirmation/removal.
 *
 * Visibility rule (contract §RemoveDuplicatesButton, AS-1/AS-2):
 *   render iff `row.kind === 'loaded'`
 *           && `row.result.removableTrackCount > 0`
 *           && `row.removal.phase ∈ {'none', 'partial'}`
 *           && NOT (`phase === 'partial'`
 *                   && `row.removal.outcome.provenance === 'compute-failed'`).
 *
 * For every other case the component returns `null` (renders nothing):
 * - unscanned / scanning / failed / absent row,
 * - `removableTrackCount === 0` (AS-7 — the button hides once nothing remains),
 * - `phase ∈ {'confirming','confirming2','removing'}`,
 * - the TERMINAL `compute-failed` exception (NEW-4 / FR-007 / SC-004): a
 *   `compute-failed` outcome (computeRemoveSet threw before any host call) maps
 *   to `partial`, which would normally re-offer retry — but retrying recomputes
 *   the SAME RemoveSet and deterministically fails again (a dead-end). The
 *   button reads the provenance the `partial` substate carries and withholds
 *   the retry control, so "retry cannot be dispatched". The
 *   `compute-failed → partial` FSM mapping is left intact (D-2); the dead-end is
 *   gated here at the UI layer by PROVENANCE, not by forking a new FSM phase.
 *   Other `partial` provenances (`stalled`/`executor-failed`/`host`) still show
 *   the retry button, since recompute could legitimately succeed.
 *
 * Design choice — return `null` rather than render-but-disable for the
 * confirming/confirming2/removing phases. The contract's primary rule is
 * "not shown" during confirm/remove, and the dialog (mounted by the summary
 * host) is the only affordance the user needs in those phases; leaving a
 * disabled button alongside the dialog would be redundant. Unmounting is the
 * cleaner default and the FSM ignore (FR-012) is the authoritative guard.
 *
 * onClick dispatches `requestRemoval(collectionKey)` only — it makes **no**
 * executor/host call (FR-007/FR-011); the FSM moves `none → confirming` and
 * the summary host then renders the confirmation dialog.
 *
 * Architecture (ADR-0001): imports `../store/DetectionStoreContext` (store
 * layer) and `../domain/removal-types` (domain layer) only — no adapters,
 * no ports.
 */

import React from 'react';
import { useDetectionStore } from '../store/DetectionStoreContext';
import type { RemovalTarget } from '../domain/removal-types';
import styles from './RemoveDuplicatesButton.module.scss';

/**
 * Props for {@link RemoveDuplicatesButton}.
 */
export type RemoveDuplicatesButtonProps = {
  /**
   * Canonical key for the store row: `'liked-songs'` for the library, or the
   * playlist URI for a playlist.
   */
  collectionKey: string;
  /**
   * The single collection this removal targets. Carried for parity with the
   * store/executor seam and forwarded by callers; the button does not call the
   * executor itself, so it is not used in the click path, but it keeps the
   * prop surface aligned with the removal contract.
   */
  target: RemovalTarget;
  /**
   * Display name of the collection, used verbatim in the accessible name
   * (`Remove duplicates from {displayName}`) for screen-reader parity with
   * `DedupButton` (NFR-002).
   */
  displayName: string;
};

/**
 * Render the "Remove N duplicate(s)" button for a single row, gated on the
 * row's removal phase.
 *
 * @param props - `{ collectionKey, target, displayName }`.
 * @returns The button element when visible, otherwise `null`.
 */
export function RemoveDuplicatesButton({
  collectionKey,
  // `target` is part of the contract surface but unused in the click path
  // (the button never calls the executor); destructured-and-ignored.
  target: _target,
  displayName,
}: RemoveDuplicatesButtonProps): React.ReactElement | null {
  const row = useDetectionStore((s) => s.rows[collectionKey]);
  const requestRemoval = useDetectionStore((s) => s.requestRemoval);

  // Self-gate: only a `loaded` row with removable tracks and a quiescent
  // removal phase shows the button.
  if (row?.kind !== 'loaded') return null;
  const count = row.result.removableTrackCount;
  if (count <= 0) return null;
  const removal = row.removal;
  const phase = removal.phase;
  if (phase !== 'none' && phase !== 'partial') return null;
  // Terminal exception (NEW-4 / FR-007 / SC-004): a `compute-failed` outcome
  // maps to `partial`, but retrying would recompute the SAME RemoveSet and
  // deterministically fail again (a dead-end). Read the provenance the
  // `partial` substate carries and withhold the retry control entirely — the
  // FSM mapping stays intact (D-2), the dead-end is gated at the UI layer.
  if (phase === 'partial' && removal.outcome.provenance === 'compute-failed') {
    return null;
  }

  return (
    <button
      type="button"
      className={styles.button}
      aria-label={`Remove duplicates from ${displayName}`}
      onClick={() => {
        requestRemoval(collectionKey);
      }}
    >
      {`Remove ${count} ${count === 1 ? 'duplicate' : 'duplicates'}`}
    </button>
  );
}
