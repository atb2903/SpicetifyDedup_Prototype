/**
 * RemovalOutcomeView (T022 / WP06 / FR-010 / AS-8; T012 / WP04 / NFR-004;
 * T018 / WP03 / NFR-004 / FR-003 / FR-009).
 *
 * Partial-failure messaging for a removal that finished with at least one
 * track left undeleted (or that never settled / couldn't even be computed). A
 * pure-props leaf component: the summary host mounts it only when
 * `removal.phase === 'partial'`, so there is no full-success case to render
 * here — on a clean finish the summary simply shows the reduced count and the
 * button hides (AS-7).
 *
 * The message is derived purely from the typed `outcome.provenance`
 * discriminator (NFR-004 / ADR-0020). No layer parses `failed[].reason`
 * prefixes any more — `provenance` is the single control signal:
 *
 * - `'stalled'` — the store's per-batch stall watchdog tripped. When nothing
 *   was confirmed removed, the plain-language "timed out, removed nothing"
 *   message shows; when the executor confirmed some deletions before the trip,
 *   a truthful partial count is shown instead (FR-003 — never "removed nothing"
 *   when deletions occurred).
 * - `'compute-failed'` — `computeRemoveSet` threw before any host call (FR-009).
 *   The message names **no** track and **no** count.
 * - `'executor-failed'` / `'host'` — a whole-operation executor fault or a
 *   host-reported per-track partial. The existing truthful "N didn't complete"
 *   message shows over `failed.length`.
 *
 * The still-present duplicate copies are rendered by the summary over the
 * updated `result` (the failed copies were retained by `applyRemovalOutcome`);
 * this view contributes only the human-readable message. No raw stack or
 * exception text ever leaks.
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
  /** The settled removal outcome; `outcome.provenance` drives the message. */
  outcome: RemovalOutcome;
};

/**
 * Render the message for a settled removal outcome, branching on the typed
 * `provenance` discriminator (NFR-004).
 *
 * @param props - `{ outcome }`.
 * @returns A `role="status"` element carrying the truthful outcome message.
 */
export function RemovalOutcomeView({
  outcome,
}: RemovalOutcomeViewProps): React.ReactElement {
  switch (outcome.provenance) {
    case 'compute-failed':
      // FR-009: no fabricated track, no count.
      return (
        <p role="status" className={`${styles.outcome} ${styles.timedOut}`}>
          The removal couldn’t be computed — nothing was changed. You can try
          again.
        </p>
      );

    case 'stalled':
      if (outcome.removed.length === 0) {
        return (
          <p role="status" className={`${styles.outcome} ${styles.timedOut}`}>
            Removal timed out — no tracks were removed. You can try again.
          </p>
        );
      }
      // FR-003: deletions occurred before the watchdog tripped — report them
      // truthfully rather than claiming nothing was removed.
      return (
        <p role="status" className={`${styles.outcome} ${styles.timedOut}`}>
          {`Removal timed out after removing ${removedPhrase(outcome)} — ${failedPhrase(outcome)} still present. You can try again.`}
        </p>
      );

    case 'host':
    case 'executor-failed':
      return (
        <p role="status" className={styles.outcome}>
          {`Removal partially failed — ${failedPhrase(outcome)} couldn’t be removed and ${outcome.failed.length === 1 ? 'is' : 'are'} still present.`}
        </p>
      );

    default: {
      // Exhaustiveness check: TypeScript narrows `provenance` to `never` here.
      // Adding a new provenance without a case above becomes a compile error.
      const _exhaustive: never = outcome.provenance;
      return (
        <p role="status" className={styles.outcome}>
          {`Removal outcome unknown: ${String(_exhaustive)}.`}
        </p>
      );
    }
  }
}

/**
 * Pluralized phrase for the number of confirmed-removed tracks.
 *
 * @param outcome - The settled removal outcome.
 * @returns e.g. `"3 tracks"` / `"1 track"`.
 */
function removedPhrase(outcome: RemovalOutcome): string {
  const n = outcome.removed.length;
  return `${n} ${n === 1 ? 'track' : 'tracks'}`;
}

/**
 * Pluralized phrase for the number of still-failed tracks.
 *
 * @param outcome - The settled removal outcome.
 * @returns e.g. `"2 tracks"` / `"1 track"`.
 */
function failedPhrase(outcome: RemovalOutcome): string {
  const n = outcome.failed.length;
  return `${n} ${n === 1 ? 'track' : 'tracks'}`;
}
