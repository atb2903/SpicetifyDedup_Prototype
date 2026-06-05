/**
 * Spicetify Custom App entry. Mounts the Dedup page inside the
 * production store provider and the route-reset lifecycle bridge.
 *
 * `productionStore` is created exactly once at module load: this is the
 * only place authorised to instantiate `SpicetifyPlaylistsLoader`.
 * Constructing the adapter is side-effect-free — no `Spicetify.*`
 * access happens until the user clicks Load — so SC-6 (zero
 * pre-trigger host calls) is preserved by the store's contract, not by
 * laziness here.
 *
 * Provider order: `<PlaylistsStoreProvider>` wraps `<RouteResetProvider>`
 * because the route-reset bridge calls `usePlaylistsStore((s) => s.reset)`
 * on mount; the store hook must be available at that point.
 *
 * `RouteResetProvider` is a React-lifecycle bridge (ADR-0005) that
 * supersedes the prior navigation-port-based design. It resets the
 * playlists store on mount and on unmount so the page lands on
 * `{ kind: 'idle' }` every time the Dedup React tree boundaries the
 * route — see `.claude/adr/0005-react-lifecycle-reset.md` for the full
 * decision history and `src/store/RouteResetContext.tsx` for the
 * implementation contract.
 */
import React from 'react';
import { DedupPage } from './ui/DedupPage';
import { createPlaylistsStore } from './store/playlists-store';
import { PlaylistsStoreProvider } from './store/PlaylistsStoreContext';
import { RouteResetProvider } from './store/RouteResetContext';
import { SpicetifyPlaylistsLoader } from './adapters/spicetify-playlists-loader';

const productionStore = createPlaylistsStore(new SpicetifyPlaylistsLoader());

const App = () => (
  <PlaylistsStoreProvider store={productionStore}>
    <RouteResetProvider>
      <DedupPage />
    </RouteResetProvider>
  </PlaylistsStoreProvider>
);

export default App;
