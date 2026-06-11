/**
 * Tests for the refactored `DedupButton` (T023 / WP08).
 *
 * The prior `logDedupClick`-based tests are replaced with store-dispatch
 * tests. The button:
 * - Dispatches `scanCollection(collectionKey, request)` on click.
 * - Is `disabled` while `rows[collectionKey].kind === 'scanning'`.
 * - Is not disabled from `idle`, `loaded`, `failed`, or undefined (no entry).
 * - Has `aria-label` matching `Dedup ${displayName}`.
 * - Throws when used outside a `DetectionStoreProvider`.
 *
 * Each test mounts inside a minimal `<DetectionStoreProvider>` with a
 * controlled store.
 */

import React from 'react';
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { DedupButton } from '../../src/ui/DedupButton';
import { DetectionStoreProvider } from '../../src/store/DetectionStoreContext';
import { createDetectionStore } from '../../src/store/detection-store';
import type { DetectionStoreState } from '../../src/store/detection-store';
import type { DetectionScanner } from '../../src/ports/detection-scanner';
import type { ScanRequest } from '../../src/domain/detection-types';
import type { StoreApi } from 'zustand/vanilla';

/** Build a stub scanner whose `scan` never resolves (used for in-flight tests). */
function makeHangingScanner(): DetectionScanner {
  return {
    scan: vi.fn(() => new Promise<never>(() => {})),
  };
}

function renderWithStore(
  ui: React.ReactElement,
  store: StoreApi<DetectionStoreState>,
) {
  return render(
    <DetectionStoreProvider store={store}>{ui}</DetectionStoreProvider>,
  );
}

describe('DedupButton — rendering', () => {
  it('renders a button with visible text "Dedup"', () => {
    const store = createDetectionStore(makeHangingScanner());
    renderWithStore(
      <DedupButton
        collectionKey="spotify:playlist:abc"
        request={{ kind: 'playlist', playlistUri: 'spotify:playlist:abc' }}
        displayName="My Playlist"
      />,
      store,
    );
    expect(screen.getByText('Dedup')).toBeInTheDocument();
  });

  it('sets aria-label to "Dedup <displayName>"', () => {
    const store = createDetectionStore(makeHangingScanner());
    renderWithStore(
      <DedupButton
        collectionKey="spotify:playlist:abc"
        request={{ kind: 'playlist', playlistUri: 'spotify:playlist:abc' }}
        displayName="My Playlist"
      />,
      store,
    );
    expect(
      screen.getByRole('button', { name: /^Dedup My Playlist$/ }),
    ).toBeInTheDocument();
  });
});

describe('DedupButton — disabled state', () => {
  it('is NOT disabled when the row state is undefined (no entry)', () => {
    const store = createDetectionStore(makeHangingScanner());
    renderWithStore(
      <DedupButton
        collectionKey="spotify:playlist:abc"
        request={{ kind: 'playlist', playlistUri: 'spotify:playlist:abc' }}
        displayName="My Playlist"
      />,
      store,
    );
    const btn = screen.getByRole('button', { name: /^Dedup My Playlist$/ });
    expect(btn).not.toBeDisabled();
  });

  it('is NOT disabled when the row is in the idle state', () => {
    // Fresh store → no entry for the key → idle by default
    const store = createDetectionStore(makeHangingScanner());
    renderWithStore(
      <DedupButton
        collectionKey="liked-songs"
        request={{ kind: 'liked-songs' }}
        displayName="Liked Songs"
      />,
      store,
    );
    expect(screen.getByRole('button', { name: /^Dedup Liked Songs$/ })).not.toBeDisabled();
  });

  it('IS disabled while the row is scanning', async () => {
    const scanner = makeHangingScanner();
    const store = createDetectionStore(scanner);

    renderWithStore(
      <DedupButton
        collectionKey="liked-songs"
        request={{ kind: 'liked-songs' }}
        displayName="Liked Songs"
      />,
      store,
    );

    // Start a scan — transitions the row to scanning.
    await act(async () => {
      void store.getState().scanCollection('liked-songs', { kind: 'liked-songs' });
    });

    expect(screen.getByRole('button', { name: /^Dedup Liked Songs$/ })).toBeDisabled();
  });

  it('is NOT disabled when the row is loaded', async () => {
    let resolveResult!: (r: import('../../src/domain/detection-types').DetectionResult) => void;
    const scanner: DetectionScanner = {
      scan: vi.fn(
        () =>
          new Promise<import('../../src/domain/detection-types').DetectionResult>((resolve) => {
            resolveResult = resolve;
          }),
      ),
    };
    const store = createDetectionStore(scanner);

    renderWithStore(
      <DedupButton
        collectionKey="liked-songs"
        request={{ kind: 'liked-songs' }}
        displayName="Liked Songs"
      />,
      store,
    );

    // Resolve the scan with a result.
    await act(async () => {
      const scanPromise = store.getState().scanCollection('liked-songs', { kind: 'liked-songs' });
      resolveResult({
        collectionKey: 'liked-songs',
        completedAt: 1000,
        groups: [],
        duplicateTrackCount: 0,
        removableTrackCount: 0,
        skippedLocalCount: 0,
        unenrichedCount: 0,
        scannedTrackCount: 0,
      });
      await scanPromise;
    });

    expect(screen.getByRole('button', { name: /^Dedup Liked Songs$/ })).not.toBeDisabled();
  });

  it('is NOT disabled when the row is failed', async () => {
    const scanner: DetectionScanner = {
      scan: vi.fn(() => Promise.reject(new Error('network error'))),
    };
    const store = createDetectionStore(scanner);

    renderWithStore(
      <DedupButton
        collectionKey="liked-songs"
        request={{ kind: 'liked-songs' }}
        displayName="Liked Songs"
      />,
      store,
    );

    await act(async () => {
      await store.getState().scanCollection('liked-songs', { kind: 'liked-songs' });
    });

    expect(
      store.getState().rows['liked-songs']?.kind,
    ).toBe('failed');
    expect(screen.getByRole('button', { name: /^Dedup Liked Songs$/ })).not.toBeDisabled();
  });
});

describe('DedupButton — scan dispatch', () => {
  it('calls scanCollection(collectionKey, request) on click', async () => {
    const scanCollection = vi.fn(() => Promise.resolve());
    // Build a minimal store stub
    const scanner = makeHangingScanner();
    const store = createDetectionStore(scanner);
    // Override scanCollection with spy
    store.setState({ ...store.getState(), scanCollection } as DetectionStoreState);

    renderWithStore(
      <DedupButton
        collectionKey="spotify:playlist:abc"
        request={{ kind: 'playlist', playlistUri: 'spotify:playlist:abc' }}
        displayName="My Playlist"
      />,
      store,
    );

    const btn = screen.getByRole('button', { name: /^Dedup My Playlist$/ });
    await act(async () => {
      fireEvent.click(btn);
    });

    expect(scanCollection).toHaveBeenCalledTimes(1);
    expect(scanCollection).toHaveBeenCalledWith('spotify:playlist:abc', {
      kind: 'playlist',
      playlistUri: 'spotify:playlist:abc',
    });
  });

  it('dispatches liked-songs key and request correctly', async () => {
    const scanCollection = vi.fn(() => Promise.resolve());
    const scanner = makeHangingScanner();
    const store = createDetectionStore(scanner);
    store.setState({ ...store.getState(), scanCollection } as DetectionStoreState);

    renderWithStore(
      <DedupButton
        collectionKey="liked-songs"
        request={{ kind: 'liked-songs' }}
        displayName="Liked Songs"
      />,
      store,
    );

    const btn = screen.getByRole('button', { name: /^Dedup Liked Songs$/ });
    await act(async () => {
      fireEvent.click(btn);
    });

    expect(scanCollection).toHaveBeenCalledWith('liked-songs', { kind: 'liked-songs' });
  });
});

describe('DedupButton — used outside provider', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Suppress the expected React error boundary console output.
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('throws when rendered outside a DetectionStoreProvider', () => {
    expect(() =>
      render(
        <DedupButton
          collectionKey="liked-songs"
          request={{ kind: 'liked-songs' }}
          displayName="Liked Songs"
        />,
      ),
    ).toThrow('useDetectionStore must be used inside <DetectionStoreProvider>.');
  });
});

describe('DedupButton — aria-label edge cases', () => {
  it('sets aria-label to "Dedup " (trailing space) for empty displayName', () => {
    const store = createDetectionStore(makeHangingScanner());
    renderWithStore(
      <DedupButton
        collectionKey="liked-songs"
        request={{ kind: 'liked-songs' }}
        displayName=""
      />,
      store,
    );
    const btn = screen.getByRole('button');
    expect(btn.getAttribute('aria-label')).toBe('Dedup ');
  });

  it('preserves a 500-char displayName in aria-label without truncation', () => {
    const long = 'A'.repeat(500);
    const store = createDetectionStore(makeHangingScanner());
    renderWithStore(
      <DedupButton
        collectionKey="liked-songs"
        request={{ kind: 'liked-songs' }}
        displayName={long}
      />,
      store,
    );
    const btn = screen.getByRole('button');
    expect(btn.getAttribute('aria-label')).toBe(`Dedup ${long}`);
  });
});

describe('DedupButton — ScanRequest variants', () => {
  it('accepts a liked-songs ScanRequest', () => {
    const store = createDetectionStore(makeHangingScanner());
    const request: ScanRequest = { kind: 'liked-songs' };
    renderWithStore(
      <DedupButton
        collectionKey="liked-songs"
        request={request}
        displayName="Liked Songs"
      />,
      store,
    );
    expect(screen.getByRole('button', { name: /^Dedup Liked Songs$/ })).toBeInTheDocument();
  });

  it('accepts a playlist ScanRequest', () => {
    const store = createDetectionStore(makeHangingScanner());
    const request: ScanRequest = { kind: 'playlist', playlistUri: 'spotify:playlist:xyz' };
    renderWithStore(
      <DedupButton
        collectionKey="spotify:playlist:xyz"
        request={request}
        displayName="Chill Vibes"
      />,
      store,
    );
    expect(screen.getByRole('button', { name: /^Dedup Chill Vibes$/ })).toBeInTheDocument();
  });
});
