/**
 * LikedSongsRow tests (T024 / WP08 + prior WP04 suite).
 *
 * Sections:
 * 1. Existing presentational tests — wrapped in DetectionStoreProvider to
 *    satisfy the new hook requirement (DedupButton reads from the store).
 * 2. T024 — per-row detection state rendering (new suite): idle / scanning /
 *    loaded / failed. The collection key for Liked Songs is the literal
 *    sentinel 'liked-songs' (NOT 'spotify:collection:tracks').
 */

import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { LikedSongsRow } from '../../src/ui/LikedSongsRow';
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
  key: 'liked-songs',
  kind: 'liked-songs',
  displayName: 'Liked Songs',
  owner: { kind: 'system-library' },
  trackCount: 42,
  imageUrl: null,
  ...overrides,
});

function makeHangingScanner(): DetectionScanner {
  return { scan: vi.fn(() => new Promise<never>(() => {})) };
}

function renderRow(
  row: CollectionViewModel,
  store: ReturnType<typeof createDetectionStore>,
) {
  return render(
    <DetectionStoreProvider store={store}>
      <ul>
        <LikedSongsRow row={row} />
      </ul>
    </DetectionStoreProvider>,
  );
}

// ─── Existing presentational tests ──────────────────────────────────────────

describe('LikedSongsRow', () => {
  it('renders "Liked Songs" as the name', () => {
    const store = createDetectionStore(makeHangingScanner());
    renderRow(sample(), store);
    expect(screen.getByText('Liked Songs')).toBeInTheDocument();
  });

  it('renders "Your Library" as the owner label', () => {
    const store = createDetectionStore(makeHangingScanner());
    renderRow(sample(), store);
    expect(screen.getByText('Your Library')).toBeInTheDocument();
  });

  it('renders the heart icon with an accessible label', () => {
    const store = createDetectionStore(makeHangingScanner());
    renderRow(sample(), store);
    expect(screen.getByLabelText(/liked songs icon/i)).toBeInTheDocument();
  });

  it('carries a stable data-row-kind="liked-songs" hook for distinct styling', () => {
    const store = createDetectionStore(makeHangingScanner());
    const { container } = renderRow(sample(), store);
    expect(
      container.querySelector('[data-row-kind="liked-songs"]'),
    ).not.toBeNull();
  });

  it('renders "0 tracks" at the zero-saved-tracks boundary', () => {
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
    renderRow(sample({ trackCount: 42 }), store);
    expect(screen.getByText(/^42 tracks$/i)).toBeInTheDocument();
  });

  it('renders "{n} tracks" (plural) at a large track count', () => {
    const store = createDetectionStore(makeHangingScanner());
    renderRow(sample({ trackCount: 50000 }), store);
    expect(screen.getByText(/^50000 tracks$/i)).toBeInTheDocument();
  });

  it('exposes the row as a listitem so the parent ul wraps it semantically', () => {
    const store = createDetectionStore(makeHangingScanner());
    renderRow(sample(), store);
    expect(screen.getByRole('listitem')).toBeInTheDocument();
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

// ─── Prior dedup-button suite (WP04) — updated for new prop shape ─────────────

describe('LikedSongsRow — Dedup button (WP04 / T024)', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('renders a Dedup button with accessible name "Dedup Liked Songs"', () => {
    const store = createDetectionStore(makeHangingScanner());
    renderRow(sample(), store);
    expect(
      screen.getByRole('button', { name: /^Dedup Liked Songs$/ }),
    ).toBeInTheDocument();
  });

  it('dispatches scanCollection with "liked-songs" as the collection key', async () => {
    const scanner = makeHangingScanner();
    const store = createDetectionStore(scanner);
    const scanCollection = vi.fn(() => Promise.resolve());
    store.setState({ ...store.getState(), scanCollection } as DetectionStoreState);

    renderRow(sample(), store);
    const button = screen.getByRole('button', { name: /^Dedup Liked Songs$/ });
    await act(async () => { fireEvent.click(button); });

    expect(scanCollection).toHaveBeenCalledWith('liked-songs', { kind: 'liked-songs' });
  });

  it('preserves Liked Songs / Your Library copy and the heart icon alongside the button', () => {
    const store = createDetectionStore(makeHangingScanner());
    renderRow(sample(), store);
    expect(screen.getByText('Liked Songs')).toBeInTheDocument();
    expect(screen.getByText('Your Library')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Liked Songs icon/ })).toBeInTheDocument();
  });
});

// ─── T024 — per-row detection state rendering ─────────────────────────────────

describe('LikedSongsRow — T024 detection state rendering', () => {
  it('idle row (no store entry) renders no scanning/loaded/failed content', () => {
    const store = createDetectionStore(makeHangingScanner());
    renderRow(sample(), store);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByText(/No duplicates found/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('scanning row renders ScanningView (role="status")', async () => {
    const scanner = makeHangingScanner();
    const store = createDetectionStore(scanner);
    renderRow(sample(), store);

    await act(async () => {
      void store.getState().scanCollection('liked-songs', { kind: 'liked-songs' });
    });

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/Enumerating tracks/);
  });

  it('loaded row renders DetectionLoadedSummary', async () => {
    let resolveResult!: (r: DetectionResult) => void;
    const scanner: DetectionScanner = {
      scan: vi.fn(() => new Promise<DetectionResult>((resolve) => { resolveResult = resolve; })),
    };
    const store = createDetectionStore(scanner);
    renderRow(sample(), store);

    await act(async () => {
      const p = store.getState().scanCollection('liked-songs', { kind: 'liked-songs' });
      resolveResult({
        collectionKey: 'liked-songs',
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
      scan: vi.fn(() => Promise.reject(new DetectionError('enumerator-failed', 'Test'))),
    };
    const store = createDetectionStore(scanner);
    renderRow(sample(), store);

    await act(async () => {
      await store.getState().scanCollection('liked-songs', { kind: 'liked-songs' });
    });

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/Couldn't read the playlist contents/);
  });

  it('collection key for Liked Songs is the literal "liked-songs" sentinel', async () => {
    const scanner = makeHangingScanner();
    const store = createDetectionStore(scanner);
    const scanCollection = vi.fn(() => Promise.resolve());
    store.setState({ ...store.getState(), scanCollection } as DetectionStoreState);

    renderRow(sample(), store);
    const button = screen.getByRole('button', { name: /^Dedup Liked Songs$/ });
    await act(async () => { fireEvent.click(button); });

    // MUST be 'liked-songs', NOT 'spotify:collection:tracks'
    expect(scanCollection).toHaveBeenCalledWith('liked-songs', { kind: 'liked-songs' });
    expect(scanCollection).not.toHaveBeenCalledWith(
      'spotify:collection:tracks',
      expect.anything(),
    );
  });
});

// ─── T025 — removal surface wiring (WP07) ─────────────────────────────────────

/** Seed the Liked Songs `loaded` row carrying `removableTrackCount` removable tracks. */
function seedLoaded(
  store: ReturnType<typeof createDetectionStore>,
  removableTrackCount: number,
): void {
  const result = {
    collectionKey: 'liked-songs',
    completedAt: 1000,
    groups: [
      {
        id: 'g1',
        reason: 'same-canonical-uri',
        members: [
          { position: 0, uri: 'spotify:track:t0', canonicalUri: 'spotify:track:t0', name: 'Dup', artists: [{ name: 'A' }], durationMs: 1000 },
          { position: 1, uri: 'spotify:track:t1', canonicalUri: 'spotify:track:t1', name: 'Dup', artists: [{ name: 'A' }], durationMs: 1000 },
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
      'liked-songs': { kind: 'loaded', result, removal: { phase: 'none' } },
    },
  } as DetectionStoreState);
}

describe('LikedSongsRow — T025 removal surface', () => {
  it('renders the Remove-duplicates button in a loaded row with removable tracks', () => {
    const store = createDetectionStore(makeHangingScanner());
    seedLoaded(store, 3);
    renderRow(sample(), store);

    expect(
      screen.getByRole('button', { name: /^Remove duplicates from Liked Songs$/ }),
    ).toBeInTheDocument();
  });

  it('clicking Remove duplicates opens the confirm dialog for Liked Songs', async () => {
    const store = createDetectionStore(makeHangingScanner());
    seedLoaded(store, 3);
    renderRow(sample(), store);

    const removeBtn = screen.getByRole('button', {
      name: /^Remove duplicates from Liked Songs$/,
    });
    await act(async () => { fireEvent.click(removeBtn); });

    expect(
      screen.getByRole('dialog', { name: /Confirm removal from Liked Songs/ }),
    ).toBeInTheDocument();
  });
});
