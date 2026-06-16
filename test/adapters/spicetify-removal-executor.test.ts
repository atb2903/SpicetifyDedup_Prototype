/**
 * Unit tests for `SpicetifyRemovalExecutor`.
 *
 * All tests inject a stub `RemovalExecutorPlatform` via the constructor — no
 * `globalThis.Spicetify` stubbing required (one test exercises the lazy
 * fallback branch explicitly). Covers: kind dispatch, batching boundaries,
 * partial failure, host-availability guard, abort between batches, order
 * preservation, the missing-`uid` fail-loud guard, and progress events.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  SpicetifyRemovalExecutor,
  BATCH_SIZE,
  type RemovalExecutorPlatform,
} from '../../src/adapters/spicetify-removal-executor';
import { isRemovalError } from '../../src/domain/removal-errors';
import type {
  RemovalTarget,
  TrackRef,
  RemovalProgressEvent,
} from '../../src/domain/removal-types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type LibraryRemove = (param: { uris: string[] }) => Promise<void>;
type PlaylistRemove = (
  playlistUri: string,
  tracks: { uri: string; uid: string }[],
) => Promise<void>;

/** Build a stub platform with spy `remove` methods (resolve by default). */
function makePlatform(opts: {
  libraryRemove?: LibraryRemove;
  playlistRemove?: PlaylistRemove;
} = {}): RemovalExecutorPlatform {
  return {
    LibraryAPI: {
      remove: vi.fn<LibraryRemove>(opts.libraryRemove ?? (() => Promise.resolve())),
    },
    PlaylistAPI: {
      remove: vi.fn<PlaylistRemove>(opts.playlistRemove ?? (() => Promise.resolve())),
    },
  };
}

function likedTarget(): RemovalTarget {
  return { kind: 'liked-songs' };
}

function playlistTarget(uri = 'spotify:playlist:TEST'): RemovalTarget {
  return { kind: 'playlist', playlistUri: uri };
}

/** N liked-songs refs (uri only, no uid). */
function likedRefs(n: number): TrackRef[] {
  return Array.from({ length: n }, (_, i) => ({
    uri: `spotify:track:LIKED${String(i).padStart(5, '0')}`,
  }));
}

/** N playlist refs (uri + uid). */
function playlistRefs(n: number): TrackRef[] {
  return Array.from({ length: n }, (_, i) => ({
    uri: `spotify:track:PL${String(i).padStart(5, '0')}`,
    uid: `uid-${String(i).padStart(5, '0')}`,
  }));
}

function neverAborted(): AbortSignal {
  return new AbortController().signal;
}

function alreadyAborted(): AbortSignal {
  const c = new AbortController();
  c.abort();
  return c.signal;
}

// ---------------------------------------------------------------------------
// Liked Songs happy path
// ---------------------------------------------------------------------------

describe('SpicetifyRemovalExecutor — liked-songs happy path', () => {
  it('calls LibraryAPI.remove with the batch URIs; uid never forwarded; all removed', async () => {
    const platform = makePlatform();
    const exec = new SpicetifyRemovalExecutor(platform);
    const tracks = likedRefs(3);
    const outcome = await exec.remove(likedTarget(), tracks, neverAborted());

    expect(platform.LibraryAPI.remove).toHaveBeenCalledTimes(1);
    expect(platform.LibraryAPI.remove).toHaveBeenCalledWith({
      uris: tracks.map((t) => t.uri),
    });
    // No uid on the param shape.
    const arg = (platform.LibraryAPI.remove as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(Object.keys(arg)).toEqual(['uris']);
    expect(platform.PlaylistAPI.remove).not.toHaveBeenCalled();
    expect(outcome.removed).toEqual(tracks);
    expect(outcome.failed).toEqual([]);
    expect(outcome.provenance).toBe('host');
  });
});

// ---------------------------------------------------------------------------
// Playlist happy path
// ---------------------------------------------------------------------------

describe('SpicetifyRemovalExecutor — playlist happy path', () => {
  it('calls PlaylistAPI.remove(playlistUri, [{ uri, uid }]); all removed', async () => {
    const platform = makePlatform();
    const exec = new SpicetifyRemovalExecutor(platform);
    const tracks = playlistRefs(2);
    const outcome = await exec.remove(playlistTarget(), tracks, neverAborted());

    expect(platform.PlaylistAPI.remove).toHaveBeenCalledTimes(1);
    expect(platform.PlaylistAPI.remove).toHaveBeenCalledWith('spotify:playlist:TEST', [
      { uri: tracks[0]!.uri, uid: tracks[0]!.uid },
      { uri: tracks[1]!.uri, uid: tracks[1]!.uid },
    ]);
    expect(platform.LibraryAPI.remove).not.toHaveBeenCalled();
    expect(outcome.removed).toEqual(tracks);
    expect(outcome.failed).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Batching boundaries (BATCH_SIZE is a numeric bound)
// ---------------------------------------------------------------------------

describe('SpicetifyRemovalExecutor — batching boundaries', () => {
  it('0 tracks → no host call, empty outcome', async () => {
    const platform = makePlatform();
    const exec = new SpicetifyRemovalExecutor(platform);
    const outcome = await exec.remove(likedTarget(), [], neverAborted());
    expect(platform.LibraryAPI.remove).not.toHaveBeenCalled();
    expect(outcome.removed).toEqual([]);
    expect(outcome.failed).toEqual([]);
  });

  it('BATCH_SIZE − 1 tracks → one batch of that size', async () => {
    const platform = makePlatform();
    const exec = new SpicetifyRemovalExecutor(platform);
    const tracks = likedRefs(BATCH_SIZE - 1);
    const outcome = await exec.remove(likedTarget(), tracks, neverAborted());
    expect(platform.LibraryAPI.remove).toHaveBeenCalledTimes(1);
    const arg = (platform.LibraryAPI.remove as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(arg.uris).toHaveLength(BATCH_SIZE - 1);
    expect(outcome.removed).toHaveLength(BATCH_SIZE - 1);
  });

  it('BATCH_SIZE tracks → exactly one batch of BATCH_SIZE', async () => {
    const platform = makePlatform();
    const exec = new SpicetifyRemovalExecutor(platform);
    const tracks = likedRefs(BATCH_SIZE);
    await exec.remove(likedTarget(), tracks, neverAborted());
    expect(platform.LibraryAPI.remove).toHaveBeenCalledTimes(1);
    const arg = (platform.LibraryAPI.remove as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(arg.uris).toHaveLength(BATCH_SIZE);
  });

  it('BATCH_SIZE + 1 tracks → two batches (BATCH_SIZE, then 1)', async () => {
    const platform = makePlatform();
    const exec = new SpicetifyRemovalExecutor(platform);
    const tracks = likedRefs(BATCH_SIZE + 1);
    const outcome = await exec.remove(likedTarget(), tracks, neverAborted());
    expect(platform.LibraryAPI.remove).toHaveBeenCalledTimes(2);
    const calls = (platform.LibraryAPI.remove as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0]![0].uris).toHaveLength(BATCH_SIZE);
    expect(calls[1]![0].uris).toHaveLength(1);
    expect(outcome.removed).toHaveLength(BATCH_SIZE + 1);
  });
});

// ---------------------------------------------------------------------------
// Partial failure — per-track fallback on batch rejection (live-verify 2026-06-12)
//
// PlaylistAPI.remove is atomic reject-whole on a single bad member (live finding
// 3): a rejected bulk batch removed NOTHING, so the adapter retries each track in
// that batch with its own single-track host call. Resolves → removed; rejects →
// failed with the rejection message. Safe: the atomic reject removed nothing, so
// per-track retries cannot double-remove.
// ---------------------------------------------------------------------------

describe('SpicetifyRemovalExecutor — per-track fallback (playlist atomic reject)', () => {
  it('bulk batch rejects → per-track retry: valid removed, stale uid failed; total accounted; disjoint; call shape = 1 bulk + N singles', async () => {
    const staleUid = 'uid-00001'; // the one stale occurrence
    const playlistRemove = vi.fn<PlaylistRemove>(
      (_uri, batch: { uri: string; uid: string }[]) => {
        // Bulk batch (length > 1) rejects atomically.
        if (batch.length > 1) {
          return Promise.reject(new Error('Given row id does not exist!'));
        }
        // Single-track retry: reject the stale uid, resolve the rest.
        if (batch[0]!.uid === staleUid) {
          return Promise.reject(new Error('Given row id does not exist!'));
        }
        return Promise.resolve();
      },
    );
    const platform = makePlatform();
    platform.PlaylistAPI.remove = playlistRemove;
    const exec = new SpicetifyRemovalExecutor(platform);
    const tracks = playlistRefs(3); // uid-00000, uid-00001 (stale), uid-00002

    const outcome = await exec.remove(playlistTarget(), tracks, neverAborted());

    // 1 bulk reject + 3 single retries = 4 host calls.
    expect(playlistRemove).toHaveBeenCalledTimes(4);
    // First call is the bulk batch of 3.
    expect(playlistRemove.mock.calls[0]![1]).toHaveLength(3);
    // Retries are single-element.
    expect(playlistRemove.mock.calls[1]![1]).toEqual([
      { uri: tracks[0]!.uri, uid: tracks[0]!.uid },
    ]);
    expect(playlistRemove.mock.calls[2]![1]).toEqual([
      { uri: tracks[1]!.uri, uid: tracks[1]!.uid },
    ]);
    expect(playlistRemove.mock.calls[3]![1]).toEqual([
      { uri: tracks[2]!.uri, uid: tracks[2]!.uid },
    ]);
    // Valid tracks removed, stale one failed with the rejection message.
    expect(outcome.removed).toEqual([tracks[0], tracks[2]]);
    expect(outcome.failed).toHaveLength(1);
    expect(outcome.failed[0]!.track).toBe(tracks[1]);
    expect(outcome.failed[0]!.reason).toBe('Given row id does not exist!');
    // Total accounted + disjoint.
    expect(outcome.removed.length + outcome.failed.length).toBe(tracks.length);
    expect(outcome.removed).not.toContain(tracks[1]);
  });

  it('per-track retry that rejects with a non-Error uses the stringified reason', async () => {
    const playlistRemove = vi.fn<PlaylistRemove>(
      (_uri, batch: { uri: string; uid: string }[]) => {
        if (batch.length > 1) return Promise.reject('bulk string reject');
        return Promise.reject('single string reject');
      },
    );
    const platform = makePlatform();
    platform.PlaylistAPI.remove = playlistRemove;
    const exec = new SpicetifyRemovalExecutor(platform);
    const tracks = playlistRefs(2);

    const outcome = await exec.remove(playlistTarget(), tracks, neverAborted());

    expect(outcome.removed).toEqual([]);
    expect(outcome.failed).toHaveLength(2);
    expect(outcome.failed.every((f) => f.reason === 'single string reject')).toBe(true);
  });

  it('liked-songs tolerant path: bulk LibraryAPI.remove resolves → NO per-track retries', async () => {
    const libraryRemove = vi.fn<LibraryRemove>(() => Promise.resolve());
    const platform = makePlatform();
    platform.LibraryAPI.remove = libraryRemove;
    const exec = new SpicetifyRemovalExecutor(platform);
    const tracks = likedRefs(3);

    const outcome = await exec.remove(likedTarget(), tracks, neverAborted());

    // Exactly one bulk call — no single-track fallback triggered on success.
    expect(libraryRemove).toHaveBeenCalledTimes(1);
    expect(libraryRemove.mock.calls[0]![0]).toEqual({ uris: tracks.map((t) => t.uri) });
    expect(outcome.removed).toEqual(tracks);
    expect(outcome.failed).toEqual([]);
  });

  it('liked-songs fallback: bulk rejects → per-track single { uris: [uri] } retries', async () => {
    const badUri = 'spotify:track:LIKED00001';
    const libraryRemove = vi.fn<LibraryRemove>((param: { uris: string[] }) => {
      if (param.uris.length > 1) return Promise.reject(new Error('bulk boom'));
      if (param.uris[0] === badUri) return Promise.reject(new Error('single boom'));
      return Promise.resolve();
    });
    const platform = makePlatform();
    platform.LibraryAPI.remove = libraryRemove;
    const exec = new SpicetifyRemovalExecutor(platform);
    const tracks = likedRefs(3); // LIKED00000, LIKED00001 (bad), LIKED00002

    const outcome = await exec.remove(likedTarget(), tracks, neverAborted());

    // 1 bulk reject + 3 single retries.
    expect(libraryRemove).toHaveBeenCalledTimes(4);
    expect(libraryRemove.mock.calls[1]![0]).toEqual({ uris: [tracks[0]!.uri] });
    expect(outcome.removed).toEqual([tracks[0], tracks[2]]);
    expect(outcome.failed).toHaveLength(1);
    expect(outcome.failed[0]!.track).toBe(tracks[1]);
    expect(outcome.failed[0]!.reason).toBe('single boom');
  });

  it('multi-batch: only the failing batch triggers per-track retries; the succeeding batch uses one bulk call', async () => {
    // Batch 1 (indices 0..BATCH_SIZE) succeeds; batch 2 (the +1 tail) rejects bulk
    // then its single retry rejects too.
    const libraryRemove = vi.fn<LibraryRemove>((param: { uris: string[] }) => {
      // The tail batch is a single track; its bulk call has length 1.
      // Distinguish the failing batch by its URI (the BATCH_SIZE-th track).
      const tailUri = `spotify:track:LIKED${String(BATCH_SIZE).padStart(5, '0')}`;
      if (param.uris.includes(tailUri)) return Promise.reject(new Error('tail boom'));
      return Promise.resolve();
    });
    const platform = makePlatform();
    platform.LibraryAPI.remove = libraryRemove;
    const exec = new SpicetifyRemovalExecutor(platform);
    const tracks = likedRefs(BATCH_SIZE + 1);

    const outcome = await exec.remove(likedTarget(), tracks, neverAborted());

    // Batch 1: one bulk call (succeeds). Batch 2: one bulk (rejects) + one single
    // retry (rejects) = 3 calls total.
    expect(libraryRemove).toHaveBeenCalledTimes(3);
    expect(libraryRemove.mock.calls[0]![0].uris).toHaveLength(BATCH_SIZE);
    expect(libraryRemove.mock.calls[1]![0].uris).toHaveLength(1); // bulk of the tail
    expect(libraryRemove.mock.calls[2]![0].uris).toHaveLength(1); // single retry
    expect(outcome.removed).toHaveLength(BATCH_SIZE);
    expect(outcome.failed).toHaveLength(1);
    expect(outcome.failed[0]!.track).toBe(tracks[BATCH_SIZE]);
    expect(outcome.removed.length + outcome.failed.length).toBe(tracks.length);
  });
});

// ---------------------------------------------------------------------------
// Host-unavailable guard
// ---------------------------------------------------------------------------

describe('SpicetifyRemovalExecutor — host-unavailable guard', () => {
  it('throws RemovalError(host-unavailable) when LibraryAPI is absent (no call)', async () => {
    const platform = { PlaylistAPI: { remove: vi.fn() } } as unknown as RemovalExecutorPlatform;
    const exec = new SpicetifyRemovalExecutor(platform);
    await expect(
      exec.remove(likedTarget(), likedRefs(1), neverAborted()),
    ).rejects.toSatisfy(
      (e: unknown) => isRemovalError(e) && e.code === 'host-unavailable',
    );
  });

  it('throws RemovalError(host-unavailable) when LibraryAPI.remove is missing', async () => {
    const platform = {
      LibraryAPI: {} as { remove: LibraryRemove },
      PlaylistAPI: { remove: vi.fn() },
    } as unknown as RemovalExecutorPlatform;
    const exec = new SpicetifyRemovalExecutor(platform);
    await expect(
      exec.remove(likedTarget(), likedRefs(1), neverAborted()),
    ).rejects.toSatisfy(
      (e: unknown) => isRemovalError(e) && e.code === 'host-unavailable',
    );
  });

  it('throws RemovalError(host-unavailable) when PlaylistAPI is absent for a playlist target', async () => {
    const platform = { LibraryAPI: { remove: vi.fn() } } as unknown as RemovalExecutorPlatform;
    const exec = new SpicetifyRemovalExecutor(platform);
    await expect(
      exec.remove(playlistTarget(), playlistRefs(1), neverAborted()),
    ).rejects.toSatisfy(
      (e: unknown) => isRemovalError(e) && e.code === 'host-unavailable',
    );
  });

  it('throws RemovalError(host-unavailable) when PlaylistAPI.remove is missing', async () => {
    const platform = {
      LibraryAPI: { remove: vi.fn() },
      PlaylistAPI: {} as { remove: PlaylistRemove },
    } as unknown as RemovalExecutorPlatform;
    const exec = new SpicetifyRemovalExecutor(platform);
    await expect(
      exec.remove(playlistTarget(), playlistRefs(1), neverAborted()),
    ).rejects.toSatisfy(
      (e: unknown) => isRemovalError(e) && e.code === 'host-unavailable',
    );
  });

  it('throws RemovalError(host-unavailable) when the whole platform is absent (no global)', async () => {
    const prev = (globalThis as Record<string, unknown>)['Spicetify'];
    try {
      delete (globalThis as Record<string, unknown>)['Spicetify'];
      const exec = new SpicetifyRemovalExecutor(); // no arg → lazy global lookup
      await expect(
        exec.remove(likedTarget(), likedRefs(1), neverAborted()),
      ).rejects.toSatisfy(
        (e: unknown) => isRemovalError(e) && e.code === 'host-unavailable',
      );
    } finally {
      if (prev === undefined) {
        delete (globalThis as Record<string, unknown>)['Spicetify'];
      } else {
        (globalThis as Record<string, unknown>)['Spicetify'] = prev;
      }
    }
  });

  it('guard fires before any mutation even with tracks present', async () => {
    const platform = { PlaylistAPI: { remove: vi.fn() } } as unknown as RemovalExecutorPlatform;
    const exec = new SpicetifyRemovalExecutor(platform);
    let threw = false;
    try {
      await exec.remove(likedTarget(), likedRefs(5), neverAborted());
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
    expect((platform.PlaylistAPI.remove as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Abort
// ---------------------------------------------------------------------------

describe('SpicetifyRemovalExecutor — boundary abort (FR-003)', () => {
  it('already aborted at entry → resolves with an empty host partial (no host call)', async () => {
    const platform = makePlatform();
    const exec = new SpicetifyRemovalExecutor(platform);
    const outcome = await exec.remove(
      likedTarget(),
      likedRefs(BATCH_SIZE + 1),
      alreadyAborted(),
    );
    // No mutation attempted; the accumulated partial is empty but host-truthful.
    expect(platform.LibraryAPI.remove).not.toHaveBeenCalled();
    expect(outcome.removed).toEqual([]);
    expect(outcome.failed).toEqual([]);
    expect(outcome.provenance).toBe('host');
  });

  it('aborts before the 2nd batch → resolves with the accumulated partial, no further host calls', async () => {
    const controller = new AbortController();
    let call = 0;
    const platform = makePlatform({
      libraryRemove: () => {
        call++;
        if (call === 1) controller.abort();
        return Promise.resolve();
      },
    });
    const exec = new SpicetifyRemovalExecutor(platform);
    const tracks = likedRefs(BATCH_SIZE + 1);
    const outcome = await exec.remove(likedTarget(), tracks, controller.signal);
    // Only the first batch ran; the abort check before batch 2 stops the loop
    // and the call resolves with the first batch's removed tracks (FR-003).
    expect(platform.LibraryAPI.remove).toHaveBeenCalledTimes(1);
    expect(outcome.provenance).toBe('host');
    expect(outcome.removed).toEqual(tracks.slice(0, BATCH_SIZE));
    expect(outcome.failed).toEqual([]);
    // No un-attempted track is invented into `failed`.
    expect(outcome.removed.length + outcome.failed.length).toBe(BATCH_SIZE);
  });
});

// ---------------------------------------------------------------------------
// Order preservation
// ---------------------------------------------------------------------------

describe('SpicetifyRemovalExecutor — order preservation', () => {
  it('passes URIs to the host in the order received (no re-order/dedup)', async () => {
    const platform = makePlatform();
    const exec = new SpicetifyRemovalExecutor(platform);
    // Include a deliberately repeated URI to prove no dedup.
    const tracks: TrackRef[] = [
      { uri: 'spotify:track:C' },
      { uri: 'spotify:track:A' },
      { uri: 'spotify:track:A' },
      { uri: 'spotify:track:B' },
    ];
    await exec.remove(likedTarget(), tracks, neverAborted());
    const arg = (platform.LibraryAPI.remove as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(arg.uris).toEqual([
      'spotify:track:C',
      'spotify:track:A',
      'spotify:track:A',
      'spotify:track:B',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Playlist ref missing uid — fail loud
// ---------------------------------------------------------------------------

describe('SpicetifyRemovalExecutor — playlist ref missing uid', () => {
  it('fails loud (RemovalError) rather than passing undefined uid', async () => {
    const platform = makePlatform();
    const exec = new SpicetifyRemovalExecutor(platform);
    const tracks: TrackRef[] = [{ uri: 'spotify:track:X' }]; // no uid
    await expect(
      exec.remove(playlistTarget(), tracks, neverAborted()),
    ).rejects.toSatisfy((e: unknown) => isRemovalError(e));
    expect(platform.PlaylistAPI.remove).not.toHaveBeenCalled();
  });

  it('fails loud when uid is an empty string', async () => {
    const platform = makePlatform();
    const exec = new SpicetifyRemovalExecutor(platform);
    const tracks: TrackRef[] = [{ uri: 'spotify:track:X', uid: '' }];
    await expect(
      exec.remove(playlistTarget(), tracks, neverAborted()),
    ).rejects.toSatisfy((e: unknown) => isRemovalError(e));
  });
});

// ---------------------------------------------------------------------------
// Progress events
// ---------------------------------------------------------------------------

describe('SpicetifyRemovalExecutor — progress', () => {
  it('calls onProgress after each fulfilled batch with cumulative removedSoFar + total', async () => {
    const platform = makePlatform();
    const exec = new SpicetifyRemovalExecutor(platform);
    const tracks = likedRefs(BATCH_SIZE + 1);
    const onProgress = vi.fn<(e: RemovalProgressEvent) => void>();
    await exec.remove(likedTarget(), tracks, neverAborted(), onProgress);
    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress.mock.calls[0]![0]).toEqual({
      removedSoFar: BATCH_SIZE,
      total: BATCH_SIZE + 1,
    });
    expect(onProgress.mock.calls[1]![0]).toEqual({
      removedSoFar: BATCH_SIZE + 1,
      total: BATCH_SIZE + 1,
    });
  });

  it('emits onProgress after a fully-failed batch (post-fallback) with unchanged removedSoFar', async () => {
    // Bulk rejects, every single-track retry also rejects → nothing removed, but
    // onProgress still fires once per batch with the (unchanged) cumulative count.
    const platform = makePlatform({
      libraryRemove: () => Promise.reject(new Error('boom')),
    });
    const exec = new SpicetifyRemovalExecutor(platform);
    const onProgress = vi.fn<(e: RemovalProgressEvent) => void>();
    const outcome = await exec.remove(likedTarget(), likedRefs(2), neverAborted(), onProgress);
    expect(outcome.removed).toEqual([]);
    expect(outcome.failed).toHaveLength(2);
    // One onProgress for the single (failed) batch.
    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onProgress.mock.calls[0]![0]).toEqual({ removedSoFar: 0, total: 2 });
  });

  it('emits onProgress with the partial removedSoFar after a fallback that removes some', async () => {
    const badUri = 'spotify:track:LIKED00000';
    const platform = makePlatform({
      libraryRemove: (param: { uris: string[] }) => {
        if (param.uris.length > 1) return Promise.reject(new Error('bulk boom'));
        if (param.uris[0] === badUri) return Promise.reject(new Error('single boom'));
        return Promise.resolve();
      },
    });
    const exec = new SpicetifyRemovalExecutor(platform);
    const onProgress = vi.fn<(e: RemovalProgressEvent) => void>();
    await exec.remove(likedTarget(), likedRefs(2), neverAborted(), onProgress);
    // One batch; after fallback exactly one track removed.
    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onProgress.mock.calls[0]![0]).toEqual({ removedSoFar: 1, total: 2 });
  });

  it('omitted onProgress is tolerated (no throw)', async () => {
    const platform = makePlatform();
    const exec = new SpicetifyRemovalExecutor(platform);
    const outcome = await exec.remove(likedTarget(), likedRefs(1), neverAborted());
    expect(outcome.removed).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// globalThis fallback (no-arg constructor, happy path)
// ---------------------------------------------------------------------------

describe('SpicetifyRemovalExecutor — globalThis fallback', () => {
  it('reads Platform from globalThis.Spicetify when constructed with no argument', async () => {
    const platform = makePlatform();
    const prev = (globalThis as Record<string, unknown>)['Spicetify'];
    try {
      (globalThis as Record<string, unknown>)['Spicetify'] = { Platform: platform };
      const exec = new SpicetifyRemovalExecutor(); // no arg → fallback branch
      const tracks = likedRefs(1);
      const outcome = await exec.remove(likedTarget(), tracks, neverAborted());
      expect(outcome.removed).toEqual(tracks);
      expect(platform.LibraryAPI.remove).toHaveBeenCalledTimes(1);
    } finally {
      if (prev === undefined) {
        delete (globalThis as Record<string, unknown>)['Spicetify'];
      } else {
        (globalThis as Record<string, unknown>)['Spicetify'] = prev;
      }
    }
  });
});
