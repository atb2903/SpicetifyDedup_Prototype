/**
 * The initial view (FR-011, SC-6, C-006).
 *
 * Renders the sole entry point into the loading state: a labelled Load
 * button. Clicking it dispatches `triggerLoad` on the store. The view
 * itself makes no port calls — `triggerLoad` is the only fetch trigger
 * (memory: "explicit fetch trigger required").
 *
 * Styling (WP02 / T008): the view ships its own CSS module so the call
 * to action is visually distinct from the other four state views (FR-003)
 * and the Load button reads as the page's primary action (FR-006). The
 * styles consume `var(--dedup-*)` tokens declared by `_tokens.module.scss`
 * so the page theme follows the active Spicetify theme.
 */

import React from 'react';
import { usePlaylistsStore } from '../store/PlaylistsStoreContext';
import styles from './IdleView.module.scss';

export function IdleView() {
  const triggerLoad = usePlaylistsStore((s) => s.triggerLoad);
  return (
    <div className={styles.container}>
      <p className={styles.copy}>
        Load your dedup-able playlists to get started.
      </p>
      <button
        type="button"
        className={styles.button}
        aria-label="Load my dedup-able playlists"
        onClick={() => {
          void triggerLoad();
        }}
      >
        Load
      </button>
    </div>
  );
}
