/**
 * Tests for `RemoveDuplicatesButton` (T020 / WP06).
 *
 * The button reads its row from the detection store and self-gates:
 * - Renders ONLY when the row is `loaded`, `result.removableTrackCount > 0`,
 *   and `removal.phase ∈ {none, partial}` (FR-001/FR-002, AS-1/AS-2).
 * - Renders `null` when the row is absent/idle/scanning/failed, when
 *   `removableTrackCount === 0`, and while `phase ∈ {confirming,confirming2,removing}`.
 * - onClick dispatches `requestRemoval(collectionKey)` (no executor call).
 * - Label is `Remove {n} duplicate(s)` (pluralized); `aria-label` names the
 *   collection (`Remove duplicates from {displayName}`).
 *
 * Built against a REAL store (`createDetectionStore` + `FakeRemovalExecutor`)
 * under a `DetectionStoreProvider` (DIRECTIVE_036).
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { RemoveDuplicatesButton } from '../../src/ui/RemoveDuplicatesButton';
import { DetectionStoreProvider } from '../../src/store/DetectionStoreContext';
import {
  createDetectionStore,
  type DetectionStoreState,
} from '../../src/store/detection-store';
import { FakeRemovalExecutor } from '../../src/adapters/fake-removal-executor';
import { createDetectionScanner } from '../../src/adapters/detection-scanner';
import { InlineCatalogEnricher } from '../../src/adapters/inline-catalog-enricher';
import type { DetectionScanner } from '../../src/ports/detection-scanner';
import type { TracksEnumerator } from '../../src/ports/tracks-enumerator';
import type {
  DetectionResult,
  DuplicateGroup,
  RawTrack,
  ScanRequest,
  ProgressEvent,
  EnumerationResult,
} from '../../src/domain/detection-types';
import type { StoreApi } from 'zustand/vanilla';

const KEY = 'liked-songs';
const REQUEST = { kind: 'liked-songs' as const };
const TARGET = { kind: 'liked-songs' as const };

/** Stub scanner whose `scan` resolves with a supplied result. */
function makeScanner(result: DetectionResult): DetectionScanner {
  return { scan: vi.fn(() => Promise.resolve(result)) };
}

/** Build `count` distinct two-member groups → `removableTrackCount = count`. */
function makeGroups(count: number): DuplicateGroup[] {
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

function makeResult(removableCount: number): DetectionResult {
  const groups = makeGroups(removableCount);
  return {
    collectionKey: KEY,
    completedAt: 1000,
    groups,
    duplicateTrackCount: removableCount * 2,
    removableTrackCount: removableCount,
    skippedLocalCount: 0,
    unenrichedCount: 0,
    scannedTrackCount: removableCount * 2,
  } as DetectionResult;
}

/** Build a store and seed the row to `loaded` with `removableCount` removable. */
async function makeLoadedStore(
  removableCount: number,
): Promise<StoreApi<DetectionStoreState>> {
  const store = createDetectionStore(
    makeScanner(makeResult(removableCount)),
    new FakeRemovalExecutor(),
  );
  await act(async () => {
    await store.getState().scanCollection(KEY, REQUEST);
  });
  return store;
}

// ── compute-failed seed (NEW-4 / FR-007) ────────────────────────────────────

/** A playlist URI used as both the scan request target and the collection key. */
const PLAYLIST_URI = 'spotify:playlist:repro2song';
const KEPT_UID = '610a666b423c78e4';

/** A `RawTrack` for a playlist occurrence (mirrors the termination integration). */
function rawPlaylistTrack(uri: string, uid: string | undefined, position: number): RawTrack {
  return {
    uri,
    id: uri.split(':')[2]!,
    name: 'Repro Song',
    artists: [{ uri: 'spotify:artist:a0', name: 'Repro Artist' }],
    album: { uri: 'spotify:album:al0', name: 'Repro Album' },
    position,
    durationMs: 210_000,
    ...(uid === undefined ? {} : { uid }),
  };
}

/** A `TracksEnumerator` double returning a fixed `RawTrack[]` (no local skips). */
function fakeEnumerator(tracks: ReadonlyArray<RawTrack>): TracksEnumerator {
  return {
    async enumerate(
      _request: ScanRequest,
      signal: AbortSignal,
      onProgress: (event: ProgressEvent) => void,
    ): Promise<EnumerationResult> {
      if (signal.aborted) throw new DOMException('aborted', 'AbortError');
      onProgress({ stage: 'enumerating', processed: tracks.length, total: tracks.length });
      return { tracks, skippedLocalCount: 0 };
    },
  };
}

/**
 * Drive a REAL store to phase `partial` with `outcome.provenance === 'compute-failed'`
 * (NEW-4): a playlist whose duplicate member lacks a `uid` makes `computeRemoveSet`
 * throw before any host call, so the FSM lands `compute-failed → partial`.
 */
async function makeComputeFailedPartialStore(): Promise<StoreApi<DetectionStoreState>> {
  const dupNoUid = rawPlaylistTrack('spotify:track:dup', undefined, 1);
  const tracks = [rawPlaylistTrack('spotify:track:dup', KEPT_UID, 0), dupNoUid];
  const scanner = createDetectionScanner(
    fakeEnumerator(tracks),
    new InlineCatalogEnricher(),
  );
  const store = createDetectionStore(scanner, new FakeRemovalExecutor({ kind: 'ok' }));
  await act(async () => {
    await store.getState().scanCollection(PLAYLIST_URI, {
      kind: 'playlist',
      playlistUri: PLAYLIST_URI,
    });
  });
  await act(async () => {
    store.getState().requestRemoval(PLAYLIST_URI);
    await store.getState().confirmRemoval(PLAYLIST_URI);
  });
  return store;
}

function renderButton(
  store: StoreApi<DetectionStoreState>,
  displayName = 'My Playlist',
  collectionKey = KEY,
) {
  return render(
    <DetectionStoreProvider store={store}>
      <RemoveDuplicatesButton
        collectionKey={collectionKey}
        target={TARGET}
        displayName={displayName}
      />
    </DetectionStoreProvider>,
  );
}

describe('RemoveDuplicatesButton — visibility gating', () => {
  it('renders nothing when the row is absent (idle by default)', () => {
    const store = createDetectionStore(
      makeScanner(makeResult(1)),
      new FakeRemovalExecutor(),
    );
    const { container } = renderButton(store);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing while the row is scanning', async () => {
    const store = createDetectionStore(
      { scan: vi.fn(() => new Promise<never>(() => {})) },
      new FakeRemovalExecutor(),
    );
    await act(async () => {
      void store.getState().scanCollection(KEY, REQUEST);
    });
    const { container } = renderButton(store);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when the row is failed', async () => {
    const store = createDetectionStore(
      { scan: vi.fn(() => Promise.reject(new Error('boom'))) },
      new FakeRemovalExecutor(),
    );
    await act(async () => {
      await store.getState().scanCollection(KEY, REQUEST);
    });
    const { container } = renderButton(store);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when removableTrackCount === 0', async () => {
    const store = await makeLoadedStore(0);
    const { container } = renderButton(store);
    expect(container.firstChild).toBeNull();
  });

  it('renders the button when loaded + count > 0 + phase none', async () => {
    const store = await makeLoadedStore(2);
    renderButton(store);
    expect(
      screen.getByRole('button', { name: /Remove duplicates from My Playlist/ }),
    ).toBeInTheDocument();
  });

  it('renders the button in phase partial (retry)', async () => {
    // FakeRemovalExecutor scripted to fail one track → partial phase.
    const store = createDetectionStore(
      makeScanner(makeResult(2)),
      new FakeRemovalExecutor({ kind: 'partial', failUris: ['spotify:track:b0'] }),
    );
    await act(async () => {
      await store.getState().scanCollection(KEY, REQUEST);
    });
    await act(async () => {
      store.getState().requestRemoval(KEY);
      await store.getState().confirmRemoval(KEY);
    });
    const row = store.getState().rows[KEY];
    expect(row?.kind === 'loaded' && row.removal.phase).toBe('partial');
    renderButton(store);
    expect(
      screen.getByRole('button', { name: /Remove duplicates from My Playlist/ }),
    ).toBeInTheDocument();
  });

  it('renders nothing while phase confirming', async () => {
    const store = await makeLoadedStore(2);
    await act(async () => {
      store.getState().requestRemoval(KEY);
    });
    const { container } = renderButton(store);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing while phase confirming2 (bulk)', async () => {
    const store = await makeLoadedStore(26);
    await act(async () => {
      store.getState().requestRemoval(KEY);
      await store.getState().confirmRemoval(KEY); // 26 > 25 → confirming2
    });
    const row = store.getState().rows[KEY];
    expect(row?.kind === 'loaded' && row.removal.phase).toBe('confirming2');
    const { container } = renderButton(store);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing while phase removing', async () => {
    // Executor that never resolves → row stuck in `removing`.
    const store = createDetectionStore(
      makeScanner(makeResult(2)),
      {
        remove: vi.fn(() => new Promise<never>(() => {})),
      },
    );
    await act(async () => {
      await store.getState().scanCollection(KEY, REQUEST);
    });
    await act(async () => {
      store.getState().requestRemoval(KEY);
      void store.getState().confirmRemoval(KEY);
    });
    const row = store.getState().rows[KEY];
    expect(row?.kind === 'loaded' && row.removal.phase).toBe('removing');
    const { container } = renderButton(store);
    expect(container.firstChild).toBeNull();
  });
});

describe('RemoveDuplicatesButton — compute-failed is terminal (NEW-4 / FR-007 / SC-004)', () => {
  it('renders nothing for a partial row whose outcome provenance is compute-failed', async () => {
    const store = await makeComputeFailedPartialStore();
    const row = store.getState().rows[PLAYLIST_URI];
    // Guard the fixture: a real compute-failed partial with removable tracks.
    if (row?.kind !== 'loaded' || row.removal.phase !== 'partial') {
      throw new Error('expected loaded + partial fixture');
    }
    expect(row.removal.outcome.provenance).toBe('compute-failed');
    expect(row.result.removableTrackCount).toBeGreaterThan(0);

    const { container } = renderButton(store, 'My Playlist', PLAYLIST_URI);
    // Terminal: no retry control may be dispatched.
    expect(container.firstChild).toBeNull();
  });

  it('STILL renders the retry button for a partial row with a non-compute-failed provenance (host)', async () => {
    // FakeRemovalExecutor scripted to fail one track → partial / provenance host.
    const store = createDetectionStore(
      makeScanner(makeResult(2)),
      new FakeRemovalExecutor({ kind: 'partial', failUris: ['spotify:track:b0'] }),
    );
    await act(async () => {
      await store.getState().scanCollection(KEY, REQUEST);
    });
    await act(async () => {
      store.getState().requestRemoval(KEY);
      await store.getState().confirmRemoval(KEY);
    });
    const row = store.getState().rows[KEY];
    if (row?.kind !== 'loaded' || row.removal.phase !== 'partial') {
      throw new Error('expected loaded + partial fixture');
    }
    expect(row.removal.outcome.provenance).not.toBe('compute-failed');

    renderButton(store);
    expect(
      screen.getByRole('button', { name: /Remove duplicates from My Playlist/ }),
    ).toBeInTheDocument();
  });
});

describe('RemoveDuplicatesButton — click + label', () => {
  it('click dispatches requestRemoval(collectionKey) once', async () => {
    const store = await makeLoadedStore(2);
    const spy = vi.fn();
    const original = store.getState().requestRemoval;
    store.setState({
      ...store.getState(),
      requestRemoval: (k: string) => {
        spy(k);
        original(k);
      },
    } as DetectionStoreState);
    renderButton(store);
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /Remove duplicates from My Playlist/ }),
      );
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(KEY);
  });

  it('label shows the exact count and pluralizes (2 → duplicates)', async () => {
    const store = await makeLoadedStore(2);
    renderButton(store);
    expect(screen.getByText('Remove 2 duplicates')).toBeInTheDocument();
  });

  it('label is singular at count 1 (1 → duplicate)', async () => {
    const store = await makeLoadedStore(1);
    renderButton(store);
    expect(screen.getByText('Remove 1 duplicate')).toBeInTheDocument();
  });
});
