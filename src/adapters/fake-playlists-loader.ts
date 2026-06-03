/**
 * In-memory `PlaylistsLoader` for tests.
 *
 * Parameterized at construction with a discriminated `FakeLoaderResult`:
 * either a `success` variant carrying the domain payload to resolve with,
 * or a `failure` variant carrying the `PlaylistsLoaderError` to throw.
 *
 * This file lives under `src/adapters/` so the architecture test treats
 * it like any other adapter (must not import from `store/` or `ui/`),
 * keeping the boundary rules uniform across production and test doubles.
 *
 * The `callCount` field is the simplest mechanism for tests to assert
 * "the port was called exactly N times" — including the critical
 * "zero calls before the explicit user trigger" assertion (SC-6).
 */
import type { PlaylistsLoader } from '../ports/playlists-loader';
import type {
  RawCollection,
  LikedSongsSummary,
} from '../domain/view-models';
import type { PlaylistsLoaderError } from '../domain/errors';

export type FakeLoaderResult =
  | {
      kind: 'success';
      playlists: RawCollection[];
      likedSongs: LikedSongsSummary;
    }
  | { kind: 'failure'; throws: PlaylistsLoaderError };

export class FakePlaylistsLoader implements PlaylistsLoader {
  /** Number of times `load()` has been invoked on this instance. */
  callCount = 0;

  constructor(private readonly result: FakeLoaderResult) {}

  async load(): Promise<{
    playlists: RawCollection[];
    likedSongs: LikedSongsSummary;
  }> {
    this.callCount += 1;
    if (this.result.kind === 'failure') {
      throw this.result.throws;
    }
    return {
      playlists: this.result.playlists,
      likedSongs: this.result.likedSongs,
    };
  }
}
