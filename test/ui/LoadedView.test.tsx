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
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LoadedView } from '../../src/ui/LoadedView';
import { createPlaylistsStore } from '../../src/store/playlists-store';
import { PlaylistsStoreProvider } from '../../src/store/PlaylistsStoreContext';
import { FakePlaylistsLoader } from '../../src/adapters/fake-playlists-loader';
import type {
  OwnerIdentity,
  RawCollection,
} from '../../src/domain/view-models';

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

/**
 * Variant of `pl()` that lets a test override the `owner` field — used
 * by the FR-006 ownership-variant fixture (T021) where the assertion is
 * "no owner-kind filtering anywhere in the rendered button set".
 *
 * Eligibility (`src/domain/eligibility.ts`) requires
 * `isOwnedByMe || (isCollaborative && canEdit)`. T021 needs every
 * variant — including a hypothetical `system-library`-owned playlist
 * row — to actually reach the render path, so the eligibility booleans
 * here are pinned to `true` rather than derived from `owner.kind`. The
 * test asserts FR-006 ("no ownership filtering"), which is a contract
 * about the *renderer*, not about eligibility; pinning the booleans
 * isolates the FR-006 assertion from the orthogonal eligibility rule.
 */
const plWithOwner = (
  uri: string,
  name: string,
  owner: OwnerIdentity,
): RawCollection => ({
  ...pl(uri, name),
  owner,
  isOwnedByMe: true,
  isCollaborative: true,
  canEdit: true,
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
    // WP05 / T022 / FR-002: every row mounts its own Dedup button.
    // At the 1001-row scale, getAllByRole walks the entire rendered
    // list — asserts both that the button count matches the row
    // count and that the render path has no per-row dedup-button
    // dropout at scale.
    const dedupButtons = screen.getAllByRole('button', { name: /^Dedup / });
    expect(dedupButtons).toHaveLength(1001);
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

/**
 * Integration coverage added by WP05 — exercises the cross-row
 * assertions for FR-002 (1-to-1 button binding), FR-005 (empty state;
 * also pinned independently in EmptyView.test.tsx), FR-006 (no
 * ownership filtering), SC-001 (duplicate-name disambiguation), and
 * C-005 (list-length boundary). All tests drive the view through the
 * real store + FakePlaylistsLoader so the assertions exercise the
 * production wiring, not a synthetic fixture path.
 */
describe('LoadedView — Dedup button list-length boundary (WP05)', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  // C-005 boundary minus-one: when LoadedView is mounted while the
  // store is NOT in the `loaded` FSM cell it renders nothing — so no
  // Dedup buttons can leak from the loaded surface into idle/loading/
  // empty/failed cells. LoadedView's `loaded`-state contract requires
  // at least one row (Liked Songs always pins first), so the nearest
  // legal "zero rows rendered" fixture is the idle state. The FR-005
  // empty-state guard is pinned separately in EmptyView.test.tsx.
  it('renders zero Dedup buttons when the store is not in the loaded state (C-005 lower bound)', () => {
    const loader = new FakePlaylistsLoader({
      kind: 'success',
      playlists: [],
      likedSongs: { trackCount: 0 },
    });
    const store = createPlaylistsStore(loader);
    render(
      <PlaylistsStoreProvider store={store}>
        <LoadedView />
      </PlaylistsStoreProvider>,
    );
    expect(
      screen.queryAllByRole('button', { name: /^Dedup / }),
    ).toEqual([]);
  });

  // C-005 nominal-min: one row → exactly one Dedup button. Liked Songs
  // is the pinned first row; eligibility filtering yields zero playlist
  // rows, so the rendered list has length 1. Click activation must log
  // the Liked Songs URI once.
  it('renders exactly one Dedup button for a Liked-Songs-only fixture (C-005 nominal-min)', async () => {
    const loader = new FakePlaylistsLoader({
      kind: 'success',
      playlists: [],
      likedSongs: { trackCount: 42 },
    });
    const store = createPlaylistsStore(loader);
    await store.getState().triggerLoad();
    render(
      <PlaylistsStoreProvider store={store}>
        <LoadedView />
      </PlaylistsStoreProvider>,
    );
    const buttons = screen.getAllByRole('button', { name: /^Dedup / });
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAccessibleName('Dedup Liked Songs');
    fireEvent.click(buttons[0]);
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(
      '[Dedup] clicked: Liked Songs (spotify:collection:tracks)',
    );
  });

  // C-005 ≥3 rows: 1 Liked Songs + 3 playlists → 4 Dedup buttons.
  // First (Liked Songs) / middle (Bravo) / last (Charlie) activations
  // each emit one log line tied to that row's identity. mockClear()
  // between clicks guarantees the assertion targets exactly the
  // intervening click and not the cumulative call history.
  it('renders one Dedup button per row at N≥3 with first/middle/last activations logging the correct identity (C-005 upper)', async () => {
    const loader = new FakePlaylistsLoader({
      kind: 'success',
      playlists: [
        pl('spotify:playlist:1', 'Alpha'),
        pl('spotify:playlist:2', 'Bravo'),
        pl('spotify:playlist:3', 'Charlie'),
      ],
      likedSongs: { trackCount: 1 },
    });
    const store = createPlaylistsStore(loader);
    await store.getState().triggerLoad();
    render(
      <PlaylistsStoreProvider store={store}>
        <LoadedView />
      </PlaylistsStoreProvider>,
    );
    const buttons = screen.getAllByRole('button', { name: /^Dedup / });
    expect(buttons).toHaveLength(4);

    // index 0 → Liked Songs (first / pinned)
    logSpy.mockClear();
    fireEvent.click(buttons[0]);
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(
      '[Dedup] clicked: Liked Songs (spotify:collection:tracks)',
    );

    // index 2 → Bravo (middle)
    logSpy.mockClear();
    fireEvent.click(buttons[2]);
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(
      '[Dedup] clicked: Bravo (spotify:playlist:2)',
    );

    // index 3 → Charlie (last)
    logSpy.mockClear();
    fireEvent.click(buttons[3]);
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(
      '[Dedup] clicked: Charlie (spotify:playlist:3)',
    );
  });
});

describe('LoadedView — Dedup button SC-001 duplicate names (WP05)', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  // SC-001 — wiring-proof case. Two playlists share displayName
  // 'Workout' but distinct URIs; click activation must emit the
  // ROW'S URI (anchored on the stable `key`, not the displayName)
  // so duplicates can't collapse into one log line.
  it('a 5-row fixture with two playlists sharing displayName logs distinct URIs per row', async () => {
    // Build raw collections; the view-model transform will pin
    // Liked Songs first, then preserve input order for the four
    // playlists.
    const playlists = [
      pl('spotify:playlist:p1', 'Morning Mix'),
      pl('spotify:playlist:p2', 'Workout'),
      pl('spotify:playlist:p3', 'Roadtrip'),
      pl('spotify:playlist:p4', 'Workout'),
    ];
    const loader = new FakePlaylistsLoader({
      kind: 'success',
      playlists,
      likedSongs: { trackCount: 1 },
    });
    const store = createPlaylistsStore(loader);
    await store.getState().triggerLoad();
    render(
      <PlaylistsStoreProvider store={store}>
        <LoadedView />
      </PlaylistsStoreProvider>,
    );
    const buttons = screen.getAllByRole('button', { name: /^Dedup / });
    expect(buttons).toHaveLength(5);

    // Expected log lines, in render order: Liked Songs first, then
    // playlists in input order. URIs anchor on each row's stable
    // identity, so duplicate displayNames cannot hash to the same
    // line.
    const expectedLines = [
      '[Dedup] clicked: Liked Songs (spotify:collection:tracks)',
      '[Dedup] clicked: Morning Mix (spotify:playlist:p1)',
      '[Dedup] clicked: Workout (spotify:playlist:p2)',
      '[Dedup] clicked: Roadtrip (spotify:playlist:p3)',
      '[Dedup] clicked: Workout (spotify:playlist:p4)',
    ];

    expectedLines.forEach((line, idx) => {
      logSpy.mockClear();
      fireEvent.click(buttons[idx]);
      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledWith(line);
    });

    // Sanity: the two `Workout` rows logged different URIs.
    expect(expectedLines[2]).not.toBe(expectedLines[4]);
  });
});

describe('LoadedView — Dedup button no-ownership-filter (WP05)', () => {
  // FR-006 — every owner kind that survives eligibility filtering
  // receives a Dedup button. Fixture covers all three OwnerIdentity
  // variants (`self`, `other`, `system-library`); the helper pins
  // eligibility booleans so the assertion isolates the FR-006
  // contract from the orthogonal eligibility rule (see helper
  // doc-comment above).
  it('renders a Dedup button regardless of owner kind (self / other / system-library)', async () => {
    const loader = new FakePlaylistsLoader({
      kind: 'success',
      playlists: [
        plWithOwner('spotify:playlist:s', 'My Mix', {
          kind: 'self',
          displayName: 'me',
        }),
        plWithOwner('spotify:playlist:o', 'Their Mix', {
          kind: 'other',
          displayName: 'Alex',
        }),
        plWithOwner('spotify:playlist:sl', 'Discover Weekly', {
          kind: 'system-library',
        }),
      ],
      likedSongs: { trackCount: 0 },
    });
    const store = createPlaylistsStore(loader);
    await store.getState().triggerLoad();
    render(
      <PlaylistsStoreProvider store={store}>
        <LoadedView />
      </PlaylistsStoreProvider>,
    );
    // 3 playlist rows + 1 pinned Liked Songs row = 4 rows; the
    // FR-006 assertion targets the 3 ownership-variant playlists,
    // so filter to the playlists' aria-labels.
    expect(
      screen.getByRole('button', { name: /^Dedup My Mix$/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^Dedup Their Mix$/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^Dedup Discover Weekly$/ }),
    ).toBeInTheDocument();
    // Total rendered: 1 Liked Songs + 3 playlists = 4 Dedup buttons.
    expect(
      screen.getAllByRole('button', { name: /^Dedup / }),
    ).toHaveLength(4);
  });
});
