/**
 * RemovalOutcomeView (T022 / WP06 / FR-010 / AS-8; T012 / WP04 / NFR-004).
 *
 * Partial-failure messaging for a removal that finished with at least one
 * track left undeleted. A pure-props leaf component: the summary host mounts it
 * only when `removal.phase === 'partial'`, so there is no full-success case to
 * render here — on a clean finish the summary simply shows the reduced count
 * and the button hides (AS-7).
 *
 * It distinguishes two `partial` cases, derived purely from `outcome`:
 *
 * - **Stall (NFR-004).** When the removal never settled and the store's stall
 *   ceiling fired (WP03), the catch writes an all-failed outcome whose every
 *   `failed[].reason` begins with the `stalled:` prefix. This view detects that
 *   shape and shows a plain-language timed-out message — never raw stack or
 *   exception text. The Remove button stays available for retry (FR-008).
 * - **Ordinary partial.** Otherwise (a host-reported per-track failure or a
 *   non-stall fault), it shows the existing "N didn't complete" message.
 *
 * The still-present duplicate copies are rendered by the summary over the
 * updated `result` (the failed copies were retained by `applyRemovalOutcome`);
 * this view contributes only the human-readable message.
 *
 * Rendered as `role="status"` so assistive tech announces the outcome without
 * stealing focus (NFR-002).
 *
 * Architecture (ADR-0001): imports `../domain/removal-types` only — no
 * adapters, no ports, no store. The stall detection is a pure derivation over
 * `outcome.failed[].reason` (the prefix convention WP03 owns), so this view
 * carries no store coupling.
 */

import React from 'react';
import type { RemovalOutcome } from '../domain/removal-types';
import styles from './RemovalOutcomeView.module.scss';

/**
 * Reason prefix the store's `confirmRemoval` catch writes on every failed entry
 * when the stall ceiling fires (WP03). The view keys the timed-out message off
 * this convention; it is the only coupling between the two — a string contract,
 * not a store import.
 */
const STALLED_REASON_PREFIX = 'stalled:';

/**
 * Props for {@link RemovalOutcomeView}.
 */
export type RemovalOutcomeViewProps = {
  /** The settled removal outcome; `outcome.failed` drives the rendered message. */
  outcome: RemovalOutcome;
};

/**
 * Pure derivation: did this outcome come from a stall?
 *
 * True iff the outcome is **all-failed** (nothing removed, at least one
 * failure) AND every `failed[].reason` begins with the `stalled:` prefix WP03
 * writes for a ceiling timeout. A mixed outcome (some removed, or some failures
 * carrying a different prefix) is an ordinary partial, not a stall.
 *
 * @param outcome - The settled removal outcome.
 * @returns `true` when the outcome represents a stall (timed-out) removal.
 */
function isStalledOutcome(outcome: RemovalOutcome): boolean {
  return (
    outcome.removed.length === 0 &&
    outcome.failed.length > 0 &&
    outcome.failed.every((f) => f.reason.startsWith(STALLED_REASON_PREFIX))
  );
}

/**
 * Render the message for a settled removal outcome.
 *
 * @param props - `{ outcome }`.
 * @returns A `role="status"` element: a plain-language timed-out message for a
 *   stall, otherwise the partial-failure count message.
 */
export function RemovalOutcomeView({
  outcome,
}: RemovalOutcomeViewProps): React.ReactElement {
  if (isStalledOutcome(outcome)) {
    return (
      <p role="status" className={`${styles.outcome} ${styles.timedOut}`}>
        Removal timed out — no tracks were removed. You can try again.
      </p>
    );
  }

  const failedCount = outcome.failed.length;
  const tracks = `${failedCount} ${failedCount === 1 ? 'track' : 'tracks'}`;

  return (
    <p role="status" className={styles.outcome}>
      {`Removal partially failed — ${tracks} couldn’t be removed and ${failedCount === 1 ? 'is' : 'are'} still present.`}
    </p>
  );
}
