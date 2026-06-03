/**
 * LoadedView tests (T034 / WP08).
 *
 * Black-box integration through the store: each test builds a fresh
 * `createPlaylistsStore` wired to a `FakePlaylistsLoader`, triggers the
 * load, then renders `<LoadedView>` inside the provider. Asserts:
 *
 * - Liked Songs pinned first; eligible playlists follow in input order.
 * - The first row is a `LikedSongsRow` instance (dedup-row--liked-songs).
 * - Rendering nothing while the store is not in the `loaded` state.
 * - 1001-row render (Liked Songs + 1000 playlists) does not crash —
 *   NFR-002 headroom.
 *
 * Numeric bounds on `items.length`: 0 (idle), 1 (Liked Songs only),
 * nominal (3 + 1), large (1000 + 1).
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { LoadedView } from '../../src/ui/LoadedView';
import { createPlaylistsStore } from '../../src/store/playlists-store';
import { PlaylistsStoreProvider } from '../../src/store/PlaylistsStoreContext';
import { FakePlaylistsLoader } from '../../src/adapters/fake-playlists-loader';
import type { RawCollection } from '../../src/domain/view-models';

const pl = (uri: string, name: string): RawCollection => ({
  uri,
  name,
  owner: { kind: 'self', displayName: 'me' },
  trackCount: 1,
  imageUrl: null,
  isOwnedByMe: true,
  isCollaborative: false,
  canEdit: false,
});

describe('LoadedView', () => {
  it('renders nothing when the store is not in the loaded state (idle)', () => {
    const loader = new FakePlaylistsLoader({
      kind: 'success',
      playlists: [],
      likedSongs: { trackCount: 0 },
    });
    const store = createPlaylistsStore(loader);
    const { container } = render(
      <PlaylistsStoreProvider store={store}>
        <LoadedView />
      </PlaylistsStoreProvider>,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders Liked Songs first, then each eligible playlist in input order', async () => {
    const loader = new FakePlaylistsLoader({
      kind: 'success',
      playlists: [
        pl('spotify:playlist:a', 'A'),
        pl('spotify:playlist:b', 'B'),
        pl('spotify:playlist:c', 'C'),
      ],
      likedSongs: { trackCount: 42 },
    });
    const store = createPlaylistsStore(loader);
    await store.getState().triggerLoad();
    const { container } = render(
      <PlaylistsStoreProvider store={store}>
        <LoadedView />
      </PlaylistsStoreProvider>,
    );
    const names = Array.from(
      container.querySelectorAll('.dedup-row__name'),
    ).map((el) => el.textContent);
    expect(names).toEqual(['Liked Songs', 'A', 'B', 'C']);
  });

  it('uses the dedicated LikedSongsRow component for the first row', async () => {
    const loader = new FakePlaylistsLoader({
      kind: 'success',
      playlists: [pl('spotify:playlist:a', 'A')],
      likedSongs: { trackCount: 1 },
    });
    const store = createPlaylistsStore(loader);
    await store.getState().triggerLoad();
    const { container } = render(
      <PlaylistsStoreProvider store={store}>
        <LoadedView />
      </PlaylistsStoreProvider>,
    );
    const firstRow = container.querySelector('.dedup-row');
    expect(firstRow?.classList.contains('dedup-row--liked-songs')).toBe(true);
  });

  it('uses the PlaylistRow component for non-liked-songs rows', async () => {
    const loader = new FakePlaylistsLoader({
      kind: 'success',
      playlists: [pl('spotify:playlist:a', 'A')],
      likedSongs: { trackCount: 1 },
    });
    const store = createPlaylistsStore(loader);
    await store.getState().triggerLoad();
    const { container } = render(
      <PlaylistsStoreProvider store={store}>
        <LoadedView />
      </PlaylistsStoreProvider>,
    );
    const rows = container.querySelectorAll('.dedup-row');
    expect(rows.length).toBe(2);
    expect(rows[1].classList.contains('dedup-row--playlist')).toBe(true);
  });

  it('wraps rows in a single ul.dedup-list container', async () => {
    const loader = new FakePlaylistsLoader({
      kind: 'success',
      playlists: [pl('spotify:playlist:a', 'A')],
      likedSongs: { trackCount: 1 },
    });
    const store = createPlaylistsStore(loader);
    await store.getState().triggerLoad();
    const { container } = render(
      <PlaylistsStoreProvider store={store}>
        <LoadedView />
      </PlaylistsStoreProvider>,
    );
    const lists = container.querySelectorAll('ul.dedup-list');
    expect(lists.length).toBe(1);
  });

  it('renders only the pinned Liked Songs row when no playlists are eligible (nominal=1)', async () => {
    const loader = new FakePlaylistsLoader({
      kind: 'success',
      playlists: [],
      likedSongs: { trackCount: 1 },
    });
    const store = createPlaylistsStore(loader);
    await store.getState().triggerLoad();
    const { container } = render(
      <PlaylistsStoreProvider store={store}>
        <LoadedView />
      </PlaylistsStoreProvider>,
    );
    const rows = container.querySelectorAll('.dedup-row');
    expect(rows.length).toBe(1);
    expect(rows[0].classList.contains('dedup-row--liked-songs')).toBe(true);
  });

  it('renders 1001 rows (1000 playlists + Liked Songs) without crashing (NFR-002 headroom)', async () => {
    const many = Array.from({ length: 1000 }, (_, i) =>
      pl(`spotify:playlist:${i}`, `P${i}`),
    );
    const loader = new FakePlaylistsLoader({
      kind: 'success',
      playlists: many,
      likedSongs: { trackCount: 1 },
    });
    const store = createPlaylistsStore(loader);
    await store.getState().triggerLoad();
    const { container } = render(
      <PlaylistsStoreProvider store={store}>
        <LoadedView />
      </PlaylistsStoreProvider>,
    );
    expect(container.querySelectorAll('.dedup-row').length).toBe(1001);
  });
});
