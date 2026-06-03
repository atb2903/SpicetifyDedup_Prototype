/**
 * Spicetify Custom App entry. Mounts the Dedup page inside the
 * production store provider.
 *
 * `productionStore` is created exactly once at module load: this is the
 * only place authorised to instantiate `SpicetifyPlaylistsLoader`.
 * Constructing the adapter is side-effect-free — no `Spicetify.*`
 * access happens until the user clicks Load — so SC-6 (zero
 * pre-trigger host calls) is preserved by the store's contract, not by
 * laziness here.
 */
import React from 'react';
import { DedupPage } from './ui/DedupPage';
import { createPlaylistsStore } from './store/playlists-store';
import { PlaylistsStoreProvider } from './store/PlaylistsStoreContext';
import { SpicetifyPlaylistsLoader } from './adapters/spicetify-playlists-loader';

const productionStore = createPlaylistsStore(new SpicetifyPlaylistsLoader());

const App = () => (
  <PlaylistsStoreProvider store={productionStore}>
    <DedupPage />
  </PlaylistsStoreProvider>
);

export default App;
