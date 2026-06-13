/**
 * The pinned Liked Songs row (FR-003, T024 / WP08).
 *
 * Visually and structurally distinct from `PlaylistRow`:
 * - Fixed copy ("Liked Songs" / "Your Library").
 * - Heart glyph on a Spotify-purple tile as the visual marker instead of a
 *   cover image.
 * - Carries a stable `data-row-kind="liked-songs"` attribute.
 *
 * WP08 (T024): reads per-row detection state from the `DetectionStoreContext`
 * using the sentinel key `'liked-songs'` (per data-model §8). Renders
 * `<ScanningView>`, `<DetectionLoadedSummary>`, or `<DetectionFailedView>`
 * below the row cells based on the row's state.
 *
 * The `DedupButton` is passed:
 * - `collectionKey: 'liked-songs'` — the store sentinel (NOT the historical
 *   `'spotify:collection:tracks'` literal that was used in the diagnostic era).
 * - `request: { kind: 'liked-songs' }` — discriminated scanner payload.
 * - `displayName: 'Liked Songs'` — hardcoded, per research §7.2.
 *
 * No adapter or port imports — enforced by `test/architecture.test.ts`.
 */

import React from 'react';
import type { CollectionViewModel } from '../domain/view-models';
import { DedupButton } from './DedupButton';
import { ScanningView } from './ScanningView';
import { DetectionLoadedSummary } from './DetectionLoadedSummary';
import { DetectionFailedView } from './DetectionFailedView';
import { useDetectionStore } from '../store/DetectionStoreContext';
import styles from './LikedSongsRow.module.scss';

/** The sentinel collection key for Liked Songs (data-model §8). */
const LIKED_SONGS_KEY = 'liked-songs';

/** Props for the `LikedSongsRow` component. */
export type LikedSongsRowProps = { row: CollectionViewModel };

/**
 * Render the pinned Liked Songs row.
 *
 * Detection state:
 * - `scanning` → `<ScanningView progress={…} />`
 * - `loaded`   → `<DetectionLoadedSummary result={…} … />` with the removal
 *               props (`collectionKey='liked-songs'`, `target={{kind:'liked-songs'}}`,
 *               `displayName='Liked Songs'`) threaded so the per-row removal
 *               surface mounts (WP07 / T025).
 * - `failed`   → `<DetectionFailedView reason={…} />`
 * - `idle` / undefined → nothing extra
 */
export function LikedSongsRow({ row }: LikedSongsRowProps) {
  const rowState = useDetectionStore((s) => s.rows[LIKED_SONGS_KEY]);

  return (
    <li
      className={styles.row}
      data-row-kind="liked-songs"
      data-row-name="Liked Songs"
    >
      <span
        className={styles.heart}
        role="img"
        aria-label="Liked Songs icon"
      >
        ♥
      </span>
      <div className={styles.text}>
        <span className={styles.name}>Liked Songs</span>
        <span className={styles.owner}>Your Library</span>
      </div>
      <span className={styles.count}>
        {row.trackCount === 1 ? '1 track' : `${row.trackCount} tracks`}
      </span>
      <DedupButton
        collectionKey={LIKED_SONGS_KEY}
        request={{ kind: 'liked-songs' }}
        displayName="Liked Songs"
      />
      {rowState?.kind === 'scanning' && (
        <ScanningView progress={rowState.progress} />
      )}
      {rowState?.kind === 'loaded' && (
        <DetectionLoadedSummary
          result={rowState.result}
          collectionKey={LIKED_SONGS_KEY}
          target={{ kind: 'liked-songs' }}
          displayName="Liked Songs"
        />
      )}
      {rowState?.kind === 'failed' && (
        <DetectionFailedView reason={rowState.reason} />
      )}
    </li>
  );
}
