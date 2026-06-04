/**
 * Spicetify Custom App entry. Mounts the Dedup page inside the
 * production store provider and the navigation-aware reset bridge.
 *
 * `productionStore` is created exactly once at module load: this is the
 * only place authorised to instantiate `SpicetifyPlaylistsLoader`.
 * Constructing the adapter is side-effect-free — no `Spicetify.*`
 * access happens until the user clicks Load — so SC-6 (zero
 * pre-trigger host calls) is preserved by the store's contract, not by
 * laziness here.
 *
 * `productionNavigation` is similarly constructed once. The
 * `SpicetifyNavigation` constructor performs no `Spicetify.*` access;
 * the host probe runs lazily inside `subscribe` and `currentPath`, both
 * driven by `NavigationProvider`'s `useEffect` (NFR-008 navigation
 * wiring, FR-008/FR-009).
 *
 * Provider order: `<PlaylistsStoreProvider>` wraps
 * `<NavigationProvider>` because the navigation bridge calls
 * `usePlaylistsStore((s) => s.reset)` on mount; the store hook must be
 * available at that point.
 */
import React from 'react';
import { DedupPage } from './ui/DedupPage';
import { createPlaylistsStore } from './store/playlists-store';
import { PlaylistsStoreProvider } from './store/PlaylistsStoreContext';
import { NavigationProvider } from './store/NavigationContext';
import { SpicetifyPlaylistsLoader } from './adapters/spicetify-playlists-loader';
import { SpicetifyNavigation } from './adapters/spicetify-navigation';

const productionStore = createPlaylistsStore(new SpicetifyPlaylistsLoader());
const productionNavigation = new SpicetifyNavigation();

const App = () => (
  <PlaylistsStoreProvider store={productionStore}>
    <NavigationProvider navigation={productionNavigation}>
      <DedupPage />
    </NavigationProvider>
  </PlaylistsStoreProvider>
);

export default App;
