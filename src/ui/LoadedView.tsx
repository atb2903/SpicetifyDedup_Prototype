/**
 * The loaded-state view (FR-003, FR-006).
 *
 * Iterates the `CollectionViewModel[]` carried by the store's `loaded`
 * state and dispatches each item to the right row variant:
 *
 * - `kind === 'liked-songs'` → `LikedSongsRow`
 * - `kind === 'playlist'`    → `PlaylistRow`
 *
 * Order is preserved verbatim — pinning Liked Songs first is the
 * view-model transform's responsibility (WP03), not this view's. When
 * the store is not in the `loaded` state, this component renders
 * nothing; the `PageRouter` (a sibling view in the same WP family)
 * picks the right view per FSM cell.
 *
 * Architecture: imports the bound hook from `src/store/`, never from
 * `src/adapters/` or `src/ports/` (enforced by `test/architecture.test.ts`).
 *
 * Styling (WP02 / T010): ships its own CSS module so the `<ul>` container
 * removes default bullet markers and constrains the list to a readable
 * max-width. Row styling lives in the per-row modules (`PlaylistRow`,
 * `LikedSongsRow`).
 */

import React from 'react';
import { usePlaylistsStore } from '../store/PlaylistsStoreContext';
import { PlaylistRow } from './PlaylistRow';
import { LikedSongsRow } from './LikedSongsRow';
import styles from './LoadedView.module.scss';

/**
 * Render the loaded list. Returns `null` while the FSM is not in
 * `loaded`, so the parent can compose this view without guarding the
 * state itself.
 */
export function LoadedView() {
  const loadState = usePlaylistsStore((s) => s.loadState);
  if (loadState.kind !== 'loaded') return null;
  return (
    <ul className={styles.list}>
      {loadState.items.map((row) =>
        row.kind === 'liked-songs' ? (
          <LikedSongsRow key={row.key} row={row} />
        ) : (
          <PlaylistRow key={row.key} row={row} />
        ),
      )}
    </ul>
  );
}
