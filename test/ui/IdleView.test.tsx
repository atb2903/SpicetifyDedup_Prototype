/**
 * IdleView tests (T028 / WP07).
 *
 * Each test constructs a fresh store wired to a `FakePlaylistsLoader` and
 * renders `IdleView` inside `PlaylistsStoreProvider`. SC-6 is enforced:
 * before the user clicks the Load button, the loader has been called zero
 * times. After the click, exactly one call has been issued.
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IdleView } from '../../src/ui/IdleView';
import {
  PlaylistsStoreProvider,
} from '../../src/store/PlaylistsStoreContext';
import { createPlaylistsStore } from '../../src/store/playlists-store';
import { FakePlaylistsLoader } from '../../src/adapters/fake-playlists-loader';

const makeStore = () => {
  const loader = new FakePlaylistsLoader({
    kind: 'success',
    playlists: [],
    likedSongs: { trackCount: 1 },
  });
  const store = createPlaylistsStore(loader);
  return { loader, store };
};

describe('IdleView', () => {
  it('renders a Load button with an accessible name', () => {
    const { store } = makeStore();
    render(
      <PlaylistsStoreProvider store={store}>
        <IdleView />
      </PlaylistsStoreProvider>,
    );
    expect(
      screen.getByRole('button', { name: /load/i }),
    ).toBeInTheDocument();
  });

  it('does not call the loader before the button is clicked (SC-6)', () => {
    const { loader, store } = makeStore();
    render(
      <PlaylistsStoreProvider store={store}>
        <IdleView />
      </PlaylistsStoreProvider>,
    );
    expect(loader.callCount).toBe(0);
  });

  it('calls the loader exactly once after a single click', async () => {
    const { loader, store } = makeStore();
    render(
      <PlaylistsStoreProvider store={store}>
        <IdleView />
      </PlaylistsStoreProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /load/i }));
    // `triggerLoad` is fire-and-forget; flush the microtask queue.
    await Promise.resolve();
    await Promise.resolve();
    expect(loader.callCount).toBe(1);
  });

  it('renders idle copy that explains what the button does', () => {
    const { store } = makeStore();
    render(
      <PlaylistsStoreProvider store={store}>
        <IdleView />
      </PlaylistsStoreProvider>,
    );
    expect(
      screen.getByText(/load your dedup-able playlists/i),
    ).toBeInTheDocument();
  });
});
