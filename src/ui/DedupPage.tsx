/**
 * Top-level Dedup page (FR-010, FR-011) — also owns the page-level
 * layout chrome (FR-001 / WP01).
 *
 * Routes the store's `LoadState.kind` to the matching view inside a
 * wrapper element that provides the page's own scroll surface and a
 * topbar-aware `padding-top`. The wrapper exists because the Spicetify
 * Custom App slot mounts the React tree at a body-level container that
 * does not account for Spotify's fixed-position `main-topBar-container`
 * chrome; without it, the page's first interactive element (the Load
 * button in idle) renders inside the topbar's bounding box and is
 * unreachable from a real mouse click (spec §1 P1). The CSS rule lives
 * in `./DedupPage.module.scss`.
 *
 * The switch is exhaustive over the `LoadState` discriminated union and
 * has no `default` branch: adding a new variant to `LoadState` becomes a
 * compile error here, surfacing the missing UI mapping immediately.
 *
 * Architecture: lives under `src/ui/` and imports only sibling views
 * plus the bound store hook from `src/store/`. ADR-0001's import rules
 * forbid reaching into `src/adapters/` or `src/ports/` from here.
 */

import React from 'react';
import { usePlaylistsStore } from '../store/PlaylistsStoreContext';
import { IdleView } from './IdleView';
import { LoadingView } from './LoadingView';
import { LoadedView } from './LoadedView';
import { EmptyView } from './EmptyView';
import { FailedView } from './FailedView';
import styles from './DedupPage.module.scss';

export function DedupPage() {
  const kind = usePlaylistsStore((s) => s.loadState.kind);
  return (
    <div className={styles.page}>
      {(() => {
        switch (kind) {
          case 'idle':
            return <IdleView />;
          case 'loading':
            return <LoadingView />;
          case 'loaded':
            return <LoadedView />;
          case 'empty':
            return <EmptyView />;
          case 'failed':
            return <FailedView />;
        }
      })()}
    </div>
  );
}
