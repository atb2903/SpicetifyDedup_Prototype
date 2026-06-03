/**
 * Top-level Dedup page (FR-010, FR-011).
 *
 * Routes the store's `LoadState.kind` to the matching view. The page
 * itself contributes no layout chrome — the Spicetify Custom App harness
 * provides the surrounding navigation and titlebar.
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

export function DedupPage() {
  const kind = usePlaylistsStore((s) => s.loadState.kind);
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
}
