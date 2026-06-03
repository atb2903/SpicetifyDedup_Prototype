/**
 * Port contract — see
 * `kitty-specs/load-dedupable-playlists-01KT3XW3/contracts/playlists-loader-port.md`
 * for the canonical spec.
 *
 * Implementations:
 * - `SpicetifyPlaylistsLoader` (production, WP05) — reads the live
 *   Spicetify rootlist + Liked Songs summary via `Platform.RootlistAPI`
 *   and `Platform.LibraryAPI`.
 * - `FakePlaylistsLoader` (in-memory test double, WP04) — used by every
 *   store and UI test in this mission.
 *
 * Guarantees (mirrored from the contract doc):
 * - **Atomicity.** `load()` resolves with a complete `{ playlists, likedSongs }`
 *   pair or throws `PlaylistsLoaderError`; no partial results.
 * - **Read-only.** The port never invokes a host mutation API.
 * - **Order preservation.** `playlists` is returned in host-native order;
 *   the domain ordering rule (`src/domain/ordering.ts`) pins Liked Songs
 *   separately.
 * - **No host fetches before `load()`.** The adapter performs no Platform
 *   calls from its constructor or module-load side effects.
 *
 * This file is `src/ports/`; per the architecture rules in
 * `test/architecture.test.ts`, it must not import from `adapters/`,
 * `store/`, or `ui/`.
 */
import type {
  RawCollection,
  LikedSongsSummary,
} from '../domain/view-models';

export interface PlaylistsLoader {
  /**
   * Fetch the user's full rootlist plus the Liked Songs summary.
   *
   * Throws `PlaylistsLoaderError` on any failure (network, host
   * unavailable, shape drift, expired auth). Never returns a partial
   * result.
   */
  load(): Promise<{
    playlists: RawCollection[];
    likedSongs: LikedSongsSummary;
  }>;
}
