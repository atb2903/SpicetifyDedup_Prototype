/**
 * RemovalConfirmDialog (T021 / WP06 / FR-005 / FR-006 / FR-007 / NFR-001).
 *
 * The removal confirmation surface. A pure-props component: the summary host
 * mounts it by removal phase and wires the callbacks to the store
 * (`onConfirm → confirmRemoval`, `onCancel → cancelRemoval`). It holds no
 * store reference itself, so it is trivially testable with plain props.
 *
 * Two steps:
 * - `step === 1` (mounted in phase `confirming`): names the target collection
 *   and the EXACT count, and states that the earliest copy of each duplicate
 *   group is kept (FR-005).
 * - `step === 2` (mounted in phase `confirming2`, only reachable when
 *   `count > 25`, FR-006): an explicit bulk reconfirmation naming the count
 *   again so a large deletion needs a deliberate second acknowledgement.
 *
 * NFR-001 (accidental-activation guard): the destructive `Remove` control is
 * never the auto-focused single-keypress default — focus lands on `Cancel` on
 * mount, so an inadvertent Enter/Space cannot delete. `Cancel` and `Remove`
 * are distinct controls.
 *
 * Architecture (ADR-0001): imports nothing from `src/adapters/`/`src/ports/`/
 * the store — it is a leaf presentational component.
 */

import React from 'react';
import styles from './RemovalConfirmDialog.module.scss';

/**
 * Props for {@link RemovalConfirmDialog}.
 */
export type RemovalConfirmDialogProps = {
  /** Display name of the target collection, rendered verbatim in the copy. */
  collectionName: string;
  /** Exact number of tracks that will be removed; rendered verbatim. */
  count: number;
  /** `1` for the first confirmation, `2` for the bulk reconfirmation. */
  step: 1 | 2;
  /** Invoked when the user activates the destructive `Remove` control. */
  onConfirm: () => void;
  /** Invoked when the user dismisses the dialog via `Cancel` (FR-007). */
  onCancel: () => void;
};

/**
 * Render the removal confirmation dialog for the given step.
 *
 * On mount, focus is placed on the `Cancel` control (NFR-001) so the
 * destructive action is never a one-keypress default.
 *
 * @param props - `{ collectionName, count, step, onConfirm, onCancel }`.
 * @returns The dialog element.
 */
export function RemovalConfirmDialog({
  collectionName,
  count,
  step,
  onConfirm,
  onCancel,
}: RemovalConfirmDialogProps): React.ReactElement {
  const cancelRef = React.useRef<HTMLButtonElement>(null);

  // NFR-001: focus Cancel (never the destructive Remove) on mount so an
  // accidental Enter/Space cannot trigger a deletion.
  React.useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  const tracks = `${count} ${count === 1 ? 'track' : 'tracks'}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Confirm removal from ${collectionName}`}
      className={styles.dialog}
    >
      <p className={styles.message}>
        {step === 1
          ? `Remove ${tracks} from “${collectionName}”? The earliest copy of each duplicate is kept.`
          : `Confirm removal of ${tracks} from “${collectionName}”. This is a large deletion — confirm to proceed.`}
      </p>
      <div className={styles.actions}>
        <button
          ref={cancelRef}
          type="button"
          className={styles.cancel}
          onClick={onCancel}
        >
          Cancel
        </button>
        <button type="button" className={styles.remove} onClick={onConfirm}>
          Remove
        </button>
      </div>
    </div>
  );
}
