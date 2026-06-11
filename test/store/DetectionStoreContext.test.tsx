/**
 * Tests for `DetectionStoreProvider` and `useDetectionStore`.
 *
 * Mirrors the pattern in `PlaylistsStoreContext.test.tsx`. Verifies:
 * - The bound hook returns the selected slice for consumers inside the provider.
 * - Selector re-evaluates when the store state changes.
 * - Calling `useDetectionStore` outside a provider throws (fail-loud).
 * - Two providers with different store instances stay independent.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { act, render, renderHook, screen } from '@testing-library/react';
import {
  DetectionStoreProvider,
  useDetectionStore,
} from '../../src/store/DetectionStoreContext';
import {
  createDetectionStore,
  type DetectionStoreState,
} from '../../src/store/detection-store';
import type { DetectionScanner } from '../../src/ports/detection-scanner';
import type { DetectionResult } from '../../src/domain/detection-types';

/** Stub scanner that never resolves. */
function makeHangingScanner(): DetectionScanner {
  return {
    scan: vi.fn(() => new Promise<DetectionResult>(() => {})),
  };
}

describe('DetectionStoreContext', () => {
  it('exposes the store value to consumers inside the provider', () => {
    const store = createDetectionStore(makeHangingScanner());

    function RowsProbe() {
      const rows = useDetectionStore((s: DetectionStoreState) => s.rows);
      return <span data-testid="count">{Object.keys(rows).length}</span>;
    }

    render(
      <DetectionStoreProvider store={store}>
        <RowsProbe />
      </DetectionStoreProvider>,
    );

    expect(screen.getByTestId('count').textContent).toBe('0');
  });

  it('selector resolves to the current state value', () => {
    const store = createDetectionStore(makeHangingScanner());

    function KindProbe({ collectionKey }: { collectionKey: string }) {
      const rows = useDetectionStore((s: DetectionStoreState) => s.rows);
      const row = rows[collectionKey];
      return <span data-testid="kind">{row?.kind ?? 'absent'}</span>;
    }

    render(
      <DetectionStoreProvider store={store}>
        <KindProbe collectionKey="liked-songs" />
      </DetectionStoreProvider>,
    );

    // No scan has been started on 'liked-songs', so the key is absent.
    expect(screen.getByTestId('kind').textContent).toBe('absent');
  });

  it('re-renders subscribers when the store transitions', async () => {
    // Use a scanner that resolves after we control it.
    let resolveScanner!: (r: DetectionResult) => void;
    const scanner: DetectionScanner = {
      scan: vi.fn(
        () =>
          new Promise<DetectionResult>((resolve) => {
            resolveScanner = resolve;
          }),
      ),
    };
    const store = createDetectionStore(scanner);

    function KindProbe() {
      const rows = useDetectionStore((s: DetectionStoreState) => s.rows);
      return (
        <span data-testid="kind">{rows['liked-songs']?.kind ?? 'absent'}</span>
      );
    }

    render(
      <DetectionStoreProvider store={store}>
        <KindProbe />
      </DetectionStoreProvider>,
    );
    expect(screen.getByTestId('kind').textContent).toBe('absent');

    // Start a scan — row should enter 'scanning'.
    await act(async () => {
      void store.getState().scanCollection('liked-songs', { kind: 'liked-songs' });
    });
    expect(screen.getByTestId('kind').textContent).toBe('scanning');

    // Resolve the scanner — row should reach 'loaded'.
    const fakeResult: DetectionResult = {
      collectionKey: 'liked-songs',
      completedAt: 1717200000000,
      groups: [],
      duplicateTrackCount: 0,
      removableTrackCount: 0,
      skippedLocalCount: 0,
      unenrichedCount: 0,
      scannedTrackCount: 0,
    };
    await act(async () => {
      resolveScanner(fakeResult);
      // Give the promise chain a tick to settle.
      await Promise.resolve();
    });
    expect(screen.getByTestId('kind').textContent).toBe('loaded');
  });

  it('throws a clear error when used outside a DetectionStoreProvider', () => {
    expect(() =>
      renderHook(() => useDetectionStore((s: DetectionStoreState) => s.rows)),
    ).toThrow(/must be used inside <DetectionStoreProvider>/);
  });

  it('two providers with different store instances stay independent', async () => {
    let resolveA!: (r: DetectionResult) => void;

    const scannerA: DetectionScanner = {
      scan: vi.fn(
        () =>
          new Promise<DetectionResult>((res) => {
            resolveA = res;
          }),
      ),
    };
    // Scanner B never has scan() called in this test (only storeA scans).
    const scannerB: DetectionScanner = {
      scan: vi.fn(() => new Promise<DetectionResult>(() => {})),
    };

    const storeA = createDetectionStore(scannerA);
    const storeB = createDetectionStore(scannerB);

    function KindProbeA() {
      const rows = useDetectionStore((s: DetectionStoreState) => s.rows);
      return (
        <span data-testid="kindA">
          {rows['liked-songs']?.kind ?? 'absent'}
        </span>
      );
    }
    function KindProbeB() {
      const rows = useDetectionStore((s: DetectionStoreState) => s.rows);
      return (
        <span data-testid="kindB">
          {rows['liked-songs']?.kind ?? 'absent'}
        </span>
      );
    }

    render(
      <>
        <DetectionStoreProvider store={storeA}>
          <KindProbeA />
        </DetectionStoreProvider>
        <DetectionStoreProvider store={storeB}>
          <KindProbeB />
        </DetectionStoreProvider>
      </>,
    );

    expect(screen.getByTestId('kindA').textContent).toBe('absent');
    expect(screen.getByTestId('kindB').textContent).toBe('absent');

    // Start scan on A only.
    await act(async () => {
      void storeA.getState().scanCollection('liked-songs', { kind: 'liked-songs' });
    });

    expect(screen.getByTestId('kindA').textContent).toBe('scanning');
    expect(screen.getByTestId('kindB').textContent).toBe('absent'); // B unaffected

    // Resolve A.
    const fakeResult: DetectionResult = {
      collectionKey: 'liked-songs',
      completedAt: 1717200000000,
      groups: [],
      duplicateTrackCount: 0,
      removableTrackCount: 0,
      skippedLocalCount: 0,
      unenrichedCount: 0,
      scannedTrackCount: 0,
    };
    await act(async () => {
      resolveA(fakeResult);
      await Promise.resolve();
    });

    expect(screen.getByTestId('kindA').textContent).toBe('loaded');
    expect(screen.getByTestId('kindB').textContent).toBe('absent'); // B still unaffected
  });
});
