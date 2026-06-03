/**
 * DedupPage tests (T036 / WP09).
 *
 * `DedupPage` is the top-level router that switches on `loadState.kind`
 * and renders the matching view. These tests assert one branch per
 * `LoadState` variant plus an end-to-end idle → trigger → loaded
 * transition driven through the store, not through internal calls.
 *
 * The page itself does not own the store — it consumes
 * `usePlaylistsStore` and trusts the surrounding
 * `PlaylistsStoreProvider`. Each case here builds a fresh store wired
 * to a `FakePlaylistsLoader` so cases are independent.
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DedupPage } from '../../src/ui/DedupPage';
import { PlaylistsStoreProvider } from '../../src/store/PlaylistsStoreContext';
import { createPlaylistsStore } from '../../src/store/playlists-store';
import { FakePlaylistsLoader } from '../../src/adapters/fake-playlists-loader';
import { PlaylistsLoaderError } from '../../src/domain/errors';

const makeStore = (variant: 'success' | 'empty' | 'failure') => {
  const loader =
    variant === 'failure'
      ? new FakePlaylistsLoader({
          kind: 'failure',
          throws: new PlaylistsLoaderError(
            'host-unavailable',
            'forced failure for DedupPage test',
          ),
        })
      : new FakePlaylistsLoader({
          kind: 'success',
          playlists: [],
          likedSongs: { trackCount: variant === 'success' ? 1 : 0 },
        });
  return { loader, store: createPlaylistsStore(loader) };
};

describe('DedupPage', () => {
  it('routes idle → IdleView (Load button present)', () => {
    const { store } = makeStore('success');
    render(
      <PlaylistsStoreProvider store={store}>
        <DedupPage />
      </PlaylistsStoreProvider>,
    );
    expect(
      screen.getByRole('button', { name: /load/i }),
    ).toBeInTheDocument();
  });

  it('routes loading → LoadingView (status role)', async () => {
    const { store } = makeStore('success');
    const triggerPromise = store.getState().triggerLoad();
    render(
      <PlaylistsStoreProvider store={store}>
        <DedupPage />
      </PlaylistsStoreProvider>,
    );
    expect(screen.getByRole('status')).toBeInTheDocument();
    await triggerPromise;
  });

  it('routes loaded → LoadedView (Liked Songs row visible)', async () => {
    const { store } = makeStore('success');
    await store.getState().triggerLoad();
    render(
      <PlaylistsStoreProvider store={store}>
        <DedupPage />
      </PlaylistsStoreProvider>,
    );
    expect(screen.getByText('Liked Songs')).toBeInTheDocument();
  });

  it('routes empty → EmptyView (distinct copy, no spinner, no retry)', async () => {
    const { store } = makeStore('empty');
    await store.getState().triggerLoad();
    render(
      <PlaylistsStoreProvider store={store}>
        <DedupPage />
      </PlaylistsStoreProvider>,
    );
    expect(screen.getByText(/no dedup-eligible/i)).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
    expect(
      screen.queryByRole('button', { name: /retry/i }),
    ).toBeNull();
  });

  it('routes failed → FailedView (alert role + Retry button)', async () => {
    const { store } = makeStore('failure');
    await store.getState().triggerLoad();
    render(
      <PlaylistsStoreProvider store={store}>
        <DedupPage />
      </PlaylistsStoreProvider>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /retry/i }),
    ).toBeInTheDocument();
  });

  it('end-to-end: idle → trigger → loaded transition is visible in the DOM', async () => {
    const { store } = makeStore('success');
    render(
      <PlaylistsStoreProvider store={store}>
        <DedupPage />
      </PlaylistsStoreProvider>,
    );
    expect(
      screen.getByRole('button', { name: /load/i }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /load/i }));
    // Flush microtasks so the loader promise resolves and the store
    // transitions to `loaded`.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByText('Liked Songs')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /load/i }),
    ).toBeNull();
  });
});
