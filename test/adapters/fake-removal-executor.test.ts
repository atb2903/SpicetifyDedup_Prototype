/**
 * Unit tests for `FakeRemovalExecutor`.
 *
 * Proves the scripted test double honors the `RemovalExecutor` port contract
 * so downstream WPs (store/UI) can trust it:
 * - every script kind (`ok` / `partial` / `partial-uids` / `throw`),
 * - the call recorder (copied `tracks`, ordered, both targets),
 * - pre-aborted signal semantics (rejects with AbortError; call NOT recorded),
 * - `onProgress` terminal event + absent-callback no-op,
 * - the default-script and per-call script-queue models (queue falls back to `ok`),
 * - the total-accounting + disjointness invariant.
 */
import { describe, it, expect, vi } from 'vitest';
import { FakeRemovalExecutor } from '../../src/adapters/fake-removal-executor';
import type { RemovalTarget, TrackRef } from '../../src/domain/removal-types';
import { RemovalError, isRemovalError } from '../../src/domain/removal-errors';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LIKED: RemovalTarget = { kind: 'liked-songs' };
const PLAYLIST: RemovalTarget = { kind: 'playlist', playlistUri: 'spotify:playlist:P1' };

function likedTrack(i: number): TrackRef {
  return { uri: `spotify:track:T${i}` };
}

function playlistTrack(i: number): TrackRef {
  return { uri: `spotify:track:T${i}`, uid: `uid${i}` };
}

function neverAborted(): AbortSignal {
  return new AbortController().signal;
}

function abortedSignal(): AbortSignal {
  const c = new AbortController();
  c.abort();
  return c.signal;
}

/** Assert the port total-accounting + disjointness invariant on an outcome. */
function assertInvariant(
  outcome: { removed: ReadonlyArray<TrackRef>; failed: ReadonlyArray<{ track: TrackRef }> },
  requested: ReadonlyArray<TrackRef>,
  key: (t: TrackRef) => string,
): void {
  expect(outcome.removed.length + outcome.failed.length).toBe(requested.length);
  const removedKeys = new Set(outcome.removed.map(key));
  const failedKeys = new Set(outcome.failed.map((f) => key(f.track)));
  for (const k of removedKeys) {
    expect(failedKeys.has(k)).toBe(false);
  }
}

const byUri = (t: TrackRef): string => t.uri;
const byUid = (t: TrackRef): string => t.uid ?? '';

// ---------------------------------------------------------------------------
// ok script (default)
// ---------------------------------------------------------------------------

describe('FakeRemovalExecutor — ok script', () => {
  it('removes all requested tracks, failed is empty', async () => {
    const tracks = [likedTrack(0), likedTrack(1), likedTrack(2)];
    const exec = new FakeRemovalExecutor({ kind: 'ok' });
    const outcome = await exec.remove(LIKED, tracks, neverAborted());
    expect(outcome.removed).toEqual(tracks);
    expect(outcome.failed).toEqual([]);
    assertInvariant(outcome, tracks, byUri);
  });

  it('defaults to ok when constructed with no script', async () => {
    const tracks = [likedTrack(0)];
    const exec = new FakeRemovalExecutor();
    const outcome = await exec.remove(LIKED, tracks, neverAborted());
    expect(outcome.removed).toEqual(tracks);
    expect(outcome.failed).toEqual([]);
  });

  it('handles an empty tracks array', async () => {
    const exec = new FakeRemovalExecutor({ kind: 'ok' });
    const outcome = await exec.remove(LIKED, [], neverAborted());
    expect(outcome.removed).toEqual([]);
    expect(outcome.failed).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// partial script (by uri)
// ---------------------------------------------------------------------------

describe('FakeRemovalExecutor — partial script (by uri)', () => {
  it('fails the listed uris with a reason, removes the rest', async () => {
    const tracks = [likedTrack(0), likedTrack(1), likedTrack(2)];
    const exec = new FakeRemovalExecutor({
      kind: 'partial',
      failUris: ['spotify:track:T1'],
    });
    const outcome = await exec.remove(LIKED, tracks, neverAborted());
    expect(outcome.removed).toEqual([likedTrack(0), likedTrack(2)]);
    expect(outcome.failed).toEqual([{ track: likedTrack(1), reason: 'fake-fail' }]);
    assertInvariant(outcome, tracks, byUri);
  });
});

// ---------------------------------------------------------------------------
// partial-uids script (playlist)
// ---------------------------------------------------------------------------

describe('FakeRemovalExecutor — partial-uids script (playlist)', () => {
  it('partitions by uid', async () => {
    const tracks = [playlistTrack(0), playlistTrack(1), playlistTrack(2)];
    const exec = new FakeRemovalExecutor({
      kind: 'partial-uids',
      failUids: ['uid2'],
    });
    const outcome = await exec.remove(PLAYLIST, tracks, neverAborted());
    expect(outcome.removed).toEqual([playlistTrack(0), playlistTrack(1)]);
    expect(outcome.failed).toEqual([{ track: playlistTrack(2), reason: 'fake-fail' }]);
    assertInvariant(outcome, tracks, byUid);
  });

  it('treats a track with no uid as not matching any failUid', async () => {
    const tracks = [likedTrack(0)]; // no uid
    const exec = new FakeRemovalExecutor({ kind: 'partial-uids', failUids: ['uid0'] });
    const outcome = await exec.remove(PLAYLIST, tracks, neverAborted());
    expect(outcome.removed).toEqual([likedTrack(0)]);
    expect(outcome.failed).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// throw script
// ---------------------------------------------------------------------------

describe('FakeRemovalExecutor — throw script', () => {
  it('rejects with the injected RemovalError (identity + classifier)', async () => {
    const injected = new RemovalError('host-unavailable', 'no host');
    const exec = new FakeRemovalExecutor({ kind: 'throw', error: injected });
    await expect(exec.remove(LIKED, [likedTrack(0)], neverAborted())).rejects.toBe(injected);
    await exec
      .remove(LIKED, [likedTrack(0)], neverAborted())
      .catch((e: unknown) => expect(isRemovalError(e)).toBe(true));
  });

  it('rejects with an arbitrary injected value', async () => {
    const exec = new FakeRemovalExecutor({ kind: 'throw', error: 'boom' });
    await expect(exec.remove(LIKED, [likedTrack(0)], neverAborted())).rejects.toBe('boom');
  });

  it('records the call before rejecting', async () => {
    const exec = new FakeRemovalExecutor({ kind: 'throw', error: 'boom' });
    await exec.remove(LIKED, [likedTrack(0)], neverAborted()).catch(() => undefined);
    expect(exec.calls).toHaveLength(1);
    expect(exec.calls[0]?.target).toEqual(LIKED);
  });
});

// ---------------------------------------------------------------------------
// hang script
// ---------------------------------------------------------------------------

/** Sentinel resolved on the next microtask, raced against the hang promise. */
const SETTLED = Symbol('settled');

describe('FakeRemovalExecutor — hang script (genuinely never-settling, FR-010)', () => {
  it('records the call with a snapshot copy of tracks before hanging', async () => {
    const exec = new FakeRemovalExecutor({ kind: 'hang' });
    const tracks = [likedTrack(0), likedTrack(1)];
    // Do NOT await — the call never settles.
    void exec.remove(LIKED, tracks, neverAborted());
    // The call is recorded synchronously, before the never-settling promise.
    expect(exec.calls).toHaveLength(1);
    expect(exec.calls[0]?.target).toEqual(LIKED);
    expect(exec.calls[0]?.tracks).toEqual([likedTrack(0), likedTrack(1)]);
    // Snapshot: mutating the caller array afterwards does not change the record.
    tracks.push(likedTrack(2));
    tracks[0] = likedTrack(99);
    expect(exec.calls[0]?.tracks).toEqual([likedTrack(0), likedTrack(1)]);
  });

  it('returns a promise that never settles (loses the race to an immediate sentinel)', async () => {
    const exec = new FakeRemovalExecutor({ kind: 'hang' });
    const hanging = exec.remove(LIKED, [likedTrack(0)], neverAborted());
    const winner = await Promise.race([hanging, Promise.resolve(SETTLED)]);
    expect(winner).toBe(SETTLED);
  });

  it('does not invoke onProgress', async () => {
    const exec = new FakeRemovalExecutor({ kind: 'hang' });
    const onProgress = vi.fn();
    void exec.remove(LIKED, [likedTrack(0)], neverAborted(), onProgress);
    await Promise.resolve();
    expect(onProgress).not.toHaveBeenCalled();
  });

  it('a pre-aborted signal still throws AbortError before recording, even under hang', async () => {
    const exec = new FakeRemovalExecutor({ kind: 'hang' });
    await expect(exec.remove(LIKED, [likedTrack(0)], abortedSignal())).rejects.toSatisfy(
      (e: unknown) => e instanceof DOMException && e.name === 'AbortError',
    );
    expect(exec.calls).toHaveLength(0);
  });

  it('does NOT settle even after the signal aborts mid-flight (FR-010 — abort does not interrupt an in-flight await)', async () => {
    const exec = new FakeRemovalExecutor({ kind: 'hang' });
    const tracks = [likedTrack(0), likedTrack(1)];
    const controller = new AbortController();
    const pending = exec.remove(LIKED, tracks, controller.signal);
    expect(exec.calls).toHaveLength(1);
    // Aborting the signal does NOT make the hung call settle — it models a host
    // call hanging inside a batch, beyond the reach of the boundary abort.
    controller.abort();
    const winner = await Promise.race([pending, Promise.resolve(SETTLED)]);
    expect(winner).toBe(SETTLED);
  });
});

// ---------------------------------------------------------------------------
// stall-resolve script (cooperative boundary-abort)
// ---------------------------------------------------------------------------

describe('FakeRemovalExecutor — stall-resolve script (cooperative boundary-abort, FR-003)', () => {
  it('records the call but does not settle until the signal aborts', async () => {
    const exec = new FakeRemovalExecutor({ kind: 'stall-resolve' });
    const tracks = [likedTrack(0), likedTrack(1)];
    const controller = new AbortController();
    const pending = exec.remove(LIKED, tracks, controller.signal);
    expect(exec.calls).toHaveLength(1);
    expect(exec.calls[0]?.target).toEqual(LIKED);
    const stillPending = await Promise.race([pending, Promise.resolve(SETTLED)]);
    expect(stillPending).toBe(SETTLED);
  });

  it('resolves with an all-failed host partial once the signal aborts (FR-003)', async () => {
    const exec = new FakeRemovalExecutor({ kind: 'stall-resolve' });
    const tracks = [likedTrack(0), likedTrack(1)];
    const controller = new AbortController();
    const pending = exec.remove(LIKED, tracks, controller.signal);
    controller.abort();
    const outcome = await pending;
    expect(outcome.removed).toEqual([]);
    expect(outcome.failed.map((f) => f.track)).toEqual(tracks);
    expect(outcome.provenance).toBe('host');
    assertInvariant(outcome, tracks, byUri);
  });

  it('does not invoke onProgress', async () => {
    const exec = new FakeRemovalExecutor({ kind: 'stall-resolve' });
    const onProgress = vi.fn();
    const controller = new AbortController();
    void exec.remove(LIKED, [likedTrack(0)], controller.signal, onProgress);
    await Promise.resolve();
    expect(onProgress).not.toHaveBeenCalled();
    controller.abort();
  });

  it('a pre-aborted signal throws AbortError before recording, even under stall-resolve', async () => {
    const exec = new FakeRemovalExecutor({ kind: 'stall-resolve' });
    await expect(exec.remove(LIKED, [likedTrack(0)], abortedSignal())).rejects.toSatisfy(
      (e: unknown) => e instanceof DOMException && e.name === 'AbortError',
    );
    expect(exec.calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Pre-aborted signal
// ---------------------------------------------------------------------------

describe('FakeRemovalExecutor — pre-aborted signal', () => {
  it('rejects with an AbortError and does NOT record the call', async () => {
    const exec = new FakeRemovalExecutor({ kind: 'ok' });
    await expect(exec.remove(LIKED, [likedTrack(0)], abortedSignal())).rejects.toSatisfy(
      (e: unknown) => e instanceof DOMException && e.name === 'AbortError',
    );
    expect(exec.calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Call recorder
// ---------------------------------------------------------------------------

describe('FakeRemovalExecutor — call recorder', () => {
  it('records both calls in order with their targets', async () => {
    const exec = new FakeRemovalExecutor({ kind: 'ok' });
    await exec.remove(LIKED, [likedTrack(0)], neverAborted());
    await exec.remove(PLAYLIST, [playlistTrack(1)], neverAborted());
    expect(exec.calls).toHaveLength(2);
    expect(exec.calls[0]?.target).toEqual(LIKED);
    expect(exec.calls[1]?.target).toEqual(PLAYLIST);
  });

  it('copies the tracks array: mutating the caller array afterwards does not change calls', async () => {
    const exec = new FakeRemovalExecutor({ kind: 'ok' });
    const tracks = [likedTrack(0), likedTrack(1)];
    await exec.remove(LIKED, tracks, neverAborted());
    tracks.push(likedTrack(2));
    tracks[0] = likedTrack(99);
    expect(exec.calls[0]?.tracks).toEqual([likedTrack(0), likedTrack(1)]);
  });
});

// ---------------------------------------------------------------------------
// onProgress
// ---------------------------------------------------------------------------

describe('FakeRemovalExecutor — onProgress', () => {
  it('emits a terminal { removedSoFar, total } event when provided', async () => {
    const tracks = [likedTrack(0), likedTrack(1), likedTrack(2)];
    const exec = new FakeRemovalExecutor({ kind: 'partial', failUris: ['spotify:track:T1'] });
    const onProgress = vi.fn();
    await exec.remove(LIKED, tracks, neverAborted(), onProgress);
    expect(onProgress).toHaveBeenCalledWith({ removedSoFar: 2, total: 3 });
  });

  it('is a no-op when the callback is absent (does not throw)', async () => {
    const exec = new FakeRemovalExecutor({ kind: 'ok' });
    const outcome = await exec.remove(LIKED, [likedTrack(0)], neverAborted());
    expect(outcome.removed).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Script queue
// ---------------------------------------------------------------------------

describe('FakeRemovalExecutor — script queue', () => {
  it('consumes consecutive scripts per call', async () => {
    const exec = new FakeRemovalExecutor(undefined, [
      { kind: 'partial', failUris: ['spotify:track:T0'] },
      { kind: 'ok' },
    ]);
    const first = await exec.remove(LIKED, [likedTrack(0)], neverAborted());
    expect(first.failed).toHaveLength(1);
    const second = await exec.remove(LIKED, [likedTrack(1)], neverAborted());
    expect(second.removed).toEqual([likedTrack(1)]);
    expect(second.failed).toEqual([]);
  });

  it('falls back to the default script once the queue is exhausted', async () => {
    const exec = new FakeRemovalExecutor({ kind: 'partial', failUris: ['spotify:track:T9'] }, [
      { kind: 'ok' },
    ]);
    // First call drains the queue (ok).
    const first = await exec.remove(LIKED, [likedTrack(0)], neverAborted());
    expect(first.failed).toEqual([]);
    // Second call falls back to the default script (partial, but T9 not present → all ok).
    const second = await exec.remove(LIKED, [likedTrack(0)], neverAborted());
    expect(second.removed).toEqual([likedTrack(0)]);
  });

  it('falls back to ok when neither a default nor a queue is supplied past entries', async () => {
    const exec = new FakeRemovalExecutor(undefined, [{ kind: 'throw', error: 'x' }]);
    await exec.remove(LIKED, [likedTrack(0)], neverAborted()).catch(() => undefined);
    // Queue exhausted → default ok.
    const outcome = await exec.remove(LIKED, [likedTrack(1)], neverAborted());
    expect(outcome.removed).toEqual([likedTrack(1)]);
    expect(outcome.failed).toEqual([]);
  });
});
