/**
 * Spicetify Custom App entry. Mounts the Dedup page inside the
 * production store providers and the route-reset lifecycle bridge.
 *
 * WP08 (T025): adds `DetectionStoreProvider` wrapping `RouteResetProvider`.
 *
 * Singleton construction order (module load, side-effect-free):
 * 1. `productionPlaylistsStore` — backed by `SpicetifyPlaylistsLoader`.
 * 2. `productionDetectionStore` — backed by `createDetectionScanner`
 *    (which composes `SpicetifyTracksEnumerator` + `InlineCatalogEnricher`)
 *    and the `SpicetifyRemovalExecutor` (injected as the second argument so the
 *    per-row removal flow can mutate the live library — WP07 / T024).
 *
 * `app.tsx` is the ONLY place authorized to instantiate production adapters
 * (ADR-0001); rows import the store context + domain types only.
 *
 * All adapter constructors are side-effect-free at construction time:
 * no `Spicetify.*` access happens until the user triggers an action. The
 * `SpicetifyRemovalExecutor` reads `globalThis.Spicetify.Platform` lazily
 * (per-call), exactly like `SpicetifyTracksEnumerator`, so constructing it at
 * module load touches no host global. This preserves the test environment's
 * ability to import `src/app.tsx` without Spicetify globals (verified by
 * `test/app.test.tsx`).
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
import { SpicetifyRemovalExecutor } from './adapters/spicetify-removal-executor';

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

/**
 * Production removal executor — mutates the live library via the Spicetify
 * Platform APIs. Side-effect-free at construction (reads
 * `globalThis.Spicetify.Platform` lazily, per host call).
 */
const removalExecutor = new SpicetifyRemovalExecutor();
const productionDetectionStore = createDetectionStore(
  detectionScanner,
  removalExecutor,
);

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
