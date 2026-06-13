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
 *   4. Check the `AbortSignal` at each batch boundary; throw `AbortError`.
 *   5. Per-batch partial failure with per-track fallback (live-verify
 *      2026-06-12): a fulfilled batch's tracks go to `removed`; a *rejected*
 *      batch is NOT marked wholesale failed — instead each track is retried with
 *      its own single-track host call (resolves → `removed`, rejects → `failed`
 *      with the rejection message). The remaining batches are still attempted.
 *      `onProgress` fires once per batch (after any fallback) with the updated
 *      cumulative `removedSoFar`.
 *   6. Return `{ removed, failed }` with
 *      `removed.length + failed.length === tracks.length`.
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
   * @param signal - Checked at each batch boundary (before starting a batch);
   *   throws `DOMException('AbortError')` if aborted, starting no further batch.
   *   An in-progress per-track fallback for the current batch is allowed to
   *   complete; the abort guard sits at batch boundaries, not mid-fallback.
   * @param onProgress - Optional; invoked once per batch (after any per-track
   *   fallback) with the cumulative `removedSoFar` and the `total` requested
   *   (NFR-002). Fires even for a fully-failed batch (count unchanged).
   * @returns Promise resolving with the aggregate {@link RemovalOutcome}
   *   (`removed.length + failed.length === tracks.length`).
   * @throws RemovalError('host-unavailable') if the needed host API/method is
   *   absent — thrown before any mutation.
   * @throws DOMException('AbortError') if `signal` is aborted.
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
      return { removed: [], failed: [] };
    }

    // 3. Ordered batches of BATCH_SIZE (no re-order, no dedup).
    const batches = this.batch(tracks);

    const removed: TrackRef[] = [];
    const failed: { track: TrackRef; reason: string }[] = [];
    const total = tracks.length;

    for (const batch of batches) {
      // 4. Abort check at each batch boundary.
      if (signal.aborted) {
        throw new DOMException('Removal aborted between batches', 'AbortError');
      }

      // Validate the batch shape (e.g. playlist uid presence) BEFORE the host
      // call. A malformed batch is a whole-operation fault (fail loud) — it
      // propagates rather than being attributed to per-track `failed`.
      const occurrences = this.prepareBatch(target, batch);

      try {
        await this.dispatchBatch(target, occurrences, platform);
        // 5a. Fulfilled — all batch tracks removed.
        removed.push(...batch);
      } catch {
        // 5b. Bulk batch rejected. The host (PlaylistAPI) is atomic
        // reject-whole, so NOTHING was removed (live-verified 2026-06-12).
        // Retry each track individually: a single-track call that resolves
        // removes that one track; one that rejects fails only that track. This
        // cannot double-remove because the atomic reject removed nothing.
        for (const track of batch) {
          const single = this.prepareBatch(target, [track]);
          try {
            await this.dispatchBatch(target, single, platform);
            removed.push(track);
          } catch (cause) {
            const reason = cause instanceof Error ? cause.message : String(cause);
            failed.push({ track, reason });
          }
        }
      }

      // 5c. Report progress once per batch (after any fallback) with the
      // up-to-date cumulative count — fired even for a fully-failed batch so the
      // UI counter reflects every batch boundary.
      onProgress?.({ removedSoFar: removed.length, total });
    }

    // 6. Aggregate outcome (every requested track accounted for exactly once).
    return { removed, failed };
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
