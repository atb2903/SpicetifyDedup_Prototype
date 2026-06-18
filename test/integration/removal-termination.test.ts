/**
 * Integration test — removal-flow termination guarantee (T013 / WP04 / DIRECTIVE_036).
 *
 * Black-box over the **real** `createDetectionStore`, the **real**
 * `InlineCatalogEnricher`, the **real** `createDetectionScanner` composition
 * adapter, and the **real** `detect` algorithm — only the host seams
 * (`TracksEnumerator`, `RemovalExecutor`, `Scheduler`) are doubled. Nothing
 * reaches into private store state; the store is driven through its public API.
 *
 * It asserts both halves of the contract in `contracts/removal-termination.md`:
 *
 *   1. **Happy path (Defect B / WP05 proof).** A playlist duplicate group whose
 *      members carry a host `uid` flows through the real enricher and detector
 *      so the `loaded` result's members retain their `uid`. Removal then runs to
 *      a clean **success** (`none`): `computeRemoveSet` does NOT throw, the
 *      executor records a `remove` call whose `TrackRef` carries the `uid`, and
 *      the duplicate count drops by one. This regression-guards the enricher fix
 *      — it would fail against the pre-WP05 enricher (which dropped `uid`,
 *      making `computeRemoveSet` throw `playlist-member-missing-uid`).
 *
 *   2. **Never-settling-host path (FR-009 / FR-010 — honest limit).** The same
 *      real pipeline wired to a genuinely never-settling executor (`hang`, which
 *      does NOT resolve on abort) + a deterministic fake scheduler. Advancing
 *      past `STALL_CEILING_MS` trips the watchdog and aborts the controller, but
 *      because the abort is only observable at a batch boundary it **cannot**
 *      interrupt the in-flight host await: the row **stays in `removing`**. This
 *      is the truthful production behaviour — the watchdog is NOT a termination
 *      guarantee for an in-flight hang. The documented escape is a route-reset
 *      (`reset()`), which discards the row. (This test fails against the old
 *      abort-aware `hang` fake, which falsely resolved a partial on abort.)
 *
 * Architecture: imports from `src/store/`, `src/adapters/`, `src/ports/`, and
 * `src/domain/` only — within the allowed test import graph.
 */
import { describe, it, expect } from 'vitest';
import { createDetectionStore } from '../../src/store/detection-store';
import { STALL_CEILING_MS } from '../../src/store/detection-store';
import { createDetectionScanner } from '../../src/adapters/detection-scanner';
import { InlineCatalogEnricher } from '../../src/adapters/inline-catalog-enricher';
import { FakeRemovalExecutor } from '../../src/adapters/fake-removal-executor';
import type { TracksEnumerator } from '../../src/ports/tracks-enumerator';
import type { Scheduler, TimerHandle } from '../../src/ports/scheduler';
import type {
  RawTrack,
  ScanRequest,
  ProgressEvent,
  EnumerationResult,
} from '../../src/domain/detection-types';

// ── Host-seam doubles ───────────────────────────────────────────────────────

/** The host `uid` shape mirrored from the live repro (`diagnosis-evidence.md`). */
const KEPT_UID = '610a666b423c78e4';
const DUP_UID = '7f1b2c3d4e5f6a7b';

/** A playlist URI used as both the scan request target and the collection key. */
const PLAYLIST_URI = 'spotify:playlist:repro2song';

/**
 * Build a `RawTrack` for a playlist occurrence. Two occurrences sharing the
 * same `uri` form a `same-canonical-uri` duplicate group once enriched; each
 * carries a distinct `uid` so removal can address the later copy specifically.
 */
function rawPlaylistTrack(uri: string, uid: string, position: number): RawTrack {
  return {
    uri,
    id: uri.split(':')[2]!,
    name: 'Repro Song',
    artists: [{ uri: 'spotify:artist:a0', name: 'Repro Artist' }],
    album: { uri: 'spotify:album:al0', name: 'Repro Album' },
    position,
    durationMs: 210_000,
    uid,
  };
}

/**
 * A `TracksEnumerator` double that returns a fixed `RawTrack[]` and emits a
 * single terminal `enumerating` progress event. No host, no timers.
 */
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
 * A deterministic `Scheduler` double (mirrors the WP03 store-test pattern).
 * Timers are queued and only fire when `advance(ms)` elapses their delay.
 */
function makeFakeScheduler(): Scheduler & { advance: (ms: number) => void } {
  type Entry = { id: number; remaining: number; fn: () => void };
  let nextId = 1;
  let entries: Entry[] = [];
  return {
    setTimeout(fn: () => void, ms: number): TimerHandle {
      const id = nextId++;
      entries.push({ id, remaining: ms, fn });
      return id as unknown as TimerHandle;
    },
    clearTimeout(handle: TimerHandle): void {
      const id = handle as unknown as number;
      entries = entries.filter((e) => e.id !== id);
    },
    advance(ms: number): void {
      const due: Entry[] = [];
      for (const e of entries) {
        e.remaining -= ms;
        if (e.remaining <= 0) due.push(e);
      }
      entries = entries.filter((e) => e.remaining > 0);
      for (const e of due) e.fn();
    },
  };
}

/** Flush pending micro/macro-tasks so async chains settle. */
function flush(): Promise<void> {
  return new Promise<void>((res) => setTimeout(res, 0));
}

/**
 * Build a real store whose scanner = fake enumerator (two-occurrence playlist
 * group with `uid`s) + real `InlineCatalogEnricher` + real `detect`. Returns
 * the store, the executor (for call assertions), and the scheduler.
 */
async function seedRealLoadedPlaylist(
  executor: FakeRemovalExecutor,
  scheduler: Scheduler,
): Promise<ReturnType<typeof createDetectionStore>> {
  const tracks = [
    rawPlaylistTrack('spotify:track:dup', KEPT_UID, 0),
    rawPlaylistTrack('spotify:track:dup', DUP_UID, 1),
  ];
  const scanner = createDetectionScanner(
    fakeEnumerator(tracks),
    new InlineCatalogEnricher(),
  );
  const store = createDetectionStore(scanner, executor, scheduler);
  await store.getState().scanCollection(PLAYLIST_URI, {
    kind: 'playlist',
    playlistUri: PLAYLIST_URI,
  });
  return store;
}

/**
 * Build a real store loaded with a playlist duplicate group whose removable
 * (later) copy carries **no** `uid`. `computeRemoveSet` throws
 * `playlist-member-missing-uid` for such a member, so `confirmRemoval` takes the
 * compute-failed branch (no host call). Mirrors `seedRealLoadedPlaylist` but
 * drops the duplicate's `uid`.
 */
async function seedComputeFailingPlaylist(
  executor: FakeRemovalExecutor,
  scheduler: Scheduler,
): Promise<ReturnType<typeof createDetectionStore>> {
  const dupNoUid: RawTrack = {
    uri: 'spotify:track:dup',
    id: 'dup',
    name: 'Repro Song',
    artists: [{ uri: 'spotify:artist:a0', name: 'Repro Artist' }],
    album: { uri: 'spotify:album:al0', name: 'Repro Album' },
    position: 1,
    durationMs: 210_000,
    // uid deliberately omitted → computeRemoveSet throws on this member.
  };
  const tracks = [rawPlaylistTrack('spotify:track:dup', KEPT_UID, 0), dupNoUid];
  const scanner = createDetectionScanner(
    fakeEnumerator(tracks),
    new InlineCatalogEnricher(),
  );
  const store = createDetectionStore(scanner, executor, scheduler);
  await store.getState().scanCollection(PLAYLIST_URI, {
    kind: 'playlist',
    playlistUri: PLAYLIST_URI,
  });
  return store;
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('removal termination — happy path (Defect B / WP05 regression guard)', () => {
  it('a uid-carrying playlist duplicate is actually removed → success (none)', async () => {
    const executor = new FakeRemovalExecutor({ kind: 'ok' });
    const scheduler = makeFakeScheduler();
    const store = await seedRealLoadedPlaylist(executor, scheduler);

    // Sanity: the real enricher + detector produced a removable playlist group.
    const before = store.getState().rows[PLAYLIST_URI];
    if (before?.kind !== 'loaded') throw new Error('expected loaded');
    expect(before.result.removableTrackCount).toBe(1);
    expect(before.result.duplicateTrackCount).toBe(2);

    store.getState().requestRemoval(PLAYLIST_URI);
    // 1 removable (≤ 25) → single confirm executes immediately.
    await store.getState().confirmRemoval(PLAYLIST_URI);
    await flush();

    // The request reached the executor seam with the occurrence uid — proving
    // computeRemoveSet did NOT throw (the WP05 fix).
    expect(executor.calls.length).toBe(1);
    const call = executor.calls[0]!;
    expect(call.target).toEqual({ kind: 'playlist', playlistUri: PLAYLIST_URI });
    expect(call.tracks.length).toBe(1);
    expect(call.tracks[0]!.uri).toBe('spotify:track:dup');
    // The TrackRef carries the *removable* (later) copy's uid, not the kept one.
    expect(call.tracks[0]!.uid).toBe(DUP_UID);

    // Terminal success: phase none, the removable (duplicate) count dropped by
    // one (1 → 0), and the now-singleton group is gone (a single surviving copy
    // is no longer a duplicate, so the whole group is dropped).
    const after = store.getState().rows[PLAYLIST_URI];
    if (after?.kind !== 'loaded') throw new Error('expected loaded');
    expect(after.removal.phase).toBe('none');
    expect(after.result.removableTrackCount).toBe(
      before.result.removableTrackCount - 1,
    );
    expect(after.result.removableTrackCount).toBe(0);
    expect(after.result.duplicateTrackCount).toBe(0);
    expect(after.result.groups).toEqual([]);
  });
});

describe('removal termination — compute-failed path (T011 routing guard)', () => {
  it('a compute failure terminates to partial carrying the truthful zero-track outcome, never none', async () => {
    const executor = new FakeRemovalExecutor({ kind: 'ok' });
    const scheduler = makeFakeScheduler();
    const store = await seedComputeFailingPlaylist(executor, scheduler);

    const before = store.getState().rows[PLAYLIST_URI];
    if (before?.kind !== 'loaded') throw new Error('expected loaded');
    expect(before.result.removableTrackCount).toBe(1);

    store.getState().requestRemoval(PLAYLIST_URI);
    // 1 removable (≤ 25) → single confirm; computeRemoveSet throws before any
    // host call, so the executor is never reached.
    await store.getState().confirmRemoval(PLAYLIST_URI);
    await flush();

    expect(executor.calls.length).toBe(0);

    const after = store.getState().rows[PLAYLIST_URI];
    if (after?.kind !== 'loaded') throw new Error('expected loaded');
    // T011: compute-failed must reach `partial`, NOT a false `none`.
    expect(after.removal.phase).toBe('partial');
    expect(after.removal.phase).not.toBe('none');
    // Counts unchanged — nothing was removed (result passed through verbatim).
    expect(after.result.removableTrackCount).toBe(before.result.removableTrackCount);
    expect(after.result.duplicateTrackCount).toBe(before.result.duplicateTrackCount);
    // The outcome is truthful: compute-failed, both partitions empty.
    if (after.removal.phase !== 'partial') throw new Error('expected partial');
    expect(after.removal.outcome.provenance).toBe('compute-failed');
    expect(after.removal.outcome.removed.length).toBe(0);
    expect(after.removal.outcome.failed.length).toBe(0);
  });
});

describe('removal termination — never-settling host path (FR-009 / FR-010 honest limit)', () => {
  it('a genuinely never-settling host call leaves the row stuck in `removing`; the watchdog does NOT terminate it', async () => {
    const executor = new FakeRemovalExecutor({ kind: 'hang' });
    const scheduler = makeFakeScheduler();
    const store = await seedRealLoadedPlaylist(executor, scheduler);

    const before = store.getState().rows[PLAYLIST_URI];
    if (before?.kind !== 'loaded') throw new Error('expected loaded');
    expect(before.result.removableTrackCount).toBe(1);

    store.getState().requestRemoval(PLAYLIST_URI);
    // Do NOT await — the host call never settles, so confirmRemoval's promise
    // never resolves. Hold the reference only to acknowledge the pending work.
    const settle = store.getState().confirmRemoval(PLAYLIST_URI);
    void settle;

    // The hung executor leaves the row in `removing`; the seam was reached.
    const mid = store.getState().rows[PLAYLIST_URI];
    if (mid?.kind !== 'loaded') throw new Error('expected loaded');
    expect(mid.removal.phase).toBe('removing');
    expect(executor.calls.length).toBe(1);

    // Advance past the ceiling → the watchdog trips → controller.abort(). But
    // the abort is only observable at a batch boundary, so it cannot interrupt
    // the in-flight host await: the row STAYS in `removing`. (This is exactly
    // the assertion the old abort-aware `hang` fake would fail — it falsely
    // resolved a partial here, moving the row to `partial`.)
    scheduler.advance(STALL_CEILING_MS);
    await flush();

    const stuck = store.getState().rows[PLAYLIST_URI];
    if (stuck?.kind !== 'loaded') throw new Error('expected loaded');
    expect(stuck.removal.phase).toBe('removing');
    // Counts unchanged — nothing was removed, and no false terminal outcome.
    expect(stuck.result.removableTrackCount).toBe(before.result.removableTrackCount);
    expect(stuck.result.duplicateTrackCount).toBe(before.result.duplicateTrackCount);

    // The documented escape: a route-reset discards the row entirely (FR-012 /
    // ADR-0019). It aborts the controller (no effect on the hung call) and
    // clears `rows`, so the stuck `removing` row is gone.
    store.getState().reset();
    await flush();
    expect(store.getState().rows[PLAYLIST_URI]).toBeUndefined();
    expect(store.getState().rows).toEqual({});
  });
});
