/**
 * Tests for `bindPlaylistsHook` — the React-binding helper exported
 * from `src/store/playlists-store.ts`.
 *
 * WP09 will create the production singleton (`createPlaylistsStore` +
 * `bindPlaylistsHook`); UI consumers (WP07/WP08) call the bound hook
 * with selectors. This test verifies that the hook subscribes to store
 * mutations and re-renders the consuming component.
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import {
  bindPlaylistsHook,
  createPlaylistsStore,
} from '../../src/store/playlists-store';
import { FakePlaylistsLoader } from '../../src/adapters/fake-playlists-loader';

describe('bindPlaylistsHook', () => {
  it('returns a hook that reflects the current loadState kind', () => {
    const loader = new FakePlaylistsLoader({
      kind: 'success',
      playlists: [],
      likedSongs: { trackCount: 0 },
    });
    const store = createPlaylistsStore(loader);
    const usePlaylistsStore = bindPlaylistsHook(store);

    function KindProbe() {
      const kind = usePlaylistsStore((s) => s.loadState.kind);
      return <span data-testid="kind">{kind}</span>;
    }

    render(<KindProbe />);
    expect(screen.getByTestId('kind').textContent).toBe('idle');
  });

  it('re-renders when the store transitions to a new state', async () => {
    const loader = new FakePlaylistsLoader({
      kind: 'success',
      playlists: [],
      likedSongs: { trackCount: 1 },
    });
    const store = createPlaylistsStore(loader);
    const usePlaylistsStore = bindPlaylistsHook(store);

    function KindProbe() {
      const kind = usePlaylistsStore((s) => s.loadState.kind);
      return <span data-testid="kind">{kind}</span>;
    }

    render(<KindProbe />);
    expect(screen.getByTestId('kind').textContent).toBe('idle');

    await act(async () => {
      await store.getState().triggerLoad();
    });

    expect(screen.getByTestId('kind').textContent).toBe('loaded');
  });
});
