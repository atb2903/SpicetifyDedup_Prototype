/**
 * Tests for the Zustand load-state store (WP06).
 *
 * Pure-TypeScript tests over the vanilla store factory; no React renderer
 * is involved here (the React hook binding is exercised by WP07/WP08).
 */

import { describe, it, expect } from 'vitest';
import { createPlaylistsStore } from '../../src/store/playlists-store';
import { FakePlaylistsLoader } from '../../src/adapters/fake-playlists-loader';
import { PlaylistsLoaderError } from '../../src/domain/errors';
import type { PlaylistsLoader } from '../../src/ports/playlists-loader';
import type { RawCollection } from '../../src/domain/view-models';

const PL_SELF: RawCollection = {
  uri: 'spotify:playlist:self',
  name: 'My Playlist',
  owner: { kind: 'self', displayName: 'me' },
  trackCount: 5,
  imageUrl: null,
  isOwnedByMe: true,
  isCollaborative: false,
  canEdit: false,
};

const PL_COLLAB_EDITABLE: RawCollection = {
  uri: 'spotify:playlist:collab-editable',
  name: 'Shared Editable',
  owner: { kind: 'other', displayName: 'friend' },
  trackCount: 12,
  imageUrl: null,
  isOwnedByMe: false,
  isCollaborative: true,
  canEdit: true,
};

const PL_FOLLOWED: RawCollection = {
  uri: 'spotify:playlist:followed',
  name: 'Followed (not eligible)',
  owner: { kind: 'other', displayName: 'curator' },
  trackCount: 30,
  imageUrl: null,
  isOwnedByMe: false,
  isCollaborative: false,
  canEdit: false,
};

describe('createPlaylistsStore — initial state', () => {
  it('initial state is idle', () => {
    const loader = new FakePlaylistsLoader({
      kind: 'success',
      playlists: [],
      likedSongs: { trackCount: 0 },
    });
    const store = createPlaylistsStore(loader);
    expect(store.getState().loadState).toEqual({ kind: 'idle' });
  });

  it('does not call the loader before triggerLoad is invoked (SC-6)', () => {
    const loader = new FakePlaylistsLoader({
      kind: 'success',
      playlists: [],
      likedSongs: { trackCount: 0 },
    });
    createPlaylistsStore(loader);
    expect(loader.callCount).toBe(0);
  });
});

describe('triggerLoad — happy path', () => {
  it('transitions idle → loading → loaded with view models (Liked Songs pinned first)', async () => {
    const loader = new FakePlaylistsLoader({
      kind: 'success',
      playlists: [PL_SELF],
      likedSongs: { trackCount: 42 },
    });
    const store = createPlaylistsStore(loader);
    await store.getState().triggerLoad();
    const state = store.getState();
    expect(state.loadState.kind).toBe('loaded');
    if (state.loadState.kind === 'loaded') {
      expect(state.loadState.items).toHaveLength(2);
      expect(state.loadState.items[0].kind).toBe('liked-songs');
      expect(state.loadState.items[0].trackCount).toBe(42);
      expect(state.loadState.items[1].kind).toBe('playlist');
      expect(state.loadState.items[1].key).toBe(PL_SELF.uri);
    }
    expect(loader.callCount).toBe(1);
  });

  it('filters out non-eligible playlists before view-model construction', async () => {
    const loader = new FakePlaylistsLoader({
      kind: 'success',
      playlists: [PL_SELF, PL_FOLLOWED, PL_COLLAB_EDITABLE],
      likedSongs: { trackCount: 0 },
    });
    const store = createPlaylistsStore(loader);
    await store.getState().triggerLoad();
    const state = store.getState();
    if (state.loadState.kind !== 'loaded') {
      throw new Error(`expected loaded, got ${state.loadState.kind}`);
    }
    expect(state.loadState.items).toHaveLength(3);
    expect(state.loadState.items.find((i) => i.key === PL_FOLLOWED.uri)).toBeUndefined();
    expect(state.loadState.items.find((i) => i.key === PL_SELF.uri)).toBeDefined();
    expect(state.loadState.items.find((i) => i.key === PL_COLLAB_EDITABLE.uri)).toBeDefined();
  });

  it('briefly transitions through loading (observed via subscribe)', async () => {
    const loader = new FakePlaylistsLoader({
      kind: 'success',
      playlists: [],
      likedSongs: { trackCount: 1 },
    });
    const store = createPlaylistsStore(loader);
    const seen: string[] = [];
    const unsub = store.subscribe((s) => seen.push(s.loadState.kind));
    await store.getState().triggerLoad();
    unsub();
    expect(seen).toEqual(['loading', 'loaded']);
  });
});

describe('triggerLoad — empty and failure paths', () => {
  it('transitions to empty when no eligible playlists AND likedSongs is empty (FR-009)', async () => {
    const loader = new FakePlaylistsLoader({
      kind: 'success',
      playlists: [],
      likedSongs: { trackCount: 0 },
    });
    const store = createPlaylistsStore(loader);
    await store.getState().triggerLoad();
    expect(store.getState().loadState.kind).toBe('empty');
  });

  it('does NOT transition to empty when likedSongs has any tracks (still loaded)', async () => {
    const loader = new FakePlaylistsLoader({
      kind: 'success',
      playlists: [],
      likedSongs: { trackCount: 1 },
    });
    const store = createPlaylistsStore(loader);
    await store.getState().triggerLoad();
    expect(store.getState().loadState.kind).toBe('loaded');
  });

  it('does NOT transition to empty when there are eligible playlists (still loaded)', async () => {
    const loader = new FakePlaylistsLoader({
      kind: 'success',
      playlists: [PL_SELF],
      likedSongs: { trackCount: 0 },
    });
    const store = createPlaylistsStore(loader);
    await store.getState().triggerLoad();
    expect(store.getState().loadState.kind).toBe('loaded');
  });

  it('does NOT transition to empty when all rootlist items are filtered out but likedSongs is non-empty', async () => {
    const loader = new FakePlaylistsLoader({
      kind: 'success',
      playlists: [PL_FOLLOWED],
      likedSongs: { trackCount: 3 },
    });
    const store = createPlaylistsStore(loader);
    await store.getState().triggerLoad();
    expect(store.getState().loadState.kind).toBe('loaded');
  });

  it('transitions to empty when all rootlist items are filtered out AND likedSongs is empty', async () => {
    const loader = new FakePlaylistsLoader({
      kind: 'success',
      playlists: [PL_FOLLOWED],
      likedSongs: { trackCount: 0 },
    });
    const store = createPlaylistsStore(loader);
    await store.getState().triggerLoad();
    expect(store.getState().loadState.kind).toBe('empty');
  });

  it('transitions to failed when the loader throws PlaylistsLoaderError (FR-008)', async () => {
    const err = new PlaylistsLoaderError('host-unavailable', 'no Platform');
    const loader = new FakePlaylistsLoader({ kind: 'failure', throws: err });
    const store = createPlaylistsStore(loader);
    await store.getState().triggerLoad();
    const state = store.getState();
    expect(state.loadState.kind).toBe('failed');
    if (state.loadState.kind === 'failed') {
      expect(state.loadState.reason).toBe(err);
      expect(state.loadState.reason.reason).toBe('host-unavailable');
    }
  });

  it('wraps non-PlaylistsLoaderError throws into rootlist-fetch-failed with cause preserved', async () => {
    const original = new Error('completely unexpected');
    const loader: PlaylistsLoader = {
      async load() {
        throw original;
      },
    };
    const store = createPlaylistsStore(loader);
    await store.getState().triggerLoad();
    const state = store.getState();
    expect(state.loadState.kind).toBe('failed');
    if (state.loadState.kind === 'failed') {
      expect(state.loadState.reason).toBeInstanceOf(PlaylistsLoaderError);
      expect(state.loadState.reason.reason).toBe('rootlist-fetch-failed');
      expect(state.loadState.reason.cause).toBe(original);
    }
  });
});

describe('retry', () => {
  it('from failed re-enters loading then dispatches next outcome', async () => {
    let mode: 'fail' | 'succeed' = 'fail';
    let calls = 0;
    const loader: PlaylistsLoader = {
      async load() {
        calls += 1;
        if (mode === 'fail') {
          throw new PlaylistsLoaderError('rootlist-fetch-failed', 'first try');
        }
        return { playlists: [], likedSongs: { trackCount: 1 } };
      },
    };
    const store = createPlaylistsStore(loader);
    await store.getState().triggerLoad();
    expect(store.getState().loadState.kind).toBe('failed');

    mode = 'succeed';
    const seen: string[] = [];
    const unsub = store.subscribe((s) => seen.push(s.loadState.kind));
    await store.getState().retry();
    unsub();

    expect(seen).toEqual(['loading', 'loaded']);
    expect(store.getState().loadState.kind).toBe('loaded');
    expect(calls).toBe(2);
  });

  it('retry from idle is a no-op (loader not called)', async () => {
    const loader = new FakePlaylistsLoader({
      kind: 'success',
      playlists: [],
      likedSongs: { trackCount: 1 },
    });
    const store = createPlaylistsStore(loader);
    await store.getState().retry();
    expect(store.getState().loadState.kind).toBe('idle');
    expect(loader.callCount).toBe(0);
  });

  it('retry from loaded is a no-op (loader not called)', async () => {
    const loader = new FakePlaylistsLoader({
      kind: 'success',
      playlists: [],
      likedSongs: { trackCount: 1 },
    });
    const store = createPlaylistsStore(loader);
    await store.getState().triggerLoad();
    expect(store.getState().loadState.kind).toBe('loaded');
    const callsAfterLoad = loader.callCount;
    await store.getState().retry();
    expect(store.getState().loadState.kind).toBe('loaded');
    expect(loader.callCount).toBe(callsAfterLoad);
  });

  it('retry from empty is a no-op (loader not called)', async () => {
    const loader = new FakePlaylistsLoader({
      kind: 'success',
      playlists: [],
      likedSongs: { trackCount: 0 },
    });
    const store = createPlaylistsStore(loader);
    await store.getState().triggerLoad();
    expect(store.getState().loadState.kind).toBe('empty');
    const callsAfterLoad = loader.callCount;
    await store.getState().retry();
    expect(store.getState().loadState.kind).toBe('empty');
    expect(loader.callCount).toBe(callsAfterLoad);
  });
});
