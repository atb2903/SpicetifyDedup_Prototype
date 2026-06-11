/**
 * Per-row Dedup button — wired to the detection store (T023 / WP08).
 *
 * Replaces the prior diagnostic `logDedupClick` handler with a real
 * `scanCollection` dispatch. The button is disabled while the row's scan is
 * in flight (FR-013 / C-005); the `disabled` state derives from the
 * detection store, not from a prop.
 *
 * Accessibility contract:
 * - Visible text is the literal word "Dedup" (Decision 8).
 * - The accessible name is `Dedup <displayName>` via `aria-label` so screen
 *   readers announce which row's button has focus (NFR-002).
 * - Native `<button>` is tab-focusable by default (NFR-001).
 * - `disabled` when `rows[collectionKey].kind === 'scanning'` (FR-013).
 *
 * Architecture: imports from `./store/DetectionStoreContext` (store layer)
 * and `./domain/detection-types` (domain layer) — no adapters, no ports,
 * per ADR-0001.
 */

import React from 'react';
import { useDetectionStore } from '../store/DetectionStoreContext';
import type { ScanRequest } from '../domain/detection-types';
import styles from './DedupButton.module.scss';

/**
 * Props for {@link DedupButton}.
 */
export type DedupButtonProps = {
  /**
   * Canonical key for the store row:
   * - Liked Songs: the literal sentinel `'liked-songs'`.
   * - Playlists: the playlist URI (e.g. `'spotify:playlist:abc'`).
   */
  collectionKey: string;
  /**
   * Discriminated payload for the scanner, forwarded verbatim to
   * `scanCollection`. Liked Songs uses `{ kind: 'liked-songs' }`; playlists
   * use `{ kind: 'playlist', playlistUri: <uri> }`.
   */
  request: ScanRequest;
  /**
   * Display name of the collection. Used verbatim in the `aria-label`:
   * `Dedup <displayName>`.
   */
  displayName: string;
};

/**
 * Render the Dedup button for a single row.
 *
 * On click, dispatches `scanCollection(collectionKey, request)` via the
 * detection store context. Disabled while the row's scan is in flight so
 * double-click and concurrent activation are prevented at the UI layer
 * (the store's `scanCollection` gate is the authoritative guard).
 */
export function DedupButton({ collectionKey, request, displayName }: DedupButtonProps) {
  const scanCollection = useDetectionStore((s) => s.scanCollection);
  const isScanning = useDetectionStore(
    (s) => s.rows[collectionKey]?.kind === 'scanning',
  );

  return (
    <button
      type="button"
      className={styles.button}
      aria-label={`Dedup ${displayName}`}
      disabled={isScanning}
      onClick={() => {
        void scanCollection(collectionKey, request);
      }}
    >
      Dedup
    </button>
  );
}
