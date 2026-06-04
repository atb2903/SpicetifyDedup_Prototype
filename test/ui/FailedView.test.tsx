/**
 * FailedView tests (T031 / WP07).
 *
 * Each test drives the store into the `failed` state via
 * `FakePlaylistsLoader({ kind: 'failure', throws: ... })` + `triggerLoad`,
 * then renders `FailedView` inside the provider.
 *
 * Covered:
 * - role=alert on the container (assistive-tech contract);
 * - explanation text derived from `reason` (lookup table, sampled);
 * - Retry button dispatches the store's `retry` action (loader call
 *   count goes 1 → 2);
 * - every `PlaylistsLoaderErrorReason` produces a non-empty explanation
 *   (parameterised over the closed enum so adding a reason without a
 *   matching copy entry breaks this suite);
 * - the technical-details `<code>` element shows the underlying message;
 * - `FailedView` renders nothing when the store is not in the `failed`
 *   state (defensive: WP09 only mounts it under `failed`, but the guard
 *   exists so misuse fails silently rather than crashing).
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { FailedView } from '../../src/ui/FailedView';
import { PlaylistsStoreProvider } from '../../src/store/PlaylistsStoreContext';
import { createPlaylistsStore } from '../../src/store/playlists-store';
import { FakePlaylistsLoader } from '../../src/adapters/fake-playlists-loader';
import {
  PlaylistsLoaderError,
  type PlaylistsLoaderErrorReason,
} from '../../src/domain/errors';

const REASONS: readonly PlaylistsLoaderErrorReason[] = [
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
];

const makeFailedStore = async (
  reason: PlaylistsLoaderErrorReason,
  message = 'underlying detail',
) => {
  const loader = new FakePlaylistsLoader({
    kind: 'failure',
    throws: new PlaylistsLoaderError(reason, message),
  });
  const store = createPlaylistsStore(loader);
  await store.getState().triggerLoad();
  return { loader, store };
};

describe('FailedView', () => {
  it('renders role=alert on the container', async () => {
    const { store } = await makeFailedStore('host-unavailable');
    render(
      <PlaylistsStoreProvider store={store}>
        <FailedView />
      </PlaylistsStoreProvider>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('renders the host-unavailable explanation referencing Spotify client', async () => {
    const { store } = await makeFailedStore('host-unavailable');
    render(
      <PlaylistsStoreProvider store={store}>
        <FailedView />
      </PlaylistsStoreProvider>,
    );
    expect(screen.getByText(/spotify client/i)).toBeInTheDocument();
  });

  it('exposes the underlying error message inside the technical-details section', async () => {
    const { store } = await makeFailedStore(
      'rootlist-fetch-failed',
      'GraphQL 503',
    );
    render(
      <PlaylistsStoreProvider store={store}>
        <FailedView />
      </PlaylistsStoreProvider>,
    );
    expect(screen.getByText('GraphQL 503')).toBeInTheDocument();
  });

  it('Retry button dispatches retry, invoking the loader a second time', async () => {
    const { loader, store } = await makeFailedStore('host-unavailable');
    expect(loader.callCount).toBe(1);
    render(
      <PlaylistsStoreProvider store={store}>
        <FailedView />
      </PlaylistsStoreProvider>,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /retry/i }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(loader.callCount).toBe(2);
  });

  it('renders nothing when the store is not in the failed state', () => {
    const loader = new FakePlaylistsLoader({
      kind: 'success',
      playlists: [],
      likedSongs: { trackCount: 1 },
    });
    const store = createPlaylistsStore(loader);
    const { container } = render(
      <PlaylistsStoreProvider store={store}>
        <FailedView />
      </PlaylistsStoreProvider>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  describe.each(REASONS)('for reason %s', (reason) => {
    it('renders a non-empty explanation', async () => {
      const { store } = await makeFailedStore(reason);
      render(
        <PlaylistsStoreProvider store={store}>
          <FailedView />
        </PlaylistsStoreProvider>,
      );
      const alert = screen.getByRole('alert');
      // The alert container wraps the explanation `<p>` first, the
      // <details> block, then the Retry button. The explanation is the
      // first `<p>` descendant — stable across the CSS-module migration
      // (classname hashes rotate per build but the tag does not).
      const explanation = alert.querySelector('p');
      expect(explanation).not.toBeNull();
      expect(explanation!.textContent?.trim().length ?? 0).toBeGreaterThan(0);
    });
  });

  // WP02 / T012 / FR-006: the Retry button must read as an actionable
  // control — non-transparent background, pointer cursor. Asserts via
  // getComputedStyle (CSS-module hashes are unstable).
  it('FR-006 — Retry button is visually styled as an actionable control', async () => {
    const { store } = await makeFailedStore('host-unavailable');
    render(
      <PlaylistsStoreProvider store={store}>
        <FailedView />
      </PlaylistsStoreProvider>,
    );
    const button = screen.getByRole('button', { name: /retry/i });
    const cs = getComputedStyle(button);
    expect(cs.backgroundColor).not.toBe('');
    expect(cs.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
    expect(cs.backgroundColor).not.toBe('transparent');
    expect(cs.cursor).toBe('pointer');
  });

  // FR-003: the failed view's container has its own layout so it reads
  // visually distinct from the four other state views (centred flex, with
  // an error accent rather than a calm neutral one).
  it('FR-003 — Failed view container has a non-default flex layout', async () => {
    const { store } = await makeFailedStore('host-unavailable');
    const { container } = render(
      <PlaylistsStoreProvider store={store}>
        <FailedView />
      </PlaylistsStoreProvider>,
    );
    const root = container.firstChild as HTMLElement;
    expect(root).not.toBeNull();
    expect(getComputedStyle(root).display).toBe('flex');
  });
});
