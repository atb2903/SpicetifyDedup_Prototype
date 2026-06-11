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
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DedupPage } from '../../src/ui/DedupPage';
import styles from '../../src/ui/DedupPage.module.scss';
import { PlaylistsStoreProvider } from '../../src/store/PlaylistsStoreContext';
import { DetectionStoreProvider } from '../../src/store/DetectionStoreContext';
import { createPlaylistsStore } from '../../src/store/playlists-store';
import { createDetectionStore } from '../../src/store/detection-store';
import { FakePlaylistsLoader } from '../../src/adapters/fake-playlists-loader';
import { PlaylistsLoaderError } from '../../src/domain/errors';
import type { DetectionScanner } from '../../src/ports/detection-scanner';

/** Stub scanner that never resolves — safe for render-only tests. */
function makeHangingScanner(): DetectionScanner {
  return { scan: vi.fn(() => new Promise<never>(() => {})) };
}

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

/**
 * Render helper that wraps DedupPage in both required providers.
 * The detection store uses a hanging scanner — tests do not exercise
 * detection state directly (that is covered by DedupButton/row tests).
 */
function renderDedupPage(store: ReturnType<typeof createPlaylistsStore>) {
  const detectionStore = createDetectionStore(makeHangingScanner());
  return render(
    <PlaylistsStoreProvider store={store}>
      <DetectionStoreProvider store={detectionStore}>
        <DedupPage />
      </DetectionStoreProvider>
    </PlaylistsStoreProvider>,
  );
}

describe('DedupPage', () => {
  it('routes idle → IdleView (Load button present)', () => {
    const { store } = makeStore('success');
    renderDedupPage(store);
    expect(
      screen.getByRole('button', { name: /load/i }),
    ).toBeInTheDocument();
  });

  it('routes loading → LoadingView (status role)', async () => {
    const { store } = makeStore('success');
    const triggerPromise = store.getState().triggerLoad();
    renderDedupPage(store);
    expect(screen.getByRole('status')).toBeInTheDocument();
    await triggerPromise;
  });

  it('routes loaded → LoadedView (Liked Songs row visible)', async () => {
    const { store } = makeStore('success');
    await store.getState().triggerLoad();
    renderDedupPage(store);
    expect(screen.getByText('Liked Songs')).toBeInTheDocument();
  });

  it('routes empty → EmptyView (distinct copy, no spinner, no retry)', async () => {
    const { store } = makeStore('empty');
    await store.getState().triggerLoad();
    renderDedupPage(store);
    expect(screen.getByText(/no dedup-eligible/i)).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
    expect(
      screen.queryByRole('button', { name: /retry/i }),
    ).toBeNull();
  });

  it('routes failed → FailedView (alert role + Retry button)', async () => {
    const { store } = makeStore('failure');
    await store.getState().triggerLoad();
    renderDedupPage(store);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /retry/i }),
    ).toBeInTheDocument();
  });

  it('FR-001 — root wraps view in a scroll-surface element carrying the page CSS-module class', () => {
    // The fix's contract: DedupPage owns its scroll surface. The wrapper
    // element exposes the CSS-module `page` class (a real, non-empty
    // string emitted by Vite's CSS-module resolver). Without the wrapper
    // the view renders flush to the host body and the Load button center
    // falls inside `.main-topBar-container`'s bounding box, which is the
    // live-client defect captured in spec §1 P1.
    const { store } = makeStore('success');
    const { container } = renderDedupPage(store);
    const pageClass = (styles as { page?: string }).page;
    expect(typeof pageClass).toBe('string');
    expect(pageClass).not.toBe('');
    // The first rendered element (root of DedupPage) must carry the class.
    const root = container.firstElementChild as HTMLElement | null;
    expect(root).not.toBeNull();
    expect(root!.className).toContain(pageClass!);
    // And the Load button must live inside that wrapper, so any
    // offset/scroll behavior owned by the wrapper applies to it.
    const btn = screen.getByRole('button', { name: /load/i });
    expect(root!.contains(btn)).toBe(true);
  });

  it('FR-001 — DedupPage.module.scss declares a scroll surface with topbar-aware padding-top', () => {
    // happy-dom does not run a layout engine, so we cannot probe
    // getBoundingClientRect / elementFromPoint with the fidelity needed
    // to assert geometric non-occlusion (research §4 fallback). Instead,
    // assert the CSS rule that produces the geometry — read the SCSS
    // source from disk and confirm both load-bearing declarations are
    // present. The shape is encoded as plain text so a future edit that
    // removes either declaration breaks this test.
    const scssPath = join(
      __dirname,
      '..',
      '..',
      'src',
      'ui',
      'DedupPage.module.scss',
    );
    const src = readFileSync(scssPath, 'utf8');
    // Scroll surface: the page must scroll on overflow, not the host body.
    expect(src).toMatch(/overflow-y\s*:\s*auto/);
    // Topbar-aware offset: a CSS custom property + a non-zero fallback
    // value derived from the 2026-06-03 live probe (spec §1, notes
    // §T001). Future tuning re-assigns the variable; the fallback keeps
    // the page safe if nothing writes the variable.
    expect(src).toMatch(
      /padding-top\s*:\s*var\(\s*--dedup-topbar-offset\s*,\s*\d{2,3}px\s*\)/,
    );
    // And: no selectors against Spotify's hashed/rotating chrome classes
    // (research §1 guardrail). The CSS rule must be self-contained.
    expect(src).not.toMatch(/\.main-[a-z]/i);
  });

  it('end-to-end: idle → trigger → loaded transition is visible in the DOM', async () => {
    const { store } = makeStore('success');
    renderDedupPage(store);
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
