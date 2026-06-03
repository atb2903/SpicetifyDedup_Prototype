import { describe, it, expect } from 'vitest';
import type { PlaylistsLoader } from '../../src/ports/playlists-loader';
import { FakePlaylistsLoader } from '../../src/adapters/fake-playlists-loader';
import {
  PlaylistsLoaderError,
  isPlaylistsLoaderError,
} from '../../src/domain/errors';
import type {
  RawCollection,
  LikedSongsSummary,
} from '../../src/domain/view-models';

/**
 * Cross-implementation contract test for `PlaylistsLoader`.
 *
 * The exported `runPlaylistsLoaderContract` factory is the executable
 * spec of the port: any implementation that passes this suite satisfies
 * the contract documented in
 * `kitty-specs/load-dedupable-playlists-01KT3XW3/contracts/playlists-loader-port.md`.
 *
 * WP05 re-imports this factory and runs it against the production
 * `SpicetifyPlaylistsLoader` (built atop `vi.stubGlobal('Spicetify', ...)`),
 * so the same suite gates both adapters.
 */
export function runPlaylistsLoaderContract(
  name: string,
  factory: (
    result:
      | { playlists: RawCollection[]; likedSongs: LikedSongsSummary }
      | { throws: PlaylistsLoaderError },
  ) => PlaylistsLoader,
): void {
  describe(`PlaylistsLoader contract — ${name}`, () => {
    const SAMPLE_PLAYLIST: RawCollection = {
      uri: 'spotify:playlist:abc',
      name: 'My Playlist',
      owner: { kind: 'self', displayName: 'me' },
      trackCount: 10,
      imageUrl: 'https://i.scdn.co/image/abc',
      isOwnedByMe: true,
      isCollaborative: false,
      canEdit: false,
    };
    const SAMPLE_LIKED: LikedSongsSummary = { trackCount: 42 };

    it('resolves with the configured result on success', async () => {
      const loader = factory({
        playlists: [SAMPLE_PLAYLIST],
        likedSongs: SAMPLE_LIKED,
      });
      const result = await loader.load();
      expect(result.playlists).toEqual([SAMPLE_PLAYLIST]);
      expect(result.likedSongs).toEqual(SAMPLE_LIKED);
    });

    it('resolves with empty arrays when the library has nothing', async () => {
      const loader = factory({
        playlists: [],
        likedSongs: { trackCount: 0 },
      });
      const result = await loader.load();
      expect(result.playlists).toEqual([]);
      expect(result.likedSongs).toEqual({ trackCount: 0 });
    });

    it.each([
      'rootlist-fetch-failed',
      'rootlist-item-missing-name',
      'rootlist-item-missing-owner',
      'rootlist-item-invalid-track-count',
      'rootlist-item-missing-flag',
      'rootlist-item-unsupported-shape',
      'liked-songs-fetch-failed',
      'liked-songs-invalid-track-count',
      'host-unavailable',
      'host-auth-expired',
    ] as const)(
      'throws PlaylistsLoaderError with reason %s when configured',
      async (reason) => {
        const loader = factory({
          throws: new PlaylistsLoaderError(reason, `test: ${reason}`),
        });
        await expect(loader.load()).rejects.toSatisfy(
          (e: unknown) =>
            isPlaylistsLoaderError(e) && e.reason === reason,
        );
      },
    );

    it('does not return a partial result on failure', async () => {
      const loader = factory({
        throws: new PlaylistsLoaderError('rootlist-fetch-failed', 'x'),
      });
      await expect(loader.load()).rejects.toBeInstanceOf(
        PlaylistsLoaderError,
      );
    });
  });
}

runPlaylistsLoaderContract('FakePlaylistsLoader', (result) => {
  if ('throws' in result) {
    return new FakePlaylistsLoader({
      kind: 'failure',
      throws: result.throws,
    });
  }
  return new FakePlaylistsLoader({
    kind: 'success',
    playlists: result.playlists,
    likedSongs: result.likedSongs,
  });
});

describe('FakePlaylistsLoader specifics', () => {
  it('starts with callCount 0 and increments on each invocation', async () => {
    const loader = new FakePlaylistsLoader({
      kind: 'success',
      playlists: [],
      likedSongs: { trackCount: 0 },
    });
    expect(loader.callCount).toBe(0);
    await loader.load();
    expect(loader.callCount).toBe(1);
    await loader.load();
    expect(loader.callCount).toBe(2);
  });

  it('increments callCount on the failure-throwing variant too', async () => {
    const loader = new FakePlaylistsLoader({
      kind: 'failure',
      throws: new PlaylistsLoaderError('rootlist-fetch-failed', 'x'),
    });
    await expect(loader.load()).rejects.toBeInstanceOf(PlaylistsLoaderError);
    expect(loader.callCount).toBe(1);
  });
});
