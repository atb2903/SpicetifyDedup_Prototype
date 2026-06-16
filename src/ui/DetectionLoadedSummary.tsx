/**
 * DetectionLoadedSummary (WP07 / T021; removal host added in WP06 / T023).
 *
 * Renders the per-row detection result summary and — when the removal props
 * are supplied — hosts the removal surface (button / confirm dialog / outcome /
 * progress) by removal phase.
 *
 * Summary render rules (unchanged):
 * - `result.groups.length === 0` → "No duplicates found" (AS-1 verbatim phrase).
 * - Otherwise → "{N} duplicate group(s) · {M} track(s) to remove".
 * - Secondary annotations (only when non-zero):
 *   - `skippedLocalCount > 0` → "Skipped {N} local file(s)"
 *   - `unenrichedCount > 0`   → "{N} track(s) couldn't be looked up"
 *
 * Removal host (T023): the three removal props (`collectionKey`, `target`,
 * `displayName`) are **optional**. The existing `{ result }`-only callers
 * (`PlaylistRow`/`LikedSongsRow`, owned by WP07) keep compiling and render
 * exactly as before — no store access, no removal UI. When all three are
 * present, the component becomes store-aware: it reads the row's removal phase
 * from `useDetectionStore` and mounts, by phase:
 * - always: the existing summary copy.
 * - `RemoveDuplicatesButton` (self-gates on visibility).
 * - `confirming`  → `RemovalConfirmDialog step={1}`.
 * - `confirming2` → `RemovalConfirmDialog step={2}` (bulk, > 25 only).
 * - `removing`    → a non-blocking progress indicator (NFR-002); shows
 *   `removedSoFar/total` when a `RemovalProgressEvent` is present, else
 *   indeterminate.
 * - `partial`     → `RemovalOutcomeView` (and the button is visible again for retry).
 *
 * Architecture: `src/ui/` may import from `src/domain/` and the store context
 * but MUST NOT import from `src/adapters/` or `src/ports/` (enforced by
 * `test/architecture.test.ts`).
 *
 * Callers: WP08/WP07 wires this component into the row components, threading
 * the removal props (T025).
 */

import React from 'react';
import { useDetectionStore } from '../store/DetectionStoreContext';
import type { RemovalTarget } from '../domain/removal-types';
import type { DetectionResult } from '../domain/detection-types';
import { RemoveDuplicatesButton } from './RemoveDuplicatesButton';
import { RemovalConfirmDialog } from './RemovalConfirmDialog';
import { RemovalOutcomeView } from './RemovalOutcomeView';
import styles from './DetectionLoadedSummary.module.scss';

/**
 * Props for {@link DetectionLoadedSummary}.
 *
 * `result` is required. The three removal props are **optional** and only
 * take effect together: when all three are present and the store row is
 * `loaded`, the removal surface is hosted; otherwise the component renders the
 * pure summary exactly as before (back-compat for `{ result }`-only callers).
 */
export type DetectionLoadedSummaryProps = {
  /** The detection result to summarise. */
  result: DetectionResult;
  /**
   * Canonical store-row key (`'liked-songs'` or a playlist URI). Required to
   * activate the removal host; absent for legacy summary-only callers.
   */
  collectionKey?: string;
  /** The single collection a removal would target. Forwarded to the button. */
  target?: RemovalTarget;
  /** Display name used in the button's accessible name and dialog copy. */
  displayName?: string;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Render a summary of a completed detection result and, when removal props are
 * supplied, the phase-driven removal surface beneath it.
 *
 * @param props - `{ result, collectionKey?, target?, displayName? }`.
 * @returns A `<div>` containing the summary copy (and removal surface).
 */
export function DetectionLoadedSummary({
  result,
  collectionKey,
  target,
  displayName,
}: DetectionLoadedSummaryProps): React.ReactElement {
  const { groups, removableTrackCount, skippedLocalCount, unenrichedCount } =
    result;
  const isEmpty = groups.length === 0;

  // Activate the removal host only when all three removal props are present.
  const hasRemoval =
    collectionKey !== undefined &&
    target !== undefined &&
    displayName !== undefined;

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
      {hasRemoval && (
        <RemovalSurface
          collectionKey={collectionKey}
          target={target}
          displayName={displayName}
          removableTrackCount={removableTrackCount}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Removal surface (store-aware) — extracted so the store hooks run only when
// the removal props are present (Rules of Hooks: the parent must not call
// `useDetectionStore` conditionally).
// ---------------------------------------------------------------------------

/**
 * The store-aware removal region. Reads the row's removal phase and renders the
 * button, confirmation dialog, progress indicator, or outcome view accordingly.
 *
 * Mounted by {@link DetectionLoadedSummary} only when all removal props exist,
 * so its `useDetectionStore` calls are never conditional.
 *
 * @param props - removal props plus the `removableTrackCount` for the dialog count.
 * @returns The removal region JSX.
 */
function RemovalSurface({
  collectionKey,
  target,
  displayName,
  removableTrackCount,
}: {
  collectionKey: string;
  target: RemovalTarget;
  displayName: string;
  removableTrackCount: number;
}): React.ReactElement {
  const confirmRemoval = useDetectionStore((s) => s.confirmRemoval);
  const cancelRemoval = useDetectionStore((s) => s.cancelRemoval);
  // The full row (so phase + the `partial` outcome + `removing` progress are
  // all available from one selection).
  const row = useDetectionStore((s) => s.rows[collectionKey]);

  const removal = row?.kind === 'loaded' ? row.removal : undefined;
  const phase = removal?.phase ?? 'none';

  return (
    <div className={styles.removal}>
      <RemoveDuplicatesButton
        collectionKey={collectionKey}
        target={target}
        displayName={displayName}
      />
      {(phase === 'confirming' || phase === 'confirming2') && (
        <RemovalConfirmDialog
          collectionName={displayName}
          count={removableTrackCount}
          step={phase === 'confirming' ? 1 : 2}
          onConfirm={() => {
            void confirmRemoval(collectionKey);
          }}
          onCancel={() => {
            cancelRemoval(collectionKey);
          }}
        />
      )}
      {phase === 'removing' && (
        <p
          role="status"
          aria-live="polite"
          className={styles.progress}
        >
          {removal?.phase === 'removing' && removal.progress !== undefined
            ? `Removing… ${removal.progress.removedSoFar}/${removal.progress.total}`
            : 'Removing…'}
        </p>
      )}
      {removal?.phase === 'partial' && (
        <RemovalOutcomeView outcome={removal.outcome} />
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
