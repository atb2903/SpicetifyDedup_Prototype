/**
 * Per-playlist row (FR-005, SC-3, T024 / WP08).
 *
 * Presentational component — takes a `CollectionViewModel` as a prop and
 * renders the playlist's name, owner label, cover image (or accessible
 * placeholder when `imageUrl === null`), and pluralized track count.
 *
 * WP08 (T024): reads per-row detection state from the `DetectionStoreContext`
 * and renders `<ScanningView>`, `<DetectionLoadedSummary>`, or
 * `<DetectionFailedView>` below the row cells based on the row's state.
 * The `idle` state (undefined row entry) renders nothing extra.
 *
 * No adapter or port imports — enforced by `test/architecture.test.ts`.
 * Domain imports (types) and store imports (context hooks) are allowed.
 */

import React from 'react';
import type {
  CollectionViewModel,
  OwnerIdentity,
} from '../domain/view-models';
import { DedupButton } from './DedupButton';
import { ScanningView } from './ScanningView';
import { DetectionLoadedSummary } from './DetectionLoadedSummary';
import { DetectionFailedView } from './DetectionFailedView';
import { useDetectionStore } from '../store/DetectionStoreContext';
import styles from './PlaylistRow.module.scss';

/** Props for the `PlaylistRow` component. */
export type PlaylistRowProps = { row: CollectionViewModel };

/**
 * Render a single playlist row.
 *
 * Owner labels:
 * - `self` → "by you"
 * - `other` → "by {displayName}"
 * - `system-library` → "Your Library" (defensive; `LikedSongsRow` handles
 *   this variant in normal flow)
 *
 * Detection state:
 * - `scanning` → `<ScanningView progress={…} />`
 * - `loaded`   → `<DetectionLoadedSummary result={…} />`
 * - `failed`   → `<DetectionFailedView reason={…} />`
 * - `idle` / undefined → nothing extra
 */
export function PlaylistRow({ row }: PlaylistRowProps) {
  const collectionKey = row.key;
  const rowState = useDetectionStore((s) => s.rows[collectionKey]);

  return (
    <li
      className={styles.row}
      data-row-kind="playlist"
      data-row-name={row.displayName}
    >
      <Cover imageUrl={row.imageUrl} />
      <div className={styles.text}>
        <span className={styles.name}>{row.displayName}</span>
        <span className={styles.owner}>{ownerLabel(row.owner)}</span>
      </div>
      <span className={styles.count}>
        {formatTrackCount(row.trackCount)}
      </span>
      <DedupButton
        collectionKey={collectionKey}
        request={{ kind: 'playlist', playlistUri: collectionKey }}
        displayName={row.displayName}
      />
      {rowState?.kind === 'scanning' && (
        <ScanningView progress={rowState.progress} />
      )}
      {rowState?.kind === 'loaded' && (
        <DetectionLoadedSummary result={rowState.result} />
      )}
      {rowState?.kind === 'failed' && (
        <DetectionFailedView reason={rowState.reason} />
      )}
    </li>
  );
}

function ownerLabel(owner: OwnerIdentity): string {
  if (owner.kind === 'self') return 'by you';
  if (owner.kind === 'other') return `by ${owner.displayName}`;
  return 'Your Library';
}

function formatTrackCount(n: number): string {
  return n === 1 ? '1 track' : `${n} tracks`;
}

function Cover({ imageUrl }: { imageUrl: string | null }) {
  if (imageUrl !== null) {
    return <img className={styles.cover} src={imageUrl} alt="" />;
  }
  return (
    <div
      className={`${styles.cover} ${styles.placeholder}`}
      role="img"
      aria-label="No cover image"
    />
  );
}
