/**
 * DetectionLoadedSummary (WP07 / T021 / FR-009 / AS-1 / AS-2).
 *
 * Presentational component that renders the per-row detection result summary.
 * Pure: props in → JSX out; no store imports, no port imports.
 *
 * Render rules:
 * - `result.groups.length === 0` → "No duplicates found" (AS-1 verbatim phrase).
 * - Otherwise → "{N} duplicate group(s) · {M} track(s) to remove".
 * - Secondary annotations (only when non-zero):
 *   - `skippedLocalCount > 0` → "Skipped {N} local file(s)"
 *   - `unenrichedCount > 0`   → "{N} track(s) couldn't be looked up"
 *
 * Architecture: `src/ui/` may import from `src/domain/` but MUST NOT import
 * from `src/adapters/` or `src/ports/` (enforced by `test/architecture.test.ts`).
 *
 * Callers: WP08 wires this component into the row components.
 */

import React from 'react';
import styles from './DetectionLoadedSummary.module.scss';

// ---------------------------------------------------------------------------
// Types (WP01 domain types are defined locally until WP01 is merged into main)
// ---------------------------------------------------------------------------

/** A single member of a duplicate group — only fields needed for the summary. */
type GroupMember = {
  position: number;
  uri: string;
  canonicalUri: string;
  name: string;
  artists: ReadonlyArray<{ name: string }>;
  durationMs: number;
};

/** A set of duplicate tracks found within a single collection. */
type DuplicateGroup = {
  id: string;
  reason: 'same-canonical-uri' | 'name-artist-duration';
  members: ReadonlyArray<GroupMember>;
  defaultKeepIndex: number;
};

/**
 * The full detection payload exposed by the store when a row reaches `loaded`.
 * Mirrors `DetectionResult` from `src/domain/detection-types.ts` (WP01).
 */
export type DetectionResult = {
  /** Canonical URI of the scanned collection. */
  collectionKey: string;
  /** UTC ms timestamp of scan completion. */
  completedAt: number;
  /** All duplicate groups; empty when no duplicates were found (AS-1). */
  groups: ReadonlyArray<DuplicateGroup>;
  /** Sum of all `members.length` across groups. */
  duplicateTrackCount: number;
  /** `duplicateTrackCount − groups.length` — tracks that would be removed if keeping one per group. */
  removableTrackCount: number;
  /** Count of `spotify:local:…` URIs filtered before enrichment. */
  skippedLocalCount: number;
  /** Count of tracks the catalog returned `null` for. */
  unenrichedCount: number;
  /** Total non-local tracks the enumerator yielded. */
  scannedTrackCount: number;
};

/**
 * Props for {@link DetectionLoadedSummary}.
 */
export type DetectionLoadedSummaryProps = {
  /** The detection result to summarise. */
  result: DetectionResult;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Render a summary of a completed detection result.
 *
 * Shows either "No duplicates found" (AS-1) or the group and removable-track
 * counts (AS-2), followed by optional secondary annotations for local-file
 * skips and catalog-lookup failures.
 *
 * @param props - `{ result: DetectionResult }`
 * @returns A `<div>` containing the summary copy.
 */
export function DetectionLoadedSummary({
  result,
}: DetectionLoadedSummaryProps): React.ReactElement {
  const { groups, removableTrackCount, skippedLocalCount, unenrichedCount } =
    result;
  const isEmpty = groups.length === 0;

  return (
    <div className={styles.container}>
      {isEmpty ? (
        <p className={styles.empty}>No duplicates found</p>
      ) : (
        <p className={styles.summary}>
          {pluralise(groups.length, 'duplicate group', 'duplicate groups')}
          {' · '}
          {pluralise(removableTrackCount, 'track to remove', 'tracks to remove')}
        </p>
      )}
      {skippedLocalCount > 0 && (
        <p className={styles.annotation}>
          {`Skipped ${skippedLocalCount} local ${skippedLocalCount === 1 ? 'file' : 'files'}`}
        </p>
      )}
      {unenrichedCount > 0 && (
        <p className={styles.annotation}>
          {`${unenrichedCount} ${unenrichedCount === 1 ? "track" : "tracks"} couldn’t be looked up`}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Produce a singular or plural phrase based on `count`.
 *
 * @param count - The numeric value.
 * @param singular - Text to use when `count === 1`.
 * @param plural - Text to use when `count !== 1`.
 * @returns `"{count} {singular|plural}"`.
 */
function pluralise(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
