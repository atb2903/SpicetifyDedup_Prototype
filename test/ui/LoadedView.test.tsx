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
 *
 * WP08 update: rows now use `useDetectionStore` so each render is wrapped
 * in both `PlaylistsStoreProvider` and `DetectionStoreProvider`. The old
 * click-logging assertions (from the diagnostic-era `logDedupClick`) have
 * been replaced with aria-label / accessible-name assertions, since
 * `DedupButton` now dispatches `scanCollection` on click.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LoadedView } from '../../src/ui/LoadedView';
import { createPlaylistsStore } from '../../src/store/playlists-store';
import { PlaylistsStoreProvider } from '../../src/store/PlaylistsStoreContext';
import { DetectionStoreProvider } from '../../src/store/DetectionStoreContext';
import { createDetectionStore } from '../../src/store/detection-store';
import { FakePlaylistsLoader } from '../../src/adapters/fake-playlists-loader';
import type {
  OwnerIdentity,
  RawCollection,
} from '../../src/domain/view-models';
import type { DetectionScanner } from '../../src/ports/detection-scanner';

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

/** Stub scanner that never resolves — safe for render-only tests. */
function makeHangingScanner(): DetectionScanner {
  return { scan: vi.fn(() => new Promise<never>(() => {})) };
}

/**
 * Render helper that wraps LoadedView in both required providers.
 * The detection store is a minimal stub (hanging scanner) since these
 * tests do not exercise detection state.
 */
function renderLoadedView(
  playlistsStore: ReturnType<typeof createPlaylistsStore>,
) {
  const detectionStore = createDetectionStore(makeHangingScanner());
  return render(
    <PlaylistsStoreProvider store={playlistsStore}>
      <DetectionStoreProvider store={detectionStore}>
        <LoadedView />
      </DetectionStoreProvider>
    </PlaylistsStoreProvider>,
  );
}

describe('LoadedView', () => {
  it('renders nothing when the store is not in the loaded state (idle)', () => {
    const loader = new FakePlaylistsLoader({
      kind: 'success',
      playlists: [],
      likedSongs: { trackCount: 0 },
    });
    const store = createPlaylistsStore(loader);
    const { container } = renderLoadedView(store);
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
    const { container } = renderLoadedView(store);
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
    const { container } = renderLoadedView(store);
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
    const { container } = renderLoadedView(store);
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
    const { container } = renderLoadedView(store);
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
    const { container } = renderLoadedView(store);
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
    const { container } = renderLoadedView(store);
    expect(container.querySelectorAll('li').length).toBe(1001);
    // WP05 / T022 / FR-002: every row mounts its own Dedup button.
    // At the 1001-row scale, getAllByRole walks the entire rendered
    // list — asserts both that the button count matches the row
    // count and that the render path has no per-row dedup-button
    // dropout at scale.
    const dedupButtons = screen.getAllByRole('button', { name: /^Dedup / });
    expect(dedupButtons).toHaveLength(1001);
    // Explicit timeout: rendering 1001 rows (each with a Cover, DedupButton,
    // and store subscription) and walking the tree twice is fast in isolation
    // (~1.6s) but flaps against the 5s default under full-suite parallel load.
  }, 20000);

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
    const { container } = renderLoadedView(store);
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
 *
 * WP08 update: the Dedup button no longer calls `logDedupClick` — it
 * dispatches `scanCollection`. Click identity is now asserted via each
 * button's `aria-label` (which encodes the display name) rather than
 * via `console.log` spy. The row's canonical key (URI / sentinel) is
 * covered by `DedupButton.test.tsx` and `LikedSongsRow.test.tsx` /
 * `PlaylistRow.test.tsx` directly.
 */
describe('LoadedView — Dedup button list-length boundary (WP05)', () => {
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
    renderLoadedView(store);
    expect(
      screen.queryAllByRole('button', { name: /^Dedup / }),
    ).toEqual([]);
  });

  // C-005 nominal-min: one row → exactly one Dedup button. Liked Songs
  // is the pinned first row; eligibility filtering yields zero playlist
  // rows, so the rendered list has length 1. The button's aria-label
  // must identify "Liked Songs".
  it('renders exactly one Dedup button for a Liked-Songs-only fixture (C-005 nominal-min)', async () => {
    const loader = new FakePlaylistsLoader({
      kind: 'success',
      playlists: [],
      likedSongs: { trackCount: 42 },
    });
    const store = createPlaylistsStore(loader);
    await store.getState().triggerLoad();
    renderLoadedView(store);
    const buttons = screen.getAllByRole('button', { name: /^Dedup / });
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAccessibleName('Dedup Liked Songs');
  });

  // C-005 ≥3 rows: 1 Liked Songs + 3 playlists → 4 Dedup buttons.
  // Each button's aria-label identifies its row uniquely: first (Liked Songs),
  // middle (Bravo), last (Charlie). The DedupButton now dispatches
  // `scanCollection` on click rather than logging — click identity is
  // asserted via accessible names.
  it('renders one Dedup button per row at N≥3 with first/middle/last accessible names (C-005 upper)', async () => {
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
    renderLoadedView(store);
    const buttons = screen.getAllByRole('button', { name: /^Dedup / });
    expect(buttons).toHaveLength(4);

    // index 0 → Liked Songs (first / pinned)
    expect(buttons[0]).toHaveAccessibleName('Dedup Liked Songs');

    // index 2 → Bravo (middle)
    expect(buttons[2]).toHaveAccessibleName('Dedup Bravo');

    // index 3 → Charlie (last)
    expect(buttons[3]).toHaveAccessibleName('Dedup Charlie');
  });
});

describe('LoadedView — Dedup button SC-001 duplicate names (WP05)', () => {
  // SC-001 — wiring-proof case. Two playlists share displayName
  // 'Workout' but distinct URIs; each must have its own Dedup button.
  // The buttons' aria-labels encode the display name; the canonical key
  // (URI) is covered in `PlaylistRow.test.tsx`. We assert the total
  // button count and that the two 'Workout' buttons share a display name
  // but are distinct DOM nodes.
  it('a 5-row fixture with two playlists sharing displayName has distinct buttons per row', async () => {
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
    renderLoadedView(store);
    const buttons = screen.getAllByRole('button', { name: /^Dedup / });
    expect(buttons).toHaveLength(5);

    // Accessible names in render order: Liked Songs first, then
    // playlists in input order.
    expect(buttons[0]).toHaveAccessibleName('Dedup Liked Songs');
    expect(buttons[1]).toHaveAccessibleName('Dedup Morning Mix');
    expect(buttons[2]).toHaveAccessibleName('Dedup Workout');
    expect(buttons[3]).toHaveAccessibleName('Dedup Roadtrip');
    expect(buttons[4]).toHaveAccessibleName('Dedup Workout');

    // Sanity: the two 'Workout' buttons are distinct DOM nodes.
    expect(buttons[2]).not.toBe(buttons[4]);
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
    renderLoadedView(store);
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
