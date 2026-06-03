/**
 * Tests for the React context bridge introduced by WP07 to give UI
 * components access to the load-state store without importing it as a
 * module-level singleton.
 *
 * Behaviour pinned here:
 * - Selector resolves to the live store value when the consumer is
 *   nested inside a `PlaylistsStoreProvider`.
 * - Selector re-evaluates when the store transitions (the bound hook
 *   subscribes to Zustand mutations).
 * - Calling `usePlaylistsStore` outside a provider throws — fail loud,
 *   so a wiring mistake in WP09 is impossible to mistake for "empty
 *   state".
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { act, render, renderHook, screen } from '@testing-library/react';
import {
  PlaylistsStoreProvider,
  usePlaylistsStore,
} from '../../src/store/PlaylistsStoreContext';
import { createPlaylistsStore } from '../../src/store/playlists-store';
import { FakePlaylistsLoader } from '../../src/adapters/fake-playlists-loader';

describe('PlaylistsStoreContext', () => {
  it('exposes the store value to consumers inside the provider', () => {
    const loader = new FakePlaylistsLoader({
      kind: 'success',
      playlists: [],
      likedSongs: { trackCount: 0 },
    });
    const store = createPlaylistsStore(loader);

    function KindProbe() {
      const kind = usePlaylistsStore((s) => s.loadState.kind);
      return <span data-testid="kind">{kind}</span>;
    }

    render(
      <PlaylistsStoreProvider store={store}>
        <KindProbe />
      </PlaylistsStoreProvider>,
    );

    expect(screen.getByTestId('kind').textContent).toBe('idle');
  });

  it('re-renders subscribers when the store transitions', async () => {
    const loader = new FakePlaylistsLoader({
      kind: 'success',
      playlists: [],
      likedSongs: { trackCount: 1 },
    });
    const store = createPlaylistsStore(loader);

    function KindProbe() {
      const kind = usePlaylistsStore((s) => s.loadState.kind);
      return <span data-testid="kind">{kind}</span>;
    }

    render(
      <PlaylistsStoreProvider store={store}>
        <KindProbe />
      </PlaylistsStoreProvider>,
    );
    expect(screen.getByTestId('kind').textContent).toBe('idle');

    await act(async () => {
      await store.getState().triggerLoad();
    });

    expect(screen.getByTestId('kind').textContent).toBe('loaded');
  });

  it('throws a clear error when used outside a PlaylistsStoreProvider', () => {
    expect(() =>
      renderHook(() => usePlaylistsStore((s) => s.loadState.kind)),
    ).toThrow(/must be used inside <PlaylistsStoreProvider>/);
  });
});
