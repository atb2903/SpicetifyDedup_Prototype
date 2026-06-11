/**
 * Spicetify Custom App entry. Mounts the Dedup page inside the
 * production store providers and the route-reset lifecycle bridge.
 *
 * WP08 (T025): adds `DetectionStoreProvider` wrapping `RouteResetProvider`.
 *
 * Singleton construction order (module load, side-effect-free):
 * 1. `productionPlaylistsStore` — backed by `SpicetifyPlaylistsLoader`.
 * 2. `productionDetectionStore` — backed by `createDetectionScanner`
 *    (which composes `SpicetifyTracksEnumerator` + `InlineCatalogEnricher`).
 *
 * All adapter constructors are side-effect-free at construction time:
 * no `Spicetify.*` access happens until the user triggers an action. This
 * preserves the test environment's ability to import `src/app.tsx` without
 * Spicetify globals (verified by `test/app.test.tsx`).
 *
 * Provider order: `PlaylistsStoreProvider` → `DetectionStoreProvider` →
 * `RouteResetProvider` → `DedupPage`. `RouteResetProvider` reads from both
 * store contexts (FR-012), so both providers must be above it.
 *
 * @see `.claude/adr/0005-react-lifecycle-reset.md` — RouteResetProvider design.
 * @see `data-model.md §8` — DetectionStoreState shape.
 */
import React from 'react';
import { DedupPage } from './ui/DedupPage';
import { createPlaylistsStore } from './store/playlists-store';
import { PlaylistsStoreProvider } from './store/PlaylistsStoreContext';
import { RouteResetProvider } from './store/RouteResetContext';
import { SpicetifyPlaylistsLoader } from './adapters/spicetify-playlists-loader';
import { SpicetifyTracksEnumerator } from './adapters/spicetify-tracks-enumerator';
import { InlineCatalogEnricher } from './adapters/inline-catalog-enricher';
import { createDetectionScanner } from './adapters/detection-scanner';
import { createDetectionStore } from './store/detection-store';
import { DetectionStoreProvider } from './store/DetectionStoreContext';

/** Production playlists store — uses the Spicetify rootlist/library APIs. */
const productionPlaylistsStore = createPlaylistsStore(new SpicetifyPlaylistsLoader());

/**
 * Production detection store — scanner composed from Spicetify adapters.
 *
 * Constructor calls are side-effect-free: no `Spicetify.*` globals are
 * accessed at construction time.
 */
const detectionScanner = createDetectionScanner(
  new SpicetifyTracksEnumerator(),
  new InlineCatalogEnricher(),
);
const productionDetectionStore = createDetectionStore(detectionScanner);

const App = () => (
  <PlaylistsStoreProvider store={productionPlaylistsStore}>
    <DetectionStoreProvider store={productionDetectionStore}>
      <RouteResetProvider>
        <DedupPage />
      </RouteResetProvider>
    </DetectionStoreProvider>
  </PlaylistsStoreProvider>
);

export default App;
