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
    // Stable structural query: each row is a `<li>` carrying a stable
    // `data-row-kind` attribute. The row's text content includes the
    // displayName in DOM order; we extract it via a fixed test asserting
    // that one of the visible texts matches each input name. To preserve
    // ordering we look up each row's `data-row-name` test hook.
    const names = Array.from(
      container.querySelectorAll('li'),
    ).map((el) => el.getAttribute('data-row-name'));
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
    const firstRow = container.querySelector('li');
    expect(firstRow?.getAttribute('data-row-kind')).toBe('liked-songs');
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
    const rows = container.querySelectorAll('li');
    expect(rows.length).toBe(2);
    expect(rows[1].getAttribute('data-row-kind')).toBe('playlist');
  });

  it('wraps rows in a single ul container', async () => {
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
    const lists = container.querySelectorAll('ul');
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
    const rows = container.querySelectorAll('li');
    expect(rows.length).toBe(1);
    expect(rows[0].getAttribute('data-row-kind')).toBe('liked-songs');
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
    expect(container.querySelectorAll('li').length).toBe(1001);
  });

  // WP02 / T010 / FR-003: the loaded view's `<ul>` container has its own
  // styling (no default browser bullet markers, a max-width or padding
  // treatment) so it reads visually distinct from the four other state
  // views. Asserts the `list-style` shorthand is `none` and the list is
  // width-constrained — happy-dom does not expand to the `listStyleType`
  // longhand, so we use the shorthand string the CSS module sets.
  it('FR-003 — Loaded view list container has list-style: none (styled list)', async () => {
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
    const list = container.querySelector('ul') as HTMLElement;
    expect(list).not.toBeNull();
    const cs = getComputedStyle(list);
    expect(cs.listStyle).toBe('none');
    expect(cs.maxWidth).not.toBe('');
    expect(cs.maxWidth).not.toBe('none');
  });
});
