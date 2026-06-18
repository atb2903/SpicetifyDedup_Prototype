/**
 * Port contract for the tracks-enumeration seam.
 *
 * Layer: `src/ports/` — may import from `src/domain/` only.
 *
 * This file declares the `TracksEnumerator` interface that both production
 * and test adapters implement:
 * - `SpicetifyTracksEnumerator` (WP05) — reads the live Spicetify
 *   `Platform.LibraryAPI` / `PlaylistAPI` with pagination.
 * - `FakeTracksEnumerator` (WP04) — returns a developer-provided fixture
 *   in deterministic order for store and integration tests.
 *
 * Canonical contract:
 * `kitty-specs/duplicate-track-detection-01KTFH5H/contracts/tracks-enumerator-port.md`
 *
 * Architecture constraint (`test/architecture.test.ts`):
 * `src/ports/` must not import from `src/adapters/`, `src/store/`, or `src/ui/`.
 */
import type { ScanRequest, ProgressEvent, EnumerationResult } from '../domain/detection-types';

export interface TracksEnumerator {
  /**
   * Enumerate every non-local track in the collection identified by `request`.
   *
   * Resolves only with a **complete** enumeration — no partial arrays.
   * `spotify:local:…` URIs are filtered before `result.tracks` is returned and
   * counted into `result.skippedLocalCount`; non-track items (e.g. podcast
   * episodes) are excluded from `result.tracks` AND left uncounted (invisible).
   *
   * Progress events are emitted once per host page after that page lands:
   * `{ stage: 'enumerating', processed, total }` where `total` is `null`
   * until the first page returns a `totalLength`, then held constant. The
   * local-skip tally is reported on the return value, NOT the progress event
   * (the `ProgressEvent` union is unchanged — ADR-0021).
   *
   * @param request - Discriminated payload identifying Liked Songs or a
   *   specific playlist URI. If `request.kind === 'playlist'` and
   *   `request.playlistUri` is empty or malformed, throws synchronously
   *   before any host call.
   * @param signal - Fires `'abort'` when the caller cancels (re-trigger or
   *   route-reset). Checked at every page boundary; if already aborted at
   *   call entry, throws immediately.
   * @param onProgress - Invoked once per host page with the cumulative
   *   post-local-filter count and the host's `totalLength` (or `null`).
   *
   * @returns Promise resolving with an {@link EnumerationResult}: the full
   *   ordered list of `RawTrack` objects (host-native iteration order,
   *   `position` `0..length-1`) plus the genuine local-only `skippedLocalCount`.
   *
   * @throws `DetectionError('enumerator-failed', …, { cause })` on any
   *   host shape drift, network failure, or non-success response.
   * @throws `DetectionError('auth-token-expired', …)` if the host surfaces
   *   an expired-token signal during pagination.
   * @throws `DOMException('AbortError')` when `signal` aborts before the
   *   call resolves. Caught by the scanner; not surfaced as `failed`.
   */
  enumerate(
    request: ScanRequest,
    signal: AbortSignal,
    onProgress: (event: ProgressEvent) => void,
  ): Promise<EnumerationResult>;
}
