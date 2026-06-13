/**
 * RemovalOutcomeView (T022 / WP06 / FR-010 / AS-8).
 *
 * Partial-failure messaging for a removal that finished with at least one
 * track left undeleted. A pure-props leaf component: the summary host mounts it
 * only when `removal.phase === 'partial'`, so there is no full-success case to
 * render here — on a clean finish the summary simply shows the reduced count
 * and the button hides (AS-7).
 *
 * The still-present duplicate copies are rendered by the summary over the
 * updated `result` (the failed copies were retained by `applyRemovalOutcome`);
 * this view contributes only the human-readable "N didn't complete" message.
 *
 * Rendered as `role="status"` so assistive tech announces the outcome without
 * stealing focus (NFR-002).
 *
 * Architecture (ADR-0001): imports `../domain/removal-types` only — no
 * adapters, no ports, no store.
 */

import React from 'react';
import type { RemovalOutcome } from '../domain/removal-types';
import styles from './RemovalOutcomeView.module.scss';

/**
 * Props for {@link RemovalOutcomeView}.
 */
export type RemovalOutcomeViewProps = {
  /** The settled removal outcome; `outcome.failed` drives the failed count. */
  outcome: RemovalOutcome;
};

/**
 * Render the partial-failure message for a removal outcome.
 *
 * @param props - `{ outcome }`.
 * @returns A `role="status"` element naming how many tracks could not be removed.
 */
export function RemovalOutcomeView({
  outcome,
}: RemovalOutcomeViewProps): React.ReactElement {
  const failedCount = outcome.failed.length;
  const tracks = `${failedCount} ${failedCount === 1 ? 'track' : 'tracks'}`;

  return (
    <p role="status" className={styles.outcome}>
      {`Removal partially failed — ${tracks} couldn’t be removed and ${failedCount === 1 ? 'is' : 'are'} still present.`}
    </p>
  );
}
