/**
 * DetectionLoadedSummary tests (T021 / WP07).
 *
 * Covered:
 * - Empty groups → "No duplicates found" (AS-1, spec verbatim phrase).
 * - 1 group / 1 removable → "1 duplicate group · 1 track to remove" (singular).
 * - 2 groups / 3 removable → "2 duplicate groups · 3 tracks to remove" (plural).
 * - skippedLocalCount === 0 → annotation NOT rendered.
 * - skippedLocalCount === 7 → "Skipped 7 local files" annotation present.
 * - unenrichedCount === 1 → "1 track couldn't be looked up" (singular).
 * - unenrichedCount === 3 → "3 tracks couldn't be looked up" (plural).
 * - Both annotations present when both > 0.
 * - AS-2: both group count and removable-track count are visible.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { DetectionLoadedSummary } from '../../src/ui/DetectionLoadedSummary';
import type { DetectionResult } from '../../src/ui/DetectionLoadedSummary';
import { DetectionStoreProvider } from '../../src/store/DetectionStoreContext';
import {
  createDetectionStore,
  type DetectionStoreState,
} from '../../src/store/detection-store';
import { FakeRemovalExecutor } from '../../src/adapters/fake-removal-executor';
import type { DetectionScanner } from '../../src/ports/detection-scanner';
import type { DetectionResult as DomainDetectionResult } from '../../src/domain/detection-types';
import type { StoreApi } from 'zustand/vanilla';

// Helper to build a minimal DetectionResult
function makeResult(
  overrides: Partial<DetectionResult> = {},
): DetectionResult {
  return {
    collectionKey: 'test-collection',
    completedAt: Date.now(),
    groups: [],
    duplicateTrackCount: 0,
    removableTrackCount: 0,
    skippedLocalCount: 0,
    unenrichedCount: 0,
    scannedTrackCount: 0,
    ...overrides,
  };
}

// Minimal DuplicateGroup stub for count-based tests
function makeGroups(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `group-${i}`,
    reason: 'name-artist-duration' as const,
    members: [
      {
        position: i * 2,
        uri: `spotify:track:a${i}`,
        canonicalUri: `spotify:track:a${i}`,
        name: `Track ${i}`,
        artists: [{ name: 'Artist' }],
        durationMs: 180000,
      },
      {
        position: i * 2 + 1,
        uri: `spotify:track:b${i}`,
        canonicalUri: `spotify:track:b${i}`,
        name: `Track ${i}`,
        artists: [{ name: 'Artist' }],
        durationMs: 181000,
      },
    ],
    defaultKeepIndex: 0,
  }));
}

describe('DetectionLoadedSummary', () => {
  describe('AS-1: empty groups', () => {
    it('renders "No duplicates found" when groups is empty', () => {
      render(<DetectionLoadedSummary result={makeResult()} />);
      expect(screen.getByText(/No duplicates found/)).toBeInTheDocument();
    });

    it('does not render group/track-count copy when groups is empty', () => {
      render(<DetectionLoadedSummary result={makeResult()} />);
      expect(
        screen.queryByText(/duplicate group/),
      ).not.toBeInTheDocument();
    });
  });

  describe('AS-2: group and track counts', () => {
    it('renders "1 duplicate group" (singular) when 1 group', () => {
      const groups = makeGroups(1);
      render(
        <DetectionLoadedSummary
          result={makeResult({
            groups,
            duplicateTrackCount: 2,
            removableTrackCount: 1,
          })}
        />,
      );
      expect(screen.getByText(/1 duplicate group/)).toBeInTheDocument();
    });

    it('renders "1 track to remove" (singular) when removableTrackCount is 1', () => {
      const groups = makeGroups(1);
      render(
        <DetectionLoadedSummary
          result={makeResult({
            groups,
            duplicateTrackCount: 2,
            removableTrackCount: 1,
          })}
        />,
      );
      expect(screen.getByText(/1 track to remove/)).toBeInTheDocument();
    });

    it('renders both count and removable in one element for 1 group / 1 removable', () => {
      const groups = makeGroups(1);
      render(
        <DetectionLoadedSummary
          result={makeResult({
            groups,
            duplicateTrackCount: 2,
            removableTrackCount: 1,
          })}
        />,
      );
      const el = screen.getByText(/1 duplicate group/);
      expect(el.textContent).toMatch(/1 track to remove/);
    });

    it('renders "2 duplicate groups" (plural) when 2 groups', () => {
      const groups = makeGroups(2);
      render(
        <DetectionLoadedSummary
          result={makeResult({
            groups,
            duplicateTrackCount: 5,
            removableTrackCount: 3,
          })}
        />,
      );
      expect(screen.getByText(/2 duplicate groups/)).toBeInTheDocument();
    });

    it('renders "3 tracks to remove" (plural) when removableTrackCount is 3', () => {
      const groups = makeGroups(2);
      render(
        <DetectionLoadedSummary
          result={makeResult({
            groups,
            duplicateTrackCount: 5,
            removableTrackCount: 3,
          })}
        />,
      );
      expect(screen.getByText(/3 tracks to remove/)).toBeInTheDocument();
    });

    it('AS-2: both group count and removable-track count are visible', () => {
      const groups = makeGroups(2);
      render(
        <DetectionLoadedSummary
          result={makeResult({
            groups,
            duplicateTrackCount: 5,
            removableTrackCount: 3,
          })}
        />,
      );
      const container = screen.getByText(/2 duplicate groups/);
      // Both numbers are visible in the rendered output
      expect(container.textContent).toMatch(/2/);
      expect(container.textContent).toMatch(/3/);
    });
  });

  describe('skippedLocalCount annotation', () => {
    it('does NOT render "Skipped" annotation when skippedLocalCount is 0', () => {
      render(
        <DetectionLoadedSummary
          result={makeResult({ skippedLocalCount: 0 })}
        />,
      );
      expect(screen.queryByText(/Skipped/)).not.toBeInTheDocument();
    });

    it('renders "Skipped 7 local files" when skippedLocalCount is 7', () => {
      render(
        <DetectionLoadedSummary
          result={makeResult({ skippedLocalCount: 7 })}
        />,
      );
      expect(screen.getByText(/Skipped 7 local files?/)).toBeInTheDocument();
    });

    it('renders "Skipped 1 local file" (singular) when skippedLocalCount is 1', () => {
      render(
        <DetectionLoadedSummary
          result={makeResult({ skippedLocalCount: 1 })}
        />,
      );
      // Match either "1 local file" or "1 local files" (singular gracefully handled)
      expect(screen.getByText(/Skipped 1 local file/)).toBeInTheDocument();
    });
  });

  describe('unenrichedCount annotation', () => {
    it('does NOT render "couldn\'t be looked up" annotation when unenrichedCount is 0', () => {
      render(
        <DetectionLoadedSummary
          result={makeResult({ unenrichedCount: 0 })}
        />,
      );
      expect(
        screen.queryByText(/couldn.t be looked up/i),
      ).not.toBeInTheDocument();
    });

    it('renders "1 track couldn\'t be looked up" (singular) when unenrichedCount is 1', () => {
      render(
        <DetectionLoadedSummary
          result={makeResult({ unenrichedCount: 1 })}
        />,
      );
      expect(
        screen.getByText(/1 track couldn.t be looked up/i),
      ).toBeInTheDocument();
    });

    it('renders "3 tracks couldn\'t be looked up" (plural) when unenrichedCount is 3', () => {
      render(
        <DetectionLoadedSummary
          result={makeResult({ unenrichedCount: 3 })}
        />,
      );
      expect(
        screen.getByText(/3 tracks couldn.t be looked up/i),
      ).toBeInTheDocument();
    });
  });

  describe('both annotations', () => {
    it('renders both annotations when skippedLocalCount > 0 and unenrichedCount > 0', () => {
      render(
        <DetectionLoadedSummary
          result={makeResult({ skippedLocalCount: 4, unenrichedCount: 2 })}
        />,
      );
      expect(screen.getByText(/Skipped 4 local file/)).toBeInTheDocument();
      expect(
        screen.getByText(/2 tracks couldn.t be looked up/i),
      ).toBeInTheDocument();
    });
  });

  describe('layout', () => {
    it('renders a container element', () => {
      const { container } = render(
        <DetectionLoadedSummary result={makeResult()} />,
      );
      expect(container.firstChild).not.toBeNull();
    });
  });
});

// ===========================================================================
// Removal host (T023) — store-aware phase rendering + 24/25/26 boundary.
// ===========================================================================

const KEY = 'liked-songs';
const REQUEST = { kind: 'liked-songs' as const };
const TARGET = { kind: 'liked-songs' as const };

/** Build `count` distinct two-member groups → `removableTrackCount = count`. */
function makeDomainGroups(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `group-${i}`,
    reason: 'name-artist-duration' as const,
    members: [
      {
        position: i * 2,
        uri: `spotify:track:a${i}`,
        canonicalUri: `spotify:track:a${i}`,
        name: `Track ${i}`,
        artists: [{ name: 'Artist' }],
        durationMs: 180000,
      },
      {
        position: i * 2 + 1,
        uri: `spotify:track:b${i}`,
        canonicalUri: `spotify:track:b${i}`,
        name: `Track ${i}`,
        artists: [{ name: 'Artist' }],
        durationMs: 181000,
      },
    ],
    defaultKeepIndex: 0,
  }));
}

function makeDomainResult(removableCount: number): DomainDetectionResult {
  return {
    collectionKey: KEY,
    completedAt: 1000,
    groups: makeDomainGroups(removableCount),
    duplicateTrackCount: removableCount * 2,
    removableTrackCount: removableCount,
    skippedLocalCount: 0,
    unenrichedCount: 0,
    scannedTrackCount: removableCount * 2,
  } as DomainDetectionResult;
}

function makeScanner(result: DomainDetectionResult): DetectionScanner {
  return { scan: vi.fn(() => Promise.resolve(result)) };
}

async function seedLoaded(
  removableCount: number,
  executor = new FakeRemovalExecutor(),
): Promise<StoreApi<DetectionStoreState>> {
  const store = createDetectionStore(
    makeScanner(makeDomainResult(removableCount)),
    executor,
  );
  await act(async () => {
    await store.getState().scanCollection(KEY, REQUEST);
  });
  return store;
}

/** The summary result prop derived from the seeded store row. */
function resultFor(removableCount: number): DetectionResult {
  return makeResult({
    groups: makeDomainGroups(removableCount) as unknown as DetectionResult['groups'],
    duplicateTrackCount: removableCount * 2,
    removableTrackCount: removableCount,
  });
}

function renderHost(
  store: StoreApi<DetectionStoreState>,
  removableCount: number,
) {
  return render(
    <DetectionStoreProvider store={store}>
      <DetectionLoadedSummary
        result={resultFor(removableCount)}
        collectionKey={KEY}
        target={TARGET}
        displayName="Liked Songs"
      />
    </DetectionStoreProvider>,
  );
}

describe('DetectionLoadedSummary — removal host (T023)', () => {
  it('back-compat: store-aware row not activated when removal props absent', () => {
    // No provider, no removal props → renders without throwing (no store read).
    const { container } = render(
      <DetectionLoadedSummary result={resultFor(2)} />,
    );
    expect(container.querySelector('button')).toBeNull();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('removal props present but store row absent → surface renders quiescent (no button, no dialog)', () => {
    // Fresh store: no row entry for KEY (idle). The surface mounts (props
    // present) but `row?.kind === 'loaded'` is false → phase defaults to none,
    // the button self-gates to null, and no dialog/outcome shows.
    const store = createDetectionStore(
      makeScanner(makeDomainResult(2)),
      new FakeRemovalExecutor(),
    );
    renderHost(store, 2);
    expect(
      screen.queryByRole('button', { name: /Remove duplicates from/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('phase none + count > 0 → button shown, no dialog', async () => {
    const store = await seedLoaded(2);
    renderHost(store, 2);
    expect(
      screen.getByRole('button', { name: /Remove duplicates from Liked Songs/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('phase confirming → step-1 dialog; confirm → confirmRemoval; cancel → cancelRemoval', async () => {
    const store = await seedLoaded(2);
    const confirmSpy = vi.fn();
    const cancelSpy = vi.fn();
    const { confirmRemoval, cancelRemoval } = store.getState();
    store.setState({
      ...store.getState(),
      confirmRemoval: (k: string) => {
        confirmSpy(k);
        return confirmRemoval(k);
      },
      cancelRemoval: (k: string) => {
        cancelSpy(k);
        cancelRemoval(k);
      },
    } as DetectionStoreState);

    renderHost(store, 2);
    await act(async () => {
      store.getState().requestRemoval(KEY);
    });
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toMatch(/Remove 2 tracks/);

    // Cancel path
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Cancel$/ }));
    });
    expect(cancelSpy).toHaveBeenCalledWith(KEY);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // Re-open + confirm path
    await act(async () => {
      store.getState().requestRemoval(KEY);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Remove$/ }));
    });
    expect(confirmSpy).toHaveBeenCalledWith(KEY);
  });

  it('phase confirming2 → step-2 dialog for a bulk delete (> 25)', async () => {
    const store = await seedLoaded(26);
    renderHost(store, 26);
    await act(async () => {
      store.getState().requestRemoval(KEY);
      await store.getState().confirmRemoval(KEY); // 26 > 25 → confirming2
    });
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toMatch(/Confirm removal of 26 tracks/);
  });

  it('phase removing → progress indicator; button hidden', async () => {
    // Executor that never resolves → row stuck in `removing`.
    const store = createDetectionStore(makeScanner(makeDomainResult(2)), {
      remove: vi.fn(() => new Promise<never>(() => {})),
    });
    await act(async () => {
      await store.getState().scanCollection(KEY, REQUEST);
    });
    renderHost(store, 2);
    await act(async () => {
      store.getState().requestRemoval(KEY);
      void store.getState().confirmRemoval(KEY);
    });
    expect(screen.getByRole('status')).toHaveTextContent(/Removing/);
    expect(
      screen.queryByRole('button', { name: /Remove duplicates from/ }),
    ).not.toBeInTheDocument();
  });

  it('phase removing → shows removedSoFar/total when a progress event is present', async () => {
    const store = createDetectionStore(makeScanner(makeDomainResult(2)), {
      remove: vi.fn((_t, _tracks, _sig, onProgress?: (e: { removedSoFar: number; total: number }) => void) => {
        onProgress?.({ removedSoFar: 1, total: 2 });
        return new Promise<never>(() => {});
      }),
    });
    await act(async () => {
      await store.getState().scanCollection(KEY, REQUEST);
    });
    renderHost(store, 2);
    await act(async () => {
      store.getState().requestRemoval(KEY);
      void store.getState().confirmRemoval(KEY);
    });
    expect(screen.getByRole('status')).toHaveTextContent('Removing… 1/2');
  });

  it('phase partial → outcome view shown; button shown again (retry)', async () => {
    const store = await seedLoaded(
      2,
      new FakeRemovalExecutor({ kind: 'partial', failUris: ['spotify:track:b0'] }),
    );
    renderHost(store, 2);
    await act(async () => {
      store.getState().requestRemoval(KEY);
      await store.getState().confirmRemoval(KEY);
    });
    expect(screen.getByRole('status')).toHaveTextContent(/partially failed/i);
    expect(
      screen.getByRole('button', { name: /Remove duplicates from Liked Songs/ }),
    ).toBeInTheDocument();
  });
});

describe('DetectionLoadedSummary — 24/25/26 boundary through the UI', () => {
  it.each([24, 25])(
    'count %i reaches removing after one confirm (no step-2 dialog)',
    async (count) => {
      const store = await seedLoaded(count, new FakeRemovalExecutor({ kind: 'ok' }));
      renderHost(store, count);
      await act(async () => {
        store.getState().requestRemoval(KEY);
      });
      // step-1 dialog visible
      expect(screen.getByRole('dialog').textContent).toMatch(
        new RegExp(`Remove ${count} tracks`),
      );
      await act(async () => {
        await store.getState().confirmRemoval(KEY);
      });
      // ≤25 → executed in one confirm; FakeRemovalExecutor `ok` → clean finish,
      // phase returns to `none` (no second dialog ever shown).
      const row = store.getState().rows[KEY];
      expect(row?.kind === 'loaded' && row.removal.phase).toBe('none');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    },
  );

  it('count 26 shows the step-2 dialog before removing', async () => {
    const store = await seedLoaded(26, new FakeRemovalExecutor({ kind: 'ok' }));
    renderHost(store, 26);
    await act(async () => {
      store.getState().requestRemoval(KEY);
    });
    // First confirm → does NOT remove yet; shows the bulk reconfirmation.
    await act(async () => {
      await store.getState().confirmRemoval(KEY);
    });
    const row = store.getState().rows[KEY];
    expect(row?.kind === 'loaded' && row.removal.phase).toBe('confirming2');
    expect(screen.getByRole('dialog').textContent).toMatch(
      /Confirm removal of 26 tracks/,
    );
    // Second confirm → executes; clean finish → none.
    await act(async () => {
      await store.getState().confirmRemoval(KEY);
    });
    const after = store.getState().rows[KEY];
    expect(after?.kind === 'loaded' && after.removal.phase).toBe('none');
  });
});
