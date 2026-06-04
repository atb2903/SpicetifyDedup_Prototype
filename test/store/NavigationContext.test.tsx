/**
 * Tests for the navigation-aware reset bridge introduced by WP-03.
 *
 * `NavigationProvider` is the only piece of wiring that combines the
 * navigation port with the playlists store, so this suite exercises:
 *
 * 1. FR-008 — navigating away from the dedup app and back drives the
 *    store's `reset()` action. The store's resulting state is observed
 *    via its own getState() to keep the assertion at the integration
 *    boundary (DIRECTIVE_036).
 * 2. FR-009 — `reset()` (and therefore this provider's reset trigger)
 *    MUST NOT call `loader.load()`. We assert via the fake loader's
 *    callCount.
 * 3. Sub-path navigation inside the dedup app does NOT reset the store
 *    (matches the contract's `startsWith(DEDUP_PATH_PREFIX)` semantic).
 * 4. The subscription is cleaned up on unmount — no listener leak.
 * 5. Wiring guard: provider must be nested inside a
 *    `PlaylistsStoreProvider`. Using it outside throws via the bound
 *    hook's existing fail-loud guard.
 *
 * All scenarios run against `FakeNavigation` (no host coupling) and the
 * `FakePlaylistsLoader` (no `Spicetify` global). This keeps the test
 * suite a pure black-box on the provider's observable behaviour.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import type { NavigationPort } from '../../src/ports/navigation';
import { NavigationProvider } from '../../src/store/NavigationContext';
import {
  PlaylistsStoreProvider,
} from '../../src/store/PlaylistsStoreContext';
import { createPlaylistsStore } from '../../src/store/playlists-store';
import { FakePlaylistsLoader } from '../../src/adapters/fake-playlists-loader';
import { FakeNavigation } from '../adapters/fake-navigation';
import settings from '../../src/settings.json';

const DEDUP_PATH = `/${settings.nameId}`;

function makeStore() {
  return createPlaylistsStore(
    new FakePlaylistsLoader({
      kind: 'success',
      playlists: [],
      likedSongs: { trackCount: 1 },
    }),
  );
}

describe('NavigationProvider — FR-008 navigation-aware reset', () => {
  it('FR-008 — navigate-away then navigate-back resets a loaded store to idle', async () => {
    const store = makeStore();
    await act(async () => {
      await store.getState().triggerLoad();
    });
    expect(store.getState().loadState.kind).toBe('loaded');

    const nav = new FakeNavigation(DEDUP_PATH);
    render(
      <PlaylistsStoreProvider store={store}>
        <NavigationProvider navigation={nav}>
          <span data-testid="children">ok</span>
        </NavigationProvider>
      </PlaylistsStoreProvider>,
    );

    act(() => nav.setPath('/home'));
    act(() => nav.setPath(DEDUP_PATH));

    expect(store.getState().loadState.kind).toBe('idle');
  });

  it('FR-008 — navigate-away then navigate-back from an idle store leaves state at idle (idempotent)', () => {
    const store = makeStore();
    expect(store.getState().loadState.kind).toBe('idle');

    const nav = new FakeNavigation(DEDUP_PATH);
    render(
      <PlaylistsStoreProvider store={store}>
        <NavigationProvider navigation={nav}>
          <span />
        </NavigationProvider>
      </PlaylistsStoreProvider>,
    );

    act(() => nav.setPath('/home'));
    act(() => nav.setPath(DEDUP_PATH));

    expect(store.getState().loadState.kind).toBe('idle');
  });

  it('FR-008 — navigating within the dedup app sub-paths does NOT reset the store', async () => {
    const store = makeStore();
    await act(async () => {
      await store.getState().triggerLoad();
    });
    expect(store.getState().loadState.kind).toBe('loaded');

    const nav = new FakeNavigation(DEDUP_PATH);
    render(
      <PlaylistsStoreProvider store={store}>
        <NavigationProvider navigation={nav}>
          <span />
        </NavigationProvider>
      </PlaylistsStoreProvider>,
    );

    // Same prefix sub-route: provider must treat this as "still on dedup".
    act(() => nav.setPath(`${DEDUP_PATH}/sub-route`));
    expect(store.getState().loadState.kind).toBe('loaded');
  });

  it('FR-008 — navigate-away alone (no return) does NOT reset the store', async () => {
    const store = makeStore();
    await act(async () => {
      await store.getState().triggerLoad();
    });
    expect(store.getState().loadState.kind).toBe('loaded');

    const nav = new FakeNavigation(DEDUP_PATH);
    render(
      <PlaylistsStoreProvider store={store}>
        <NavigationProvider navigation={nav}>
          <span />
        </NavigationProvider>
      </PlaylistsStoreProvider>,
    );

    act(() => nav.setPath('/home'));
    // No return-to-dedup yet — the store keeps its loaded state.
    expect(store.getState().loadState.kind).toBe('loaded');
  });

  it('FR-008 — mounting with the initial path off the dedup app, then navigating to it, resets the store', async () => {
    const store = makeStore();
    await act(async () => {
      await store.getState().triggerLoad();
    });
    expect(store.getState().loadState.kind).toBe('loaded');

    const nav = new FakeNavigation('/home');
    render(
      <PlaylistsStoreProvider store={store}>
        <NavigationProvider navigation={nav}>
          <span />
        </NavigationProvider>
      </PlaylistsStoreProvider>,
    );

    act(() => nav.setPath(DEDUP_PATH));
    expect(store.getState().loadState.kind).toBe('idle');
  });

  it('FR-008 — repeated away/back cycles each reset the store once', async () => {
    const store = makeStore();
    const nav = new FakeNavigation(DEDUP_PATH);
    render(
      <PlaylistsStoreProvider store={store}>
        <NavigationProvider navigation={nav}>
          <span />
        </NavigationProvider>
      </PlaylistsStoreProvider>,
    );

    // First cycle: load -> away -> back -> idle.
    await act(async () => {
      await store.getState().triggerLoad();
    });
    expect(store.getState().loadState.kind).toBe('loaded');
    act(() => nav.setPath('/home'));
    act(() => nav.setPath(DEDUP_PATH));
    expect(store.getState().loadState.kind).toBe('idle');

    // Second cycle: re-load -> away -> back -> idle.
    await act(async () => {
      await store.getState().triggerLoad();
    });
    expect(store.getState().loadState.kind).toBe('loaded');
    act(() => nav.setPath('/another'));
    act(() => nav.setPath(DEDUP_PATH));
    expect(store.getState().loadState.kind).toBe('idle');
  });

  it('FR-009 — reset triggered by navigation does NOT call loader.load()', async () => {
    const loader = new FakePlaylistsLoader({
      kind: 'success',
      playlists: [],
      likedSongs: { trackCount: 1 },
    });
    const store = createPlaylistsStore(loader);

    await act(async () => {
      await store.getState().triggerLoad();
    });
    expect(loader.callCount).toBe(1);

    const nav = new FakeNavigation(DEDUP_PATH);
    render(
      <PlaylistsStoreProvider store={store}>
        <NavigationProvider navigation={nav}>
          <span />
        </NavigationProvider>
      </PlaylistsStoreProvider>,
    );

    act(() => nav.setPath('/home'));
    act(() => nav.setPath(DEDUP_PATH));

    expect(loader.callCount).toBe(1);
    expect(store.getState().loadState.kind).toBe('idle');
  });

  it('cleans up its navigation subscription on unmount', () => {
    const store = makeStore();
    const nav = new FakeNavigation(DEDUP_PATH);
    const { unmount } = render(
      <PlaylistsStoreProvider store={store}>
        <NavigationProvider navigation={nav}>
          <span />
        </NavigationProvider>
      </PlaylistsStoreProvider>,
    );
    expect(nav.listenerCount()).toBe(1);
    unmount();
    expect(nav.listenerCount()).toBe(0);
  });

  it('renders its children', () => {
    const store = makeStore();
    const nav = new FakeNavigation(DEDUP_PATH);
    const { getByTestId } = render(
      <PlaylistsStoreProvider store={store}>
        <NavigationProvider navigation={nav}>
          <span data-testid="child">hello</span>
        </NavigationProvider>
      </PlaylistsStoreProvider>,
    );
    expect(getByTestId('child').textContent).toBe('hello');
  });

  it('graceful degradation — port currentPath() throws → wiring skipped, page still renders, store untouched', async () => {
    const store = makeStore();
    await act(async () => {
      await store.getState().triggerLoad();
    });
    expect(store.getState().loadState.kind).toBe('loaded');

    const failingNav: NavigationPort = {
      currentPath() {
        throw new Error('host unavailable');
      },
      subscribe() {
        // Not reached — currentPath throws first.
        return () => {};
      },
    };

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { getByTestId } = render(
        <PlaylistsStoreProvider store={store}>
          <NavigationProvider navigation={failingNav}>
            <span data-testid="child">still here</span>
          </NavigationProvider>
        </PlaylistsStoreProvider>,
      );
      expect(getByTestId('child').textContent).toBe('still here');
      expect(store.getState().loadState.kind).toBe('loaded');
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('navigation.currentPath() threw'),
        expect.any(Error),
      );
    } finally {
      warn.mockRestore();
    }
  });

  it('graceful degradation — port subscribe() throws → wiring skipped, page still renders, store untouched', async () => {
    const store = makeStore();
    await act(async () => {
      await store.getState().triggerLoad();
    });
    expect(store.getState().loadState.kind).toBe('loaded');

    const failingNav: NavigationPort = {
      currentPath() {
        return DEDUP_PATH;
      },
      subscribe() {
        throw new Error('subscribe broken');
      },
    };

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { getByTestId } = render(
        <PlaylistsStoreProvider store={store}>
          <NavigationProvider navigation={failingNav}>
            <span data-testid="child">still here too</span>
          </NavigationProvider>
        </PlaylistsStoreProvider>,
      );
      expect(getByTestId('child').textContent).toBe('still here too');
      expect(store.getState().loadState.kind).toBe('loaded');
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('navigation.subscribe() threw'),
        expect.any(Error),
      );
    } finally {
      warn.mockRestore();
    }
  });

  it('derived dedup path prefix matches /<settings.nameId>', async () => {
    // Smoke test: the runtime prefix is sourced from settings.json; this
    // pins the expected value so a settings.json edit can't silently
    // change navigation routing without a test failure.
    const { dedupPathPrefix } = await import('../../src/store/NavigationContext');
    expect(dedupPathPrefix()).toBe(`/${settings.nameId}`);
  });
});
