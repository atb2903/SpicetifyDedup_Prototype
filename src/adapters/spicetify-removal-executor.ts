/**
 * Production `RemovalExecutor` adapter.
 *
 * Translates a single `RemovalTarget` + an ordered `TrackRef[]` into batched
 * host deletion calls and aggregates the per-track outcome:
 * - `liked-songs` → `Spicetify.Platform.LibraryAPI.remove({ uris })`
 *   (URIs are unique in the saved set; `uid` is never forwarded).
 * - `playlist`    → `Spicetify.Platform.PlaylistAPI.remove(playlistUri,
 *   [{ uri, uid }])` (each occurrence addressed by its `uid` — ADR-0012).
 *
 * Responsibilities (contract §Behavioral contract, research §4):
 *   1. Host-availability guard — throw `RemovalError('host-unavailable')`
 *      BEFORE any mutation if the needed API/method is absent (fail loud).
 *   2. Empty input short-circuit — `tracks.length === 0` returns an empty
 *      outcome without a host call.
 *   3. Batch the ordered tracks into runs of `BATCH_SIZE` (no re-order, no
 *      dedup — the domain produced them in the correct later-copies order).
 *   4. Check the `AbortSignal` at each batch boundary **and between per-track
 *      fallback retries**; on abort, **resolve with the accumulated host-truthful
 *      partial** (`provenance: 'host'`) rather than throwing `AbortError`
 *      (FR-003 / FR-005 / ADR-0019). The store decides whether an aborted partial
 *      means *stall* (apply, re-stamp) or *cancel* (discard). RISK-1 (accepted,
 *      C-001): the one single-track host await already in flight when the signal
 *      trips is not interruptible — abort-responsiveness is *between* retries only.
 *   5. Per-batch partial failure with per-track fallback (live-verify
 *      2026-06-12): a fulfilled batch's tracks go to `removed`; a *rejected*
 *      batch is NOT marked wholesale failed — instead each track is retried with
 *      its own single-track host call (resolves → `removed`, rejects → `failed`
 *      with the rejection message). The fallback checks the abort signal before
 *      each retry and stops issuing further single-track deletions once aborted
 *      (FR-005) — it does NOT always run to the end of the batch. The remaining
 *      batches are still attempted. `onProgress` fires once for a fulfilled batch
 *      and once per per-track retry for a fallback batch (FR-006), so a long
 *      fallback re-arms the store's stall watchdog instead of looking stalled;
 *      `removedSoFar` is monotonic non-decreasing and `<= total`.
 *   6. Return `{ removed, failed, provenance: 'host' }` with
 *      `removed.length + failed.length === tracks.length` (full run) or
 *      `<= tracks.length` (boundary-abort partial).
 *
 * Architecture (ADR-0001 / test/architecture.test.ts): imports `src/ports/` +
 * `src/domain/` only — never store or UI. Platform-only; NO public Web API
 * path (C-005 / ADR-0011). The runtime guard remains authoritative over the
 * ambient typings if the live host shape drifts.
 */
import type { RemovalExecutor } from '../ports/removal-executor';
import type {
  RemovalTarget,
  TrackRef,
  RemovalOutcome,
  RemovalProgressEvent,
} from '../domain/removal-types';
import { RemovalError } from '../domain/removal-errors';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Number of tracks per host `remove` call.
 *
 * Batching is the only mechanism to attribute success/failure at finer than
 * whole-call granularity, since both host `remove` calls return
 * `Promise<void>` with no per-track result (research §4). It also bounds the
 * blast radius of a transient error and gives natural progress checkpoints.
 *
 * FINALIZED at 100 after live-client verification (Spotify desktop 1.2.90.451,
 * Spicetify 2.43.2, 2026-06-12). Rationale: 100 maximizes happy-path throughput
 * (few host round-trips) while the per-track fallback (below) covers the atomic
 * reject-whole behavior the live trace revealed.
 *
 * Live atomicity finding: `PlaylistAPI.remove(playlistUri, [...])` is **atomic
 * reject-whole** — a single stale `uid` rejects the entire call with
 * `"Given row id does not exist!"` and removes NOTHING. `LibraryAPI.remove` is
 * tolerant: removing an already-absent URI is a **no-op (resolves)**. So a
 * rejected bulk batch is NOT attributed wholesale to `failed`; instead each
 * track is retried individually (see {@link SpicetifyRemovalExecutor.remove}).
 * Per-track retries are safe because the atomic reject removed nothing, so they
 * cannot double-remove.
 */
export const BATCH_SIZE = 100;

// ---------------------------------------------------------------------------
// Platform shape (injected via constructor for testability)
// ---------------------------------------------------------------------------

/**
 * Minimum platform surface needed by `SpicetifyRemovalExecutor`.
 *
 * Injected at construction so tests can stub it without touching
 * `globalThis.Spicetify`. Mirrors `TracksEnumeratorPlatform`'s shape.
 */
export interface RemovalExecutorPlatform {
  LibraryAPI: { remove(param: { uris: string[] }): Promise<void> };
  PlaylistAPI: {
    remove(playlistUri: string, tracks: { uri: string; uid: string }[]): Promise<void>;
  };
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

/**
 * Production implementation of `RemovalExecutor`.
 *
 * Uses the injected `platform` (or lazily reads `globalThis.Spicetify.Platform`
 * in production) to delete tracks in batches and aggregate the outcome.
 */
export class SpicetifyRemovalExecutor implements RemovalExecutor {
  private readonly _platform: RemovalExecutorPlatform | undefined;

  /**
   * Lazy accessor: returns the injected platform, else reads from
   * `globalThis.Spicetify.Platform`. May be `undefined` if the host is not
   * present yet — callers MUST go through {@link requirePlatform}.
   */
  private get platform(): RemovalExecutorPlatform | undefined {
    if (this._platform !== undefined) return this._platform;
    return (
      globalThis as unknown as { Spicetify?: { Platform?: RemovalExecutorPlatform } }
    ).Spicetify?.Platform;
  }

  /**
   * @param platform - Spicetify Platform subset. In production, omit to read
   *   lazily from `globalThis.Spicetify.Platform` (no access at construction).
   *   In tests, pass a stub.
   */
  constructor(platform?: RemovalExecutorPlatform) {
    this._platform = platform;
  }

  /**
   * Delete `tracks` from the single `target` collection in ordered batches.
   *
   * @param target - The single collection to delete from (C-003).
   * @param tracks - Ordered occurrences to delete (not re-ordered/deduped).
   * @param signal - Checked at each batch boundary (before starting a batch)
   *   AND before each per-track fallback retry; if aborted, the loop stops and
   *   the call **resolves with the accumulated partial** (`provenance: 'host'`)
   *   rather than throwing — every track removed before the abort is reported
   *   truthfully (FR-003 / FR-005). A mid-fallback abort stops further single-
   *   track deletions promptly; the one single-track host await already in flight
   *   is allowed to complete (RISK-1, C-001 — not interruptible).
   * @param onProgress - Optional; invoked once for a fulfilled batch and once per
   *   per-track retry for a fallback batch (FR-006), with the cumulative
   *   `removedSoFar` (monotonic, `<= total`) and the `total` requested (NFR-002).
   *   Fires per retry even when a retry fails (count unchanged) so the store's
   *   stall watchdog re-arms on genuine fallback activity.
   * @returns Promise resolving with the aggregate {@link RemovalOutcome}
   *   (`provenance: 'host'`; `removed.length + failed.length === tracks.length`
   *   for a full run, or `<= tracks.length` for a boundary-abort partial).
   * @throws RemovalError('host-unavailable') if the needed host API/method is
   *   absent — thrown before any mutation.
   */
  async remove(
    target: RemovalTarget,
    tracks: ReadonlyArray<TrackRef>,
    signal: AbortSignal,
    onProgress?: (event: RemovalProgressEvent) => void,
  ): Promise<RemovalOutcome> {
    // 1. Host-availability guard — before any mutation.
    const platform = this.requirePlatform(target);

    // 2. Nothing to do.
    if (tracks.length === 0) {
      return { removed: [], failed: [], provenance: 'host' };
    }

    // 3. Ordered batches of BATCH_SIZE (no re-order, no dedup).
    const batches = this.batch(tracks);

    const removed: TrackRef[] = [];
    const failed: { track: TrackRef; reason: string }[] = [];
    const total = tracks.length;

    for (const batch of batches) {
      // 4. Abort check at each batch boundary: stop and return the accumulated
      // host-truthful partial (FR-003 / ADR-0019) — the store reads what was
      // actually removed instead of discarding it. No un-attempted track is
      // invented into `failed`.
      if (signal.aborted) {
        return { removed, failed, provenance: 'host' };
      }

      // Validate the batch shape (e.g. playlist uid presence) BEFORE the host
      // call. A malformed batch is a whole-operation fault (fail loud) — it
      // propagates rather than being attributed to per-track `failed`.
      const occurrences = this.prepareBatch(target, batch);

      try {
        await this.dispatchBatch(target, occurrences, platform);
        // 5a. Fulfilled — all batch tracks removed. Report progress once for the
        // fulfilled batch (the fallback path below emits per-track instead).
        removed.push(...batch);
        onProgress?.({ removedSoFar: removed.length, total });
      } catch {
        // 5b. Bulk batch rejected. The host (PlaylistAPI) is atomic
        // reject-whole, so NOTHING was removed (live-verified 2026-06-12).
        // Retry each track individually: a single-track call that resolves
        // removes that one track; one that rejects fails only that track. This
        // cannot double-remove because the atomic reject removed nothing.
        for (const track of batch) {
          // 5b-i. Abort check BETWEEN per-track retries (FR-005). A long fallback
          // for a rejected batch must not keep issuing single-track host
          // deletions after the user cancels — on abort, stop and return the
          // accumulated host-truthful partial (consistent with the batch-boundary
          // abort above). RISK-1 (accepted, C-001): the ONE single-track host
          // await already in flight cannot be interrupted, so responsiveness is
          // between retries only; no in-flight termination is engineered here.
          if (signal.aborted) {
            return { removed, failed, provenance: 'host' };
          }

          const single = this.prepareBatch(target, [track]);
          try {
            await this.dispatchBatch(target, single, platform);
            removed.push(track);
          } catch (cause) {
            const reason = cause instanceof Error ? cause.message : String(cause);
            failed.push({ track, reason });
          }

          // 5b-ii. Per-track progress (FR-006). Emit after each single-track
          // retry so the store's stall watchdog re-arms on genuine fallback
          // activity instead of treating a long fallback as a stall. Reuses the
          // existing { removedSoFar, total } shape (decision D-4 — no new event
          // variant); `removedSoFar` is monotonic non-decreasing and <= total.
          onProgress?.({ removedSoFar: removed.length, total });
        }
      }
    }

    // 6. Aggregate outcome (every requested track accounted for exactly once).
    return { removed, failed, provenance: 'host' };
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Resolve the platform and assert the API/method needed for `target.kind`
   * exists. Fails loud with `RemovalError('host-unavailable')` rather than
   * letting a missing method surface as an opaque runtime `TypeError`.
   */
  private requirePlatform(target: RemovalTarget): RemovalExecutorPlatform {
    const platform = this.platform;
    if (platform === undefined) {
      throw new RemovalError(
        'host-unavailable',
        'Spicetify.Platform is not available',
      );
    }
    if (target.kind === 'liked-songs') {
      if (typeof platform.LibraryAPI?.remove !== 'function') {
        throw new RemovalError(
          'host-unavailable',
          'Spicetify.Platform.LibraryAPI.remove is not available',
        );
      }
    } else {
      if (typeof platform.PlaylistAPI?.remove !== 'function') {
        throw new RemovalError(
          'host-unavailable',
          'Spicetify.Platform.PlaylistAPI.remove is not available',
        );
      }
    }
    return platform;
  }

  /** Split `tracks` into ordered runs of at most `BATCH_SIZE` (no dedup). */
  private batch(tracks: ReadonlyArray<TrackRef>): TrackRef[][] {
    const batches: TrackRef[][] = [];
    for (let i = 0; i < tracks.length; i += BATCH_SIZE) {
      batches.push(tracks.slice(i, i + BATCH_SIZE));
    }
    return batches;
  }

  /**
   * Validate a batch and project it into the host-call payload, BEFORE any
   * mutation. For playlists this enforces the `uid` requirement (fail loud on
   * a missing/empty `uid` rather than passing `undefined`); for Liked Songs it
   * projects to the URI list. A thrown `RemovalError` here is a whole-operation
   * fault that propagates out of `remove`.
   */
  private prepareBatch(
    target: RemovalTarget,
    batch: ReadonlyArray<TrackRef>,
  ): { uris: string[] } | { uri: string; uid: string }[] {
    if (target.kind === 'liked-songs') {
      // `uid` is intentionally NOT forwarded for Liked Songs.
      return { uris: batch.map((t) => t.uri) };
    }
    return batch.map((t) => {
      if (typeof t.uid !== 'string' || t.uid.length === 0) {
        throw new RemovalError(
          'malformed-result',
          'playlist TrackRef is missing a uid',
          { context: { uri: t.uri } },
        );
      }
      return { uri: t.uri, uid: t.uid };
    });
  }

  /** Dispatch one prepared batch to the correct host API by `target.kind`. */
  private async dispatchBatch(
    target: RemovalTarget,
    payload: { uris: string[] } | { uri: string; uid: string }[],
    platform: RemovalExecutorPlatform,
  ): Promise<void> {
    if (target.kind === 'liked-songs') {
      await platform.LibraryAPI.remove(payload as { uris: string[] });
      return;
    }
    await platform.PlaylistAPI.remove(
      target.playlistUri,
      payload as { uri: string; uid: string }[],
    );
  }
}
