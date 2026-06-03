/**
 * The initial view (FR-011, SC-6, C-006).
 *
 * Renders the sole entry point into the loading state: a labelled Load
 * button. Clicking it dispatches `triggerLoad` on the store. The view
 * itself makes no port calls — `triggerLoad` is the only fetch trigger
 * (memory: "explicit fetch trigger required").
 */

import React from 'react';
import { usePlaylistsStore } from '../store/PlaylistsStoreContext';

export function IdleView() {
  const triggerLoad = usePlaylistsStore((s) => s.triggerLoad);
  return (
    <div className="dedup-idle">
      <p className="dedup-idle__copy">
        Load your dedup-able playlists to get started.
      </p>
      <button
        type="button"
        className="dedup-idle__trigger"
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
