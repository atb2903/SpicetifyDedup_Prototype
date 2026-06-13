/**
 * PlaylistRow tests (T024 / WP08 + prior WP03 suite).
 *
 * Sections:
 * 1. Pure presentational tests (existing suite — owner labels, images, track
 *    counts, layout). These mount WITHOUT the detection store provider because
 *    the existing tests predate WP08; PlaylistRow's detection-store reads
 *    happen through DedupButton which requires the provider. These tests
 *    focus on the row's non-detection content and are wrapped in
 *    <DetectionStoreProvider> to satisfy the new hook requirement.
 * 2. T024 — per-row detection state rendering (new suite). Exercises the
 *    four branches: idle (no extra content), scanning, loaded, failed.
 */

import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { PlaylistRow } from '../../src/ui/PlaylistRow';
import type { CollectionViewModel } from '../../src/domain/view-models';
import { DetectionStoreProvider } from '../../src/store/DetectionStoreContext';
import { createDetectionStore } from '../../src/store/detection-store';
import type { DetectionStoreState } from '../../src/store/detection-store';
import type { DetectionScanner } from '../../src/ports/detection-scanner';
import type { DetectionResult } from '../../src/domain/detection-types';
import { DetectionError } from '../../src/domain/detection-errors';

const sample = (
  overrides: Partial<CollectionViewModel> = {},
): CollectionViewModel => ({
  key: 'spotify:playlist:abc',
  kind: 'playlist',
  displayName: 'My Playlist',
  owner: { kind: 'self', displayName: 'me' },
  trackCount: 10,
  imageUrl: 'https://i.scdn.co/image/abc',
  ...overrides,
});

/** Build a stub scanner whose `scan` never resolves. */
function makeHangingScanner(): DetectionScanner {
  return { scan: vi.fn(() => new Promise<never>(() => {})) };
}

/** Wrap a row in the detection provider with the given store. */
function renderRow(
  row: CollectionViewModel,
  store: ReturnType<typeof createDetectionStore>,
) {
  return render(
    <DetectionStoreProvider store={store}>
      <ul>
        <PlaylistRow row={row} />
      </ul>
    </DetectionStoreProvider>,
  );
}

// ─── Existing presentational tests (require the detection store provider) ────

describe('PlaylistRow', () => {
  it('shows the playlist name', () => {
    const store = createDetectionStore(makeHangingScanner());
    renderRow(sample(), store);
    expect(screen.getByText('My Playlist')).toBeInTheDocument();
  });

  it('shows "by you" for self-owned playlists', () => {
    const store = createDetectionStore(makeHangingScanner());
    renderRow(sample({ owner: { kind: 'self', displayName: 'me' } }), store);
    expect(screen.getByText(/by you/i)).toBeInTheDocument();
  });

  it('shows "by {displayName}" for other-owned (collaborative) playlists', () => {
    const store = createDetectionStore(makeHangingScanner());
    renderRow(sample({ owner: { kind: 'other', displayName: 'friend' } }), store);
    expect(screen.getByText(/by friend/i)).toBeInTheDocument();
  });

  it('renders the cover image when imageUrl is provided', () => {
    const store = createDetectionStore(makeHangingScanner());
    const { container } = renderRow(
      sample({ imageUrl: 'https://example.com/cover.jpg' }),
      store,
    );
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute('src', 'https://example.com/cover.jpg');
  });

  it('does not render a placeholder when imageUrl is provided', () => {
    const store = createDetectionStore(makeHangingScanner());
    renderRow(sample({ imageUrl: 'https://example.com/cover.jpg' }), store);
    expect(screen.queryByLabelText(/no cover image/i)).not.toBeInTheDocument();
  });

  it('renders a placeholder with an accessible label when imageUrl is null', () => {
    const store = createDetectionStore(makeHangingScanner());
    renderRow(sample({ imageUrl: null }), store);
    expect(screen.getByLabelText(/no cover image/i)).toBeInTheDocument();
  });

  it('passes very long names through verbatim', () => {
    const store = createDetectionStore(makeHangingScanner());
    const long = 'A'.repeat(500);
    renderRow(sample({ displayName: long }), store);
    expect(screen.getByText(long)).toBeInTheDocument();
  });

  it('renders "0 tracks" at the zero-track boundary', () => {
    const store = createDetectionStore(makeHangingScanner());
    renderRow(sample({ trackCount: 0 }), store);
    expect(screen.getByText(/^0 tracks$/i)).toBeInTheDocument();
  });

  it('renders "1 track" (singular) at the one-track boundary', () => {
    const store = createDetectionStore(makeHangingScanner());
    renderRow(sample({ trackCount: 1 }), store);
    expect(screen.getByText(/^1 track$/i)).toBeInTheDocument();
  });

  it('renders "{n} tracks" (plural) at the nominal track count', () => {
    const store = createDetectionStore(makeHangingScanner());
    renderRow(sample({ trackCount: 10 }), store);
    expect(screen.getByText(/^10 tracks$/i)).toBeInTheDocument();
  });

  it('renders "{n} tracks" (plural) at a large track count', () => {
    const store = createDetectionStore(makeHangingScanner());
    renderRow(sample({ trackCount: 1000 }), store);
    expect(screen.getByText(/^1000 tracks$/i)).toBeInTheDocument();
  });

  it('carries a li role so the parent ul can wrap it semantically', () => {
    const store = createDetectionStore(makeHangingScanner());
    renderRow(sample(), store);
    expect(screen.getByRole('listitem')).toBeInTheDocument();
  });

  it('defensively renders "Your Library" when given a system-library owner', () => {
    const store = createDetectionStore(makeHangingScanner());
    renderRow(sample({ owner: { kind: 'system-library' } }), store);
    expect(screen.getByText('Your Library')).toBeInTheDocument();
  });

  it('FR-004 — Row uses a grid or flex layout so spans do not collapse', () => {
    const store = createDetectionStore(makeHangingScanner());
    renderRow(sample(), store);
    const row = screen.getByRole('listitem');
    const display = getComputedStyle(row).display;
    expect(['grid', 'flex']).toContain(display);
  });

  it('FR-004 — Row has visible separation (non-zero border-bottom)', () => {
    const store = createDetectionStore(makeHangingScanner());
    renderRow(sample(), store);
    const row = screen.getByRole('listitem');
    const cs = getComputedStyle(row);
    const hasBorder =
      (cs.borderBottomWidth !== '' && cs.borderBottomWidth !== '0px') ||
      (cs.borderBottom !== '' && !cs.borderBottom.startsWith('0px'));
    expect(hasBorder).toBe(true);
  });
});

// ─── Prior dedup-button suite (WP03) — updated for new prop shape ─────────────

describe('PlaylistRow — Dedup button (WP03 / T024)', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // The button no longer calls logDedupClick but tests below may need
    // console spy if any console calls happen indirectly.
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('renders a Dedup button on every playlist row', () => {
    const store = createDetectionStore(makeHangingScanner());
    renderRow(sample({ displayName: 'My Playlist', key: 'spotify:playlist:abc' }), store);
    expect(
      screen.getByRole('button', { name: /^Dedup My Playlist$/ }),
    ).toBeInTheDocument();
  });

  it("binds the button to the row's displayName (aria-label)", () => {
    const store = createDetectionStore(makeHangingScanner());
    renderRow(sample({ displayName: 'My Playlist', key: 'spotify:playlist:abc' }), store);
    const button = screen.getByRole('button', { name: /^Dedup My Playlist$/ });
    expect(button.getAttribute('aria-label')).toBe('Dedup My Playlist');
  });

  it('dispatches scanCollection with row.key as collectionKey', async () => {
    const scanner = makeHangingScanner();
    const store = createDetectionStore(scanner);
    const scanCollection = vi.fn(() => Promise.resolve());
    store.setState({ ...store.getState(), scanCollection } as DetectionStoreState);

    renderRow(sample({ displayName: 'My Playlist', key: 'spotify:playlist:abc' }), store);
    const button = screen.getByRole('button', { name: /^Dedup My Playlist$/ });
    await act(async () => { fireEvent.click(button); });

    expect(scanCollection).toHaveBeenCalledWith('spotify:playlist:abc', {
      kind: 'playlist',
      playlistUri: 'spotify:playlist:abc',
    });
  });

  it('does not truncate the playlist name, owner label, or track count when the button is present', () => {
    const store = createDetectionStore(makeHangingScanner());
    const long = 'A'.repeat(500);
    renderRow(
      sample({ displayName: long, owner: { kind: 'other', displayName: 'friend' }, trackCount: 1000 }),
      store,
    );
    expect(screen.getByText(long)).toBeInTheDocument();
    expect(screen.getByText(/by friend/i)).toBeInTheDocument();
    expect(screen.getByText(/^1000 tracks$/i)).toBeInTheDocument();
  });
});

// ─── T024 — per-row detection state rendering ─────────────────────────────────

describe('PlaylistRow — T024 detection state rendering', () => {
  it('idle row (undefined) renders no scanning/loaded/failed content', () => {
    const store = createDetectionStore(makeHangingScanner());
    renderRow(sample(), store);
    // No scanning status, no summary, no alert
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByText(/No duplicates found/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('scanning row renders ScanningView (role="status")', async () => {
    const scanner = makeHangingScanner();
    const store = createDetectionStore(scanner);
    renderRow(sample({ key: 'spotify:playlist:abc' }), store);

    await act(async () => {
      void store.getState().scanCollection('spotify:playlist:abc', {
        kind: 'playlist',
        playlistUri: 'spotify:playlist:abc',
      });
    });

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/Enumerating tracks/);
  });

  it('loaded row renders DetectionLoadedSummary ("No duplicates found")', async () => {
    let resolveResult!: (r: DetectionResult) => void;
    const scanner: DetectionScanner = {
      scan: vi.fn(() => new Promise<DetectionResult>((resolve) => { resolveResult = resolve; })),
    };
    const store = createDetectionStore(scanner);
    renderRow(sample({ key: 'spotify:playlist:abc' }), store);

    await act(async () => {
      const p = store.getState().scanCollection('spotify:playlist:abc', {
        kind: 'playlist',
        playlistUri: 'spotify:playlist:abc',
      });
      resolveResult({
        collectionKey: 'spotify:playlist:abc',
        completedAt: 1000,
        groups: [],
        duplicateTrackCount: 0,
        removableTrackCount: 0,
        skippedLocalCount: 0,
        unenrichedCount: 0,
        scannedTrackCount: 5,
      });
      await p;
    });

    expect(screen.getByText(/No duplicates found/i)).toBeInTheDocument();
  });

  it('failed row renders DetectionFailedView (role="alert")', async () => {
    const scanner: DetectionScanner = {
      scan: vi.fn(() => Promise.reject(new DetectionError('network-failure', 'Test'))),
    };
    const store = createDetectionStore(scanner);
    renderRow(sample({ key: 'spotify:playlist:abc' }), store);

    await act(async () => {
      await store.getState().scanCollection('spotify:playlist:abc', {
        kind: 'playlist',
        playlistUri: 'spotify:playlist:abc',
      });
    });

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/Couldn't reach Spotify/);
  });

  it('collection key for playlist row is row.key (the playlist URI)', async () => {
    const scanner = makeHangingScanner();
    const store = createDetectionStore(scanner);
    const scanCollection = vi.fn(() => Promise.resolve());
    store.setState({ ...store.getState(), scanCollection } as DetectionStoreState);

    renderRow(sample({ key: 'spotify:playlist:xyz', displayName: 'Test' }), store);

    const button = screen.getByRole('button', { name: /^Dedup Test$/ });
    await act(async () => { fireEvent.click(button); });

    expect(scanCollection).toHaveBeenCalledWith(
      'spotify:playlist:xyz',
      { kind: 'playlist', playlistUri: 'spotify:playlist:xyz' },
    );
  });
});

// ─── T025 — removal surface wiring (WP07) ─────────────────────────────────────

/** Seed a `loaded` row carrying `removableTrackCount` removable tracks. */
function seedLoaded(
  store: ReturnType<typeof createDetectionStore>,
  key: string,
  removableTrackCount: number,
): void {
  const result = {
    collectionKey: key,
    completedAt: 1000,
    groups: [
      {
        id: 'g1',
        reason: 'same-canonical-uri',
        members: [
          { position: 0, uri: `${key}:t0`, canonicalUri: `${key}:t0`, name: 'Dup', artists: [{ name: 'A' }], durationMs: 1000 },
          { position: 1, uri: `${key}:t1`, canonicalUri: `${key}:t1`, name: 'Dup', artists: [{ name: 'A' }], durationMs: 1000 },
        ],
        defaultKeepIndex: 0,
      },
    ],
    duplicateTrackCount: removableTrackCount + 1,
    removableTrackCount,
    skippedLocalCount: 0,
    unenrichedCount: 0,
    scannedTrackCount: removableTrackCount + 1,
  } as unknown as DetectionResult;
  store.setState({
    ...store.getState(),
    rows: {
      ...store.getState().rows,
      [key]: { kind: 'loaded', result, removal: { phase: 'none' } },
    },
  } as DetectionStoreState);
}

describe('PlaylistRow — T025 removal surface', () => {
  it('renders the Remove-duplicates button in a loaded row with removable tracks', () => {
    const store = createDetectionStore(makeHangingScanner());
    seedLoaded(store, 'spotify:playlist:abc', 3);
    renderRow(sample({ key: 'spotify:playlist:abc', displayName: 'My Playlist' }), store);

    expect(
      screen.getByRole('button', { name: /^Remove duplicates from My Playlist$/ }),
    ).toBeInTheDocument();
  });

  it('clicking Remove duplicates opens the confirm dialog for that collection', async () => {
    const store = createDetectionStore(makeHangingScanner());
    seedLoaded(store, 'spotify:playlist:abc', 3);
    renderRow(sample({ key: 'spotify:playlist:abc', displayName: 'My Playlist' }), store);

    const removeBtn = screen.getByRole('button', {
      name: /^Remove duplicates from My Playlist$/,
    });
    await act(async () => { fireEvent.click(removeBtn); });

    expect(
      screen.getByRole('dialog', { name: /Confirm removal from My Playlist/ }),
    ).toBeInTheDocument();
  });

  it('single-collection scope: clicking Playlist A does not surface a dialog on another row', async () => {
    const store = createDetectionStore(makeHangingScanner());
    seedLoaded(store, 'spotify:playlist:A', 3);
    seedLoaded(store, 'liked-songs', 3);
    render(
      <DetectionStoreProvider store={store}>
        <ul>
          <PlaylistRow row={sample({ key: 'spotify:playlist:A', displayName: 'Playlist A' })} />
        </ul>
      </DetectionStoreProvider>,
    );

    const removeBtn = screen.getByRole('button', {
      name: /^Remove duplicates from Playlist A$/,
    });
    await act(async () => { fireEvent.click(removeBtn); });

    // Exactly one dialog, and it belongs to Playlist A only.
    const dialogs = screen.getAllByRole('dialog');
    expect(dialogs).toHaveLength(1);
    expect(
      screen.getByRole('dialog', { name: /Confirm removal from Playlist A/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('dialog', { name: /Confirm removal from Liked Songs/ }),
    ).not.toBeInTheDocument();
  });
});
