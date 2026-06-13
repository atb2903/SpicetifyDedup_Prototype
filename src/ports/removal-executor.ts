/**
 * Port contract for the track-removal (deletion) seam.
 *
 * Layer: `src/ports/` — may import from `src/domain/` only.
 *
 * This file declares the `RemovalExecutor` interface that both production and
 * test adapters implement:
 * - `SpicetifyRemovalExecutor` (WP04) — deletes through the live Spicetify
 *   `Platform.LibraryAPI` (Liked Songs) / `PlaylistAPI` (playlists), batching
 *   and honoring the `AbortSignal` between batches.
 * - `FakeRemovalExecutor` (WP03) — a deterministic, scripted, host-free double
 *   that lets the store (WP05) and UI (WP06) be built and tested against the
 *   same seam (`DIRECTIVE_036`).
 *
 * Canonical contract:
 * `kitty-specs/remove-duplicate-tracks-button-01KTW64K/contracts/removal-executor-port.md`
 * Port signature: `data-model.md` §6.
 *
 * Architecture constraint (`test/architecture.test.ts`):
 * `src/ports/` must not import from `src/adapters/`, `src/store/`, or `src/ui/`.
 */
import type {
  RemovalTarget,
  TrackRef,
  RemovalOutcome,
  RemovalProgressEvent,
} from '../domain/removal-types';

/**
 * The single mutation seam the whole removal feature deletes through.
 *
 * One implementation talks to the live Spicetify host; the fake maps a test
 * script onto the requested tracks. Both honor the same post-conditions so
 * downstream store/UI tests exercise real plumbing.
 */
export interface RemovalExecutor {
  /**
   * Delete `tracks` from the single `target` collection (FR-003, FR-010, FR-012).
   *
   * Resolves with a per-track {@link RemovalOutcome} that partitions every
   * requested track into `removed` (host confirmed the deletion) or `failed`
   * (with a host-supplied `reason`), so the UI can keep the unremoved copies
   * visible (AS-8). The promise **rejects** only for whole-operation faults the
   * adapter cannot attribute to individual tracks — e.g. the host API being
   * absent (`RemovalError('host-unavailable', …)`) or an `AbortError` when
   * `signal` fires. A partial batch failure is *not* a rejection; it is reported
   * through `failed`.
   *
   * Post-conditions (the invariants WP04 is reviewed against and the fake upholds):
   * - **Total accounting:** `removed.length + failed.length === tracks.length` —
   *   every requested track appears in exactly one partition.
   * - **Disjointness:** `removed` and `failed` are disjoint by `TrackRef`
   *   identity (playlist → `uid`, Liked Songs → `uri`); no track is in both.
   * - **Single-collection scope (C-003):** exactly one `target` per call; the
   *   adapter never touches another collection.
   * - **Rejection reserved:** a rejection means a whole-operation fault, never a
   *   per-track failure (those go to `failed`).
   *
   * @param target - The single collection to delete from. `'liked-songs'`
   *   addresses tracks by `uri`; `'playlist'` addresses each occurrence by its
   *   required `TrackRef.uid` (ADR-0012).
   * @param tracks - The ordered set of occurrences to delete (the `RemoveSet`
   *   tracks). Not re-ordered or de-duplicated by the executor; the domain
   *   produced them in the correct later-copies order.
   * @param signal - Cancellation signal owned by the store. Checked at batch
   *   boundaries (and at call entry); if aborted the call throws
   *   `DOMException('AbortError')` rather than swallowing the cancellation.
   * @param onProgress - Optional callback invoked after progress is made (per
   *   batch in the real adapter) with the cumulative `removedSoFar` and the
   *   `total` requested, for the `removing` FSM phase's live counter (NFR-002).
   *
   * @returns Promise resolving with the aggregate {@link RemovalOutcome}.
   *
   * @throws `RemovalError('host-unavailable', …)` if the required host API is
   *   absent before any mutation.
   * @throws `DOMException('AbortError')` if `signal` is aborted.
   */
  remove(
    target: RemovalTarget,
    tracks: ReadonlyArray<TrackRef>,
    signal: AbortSignal,
    onProgress?: (event: RemovalProgressEvent) => void,
  ): Promise<RemovalOutcome>;
}
