/**
 * Port contract for the catalog-enrichment seam.
 *
 * Layer: `src/ports/` — may import from `src/domain/` only.
 *
 * This file declares `CatalogEnricher` (the port) and `EnrichmentSlot`
 * (the discriminated union that wraps each per-track result). Both are
 * consumed by `DetectionScanner` and produced by adapters:
 * - `InlineCatalogEnricher` — the production enricher; a pure, host-free local
 *   transform over the Platform data already carried inline by each track
 *   (ADR-0011). There is **no** Web-API `SpicetifyCatalogEnricher` adapter; the
 *   `GET /v1/tracks?ids=…` path was abandoned (the public Web API is
 *   unreachable from the client — ADR-0010/ADR-0011).
 * - `FakeCatalogEnricher` — uses an in-memory fixture map for store and
 *   integration tests.
 *
 * Canonical contract:
 * `kitty-specs/duplicate-track-detection-01KTFH5H/contracts/catalog-enricher-port.md`
 *
 * Architecture constraint (`test/architecture.test.ts`):
 * `src/ports/` must not import from `src/adapters/`, `src/store/`, or `src/ui/`.
 */
import type { EnrichedTrack, ProgressEvent, RawTrack } from '../domain/detection-types';

// ---------------------------------------------------------------------------
// EnrichmentSlot
// ---------------------------------------------------------------------------

/**
 * Per-track result from a catalog enrichment call. The returned array is
 * aligned to the input `RawTrack[]` by position.
 *
 * - `'enriched'` — the catalog returned a valid track record; `track` carries
 *   all algorithm-required fields.
 * - `'unenriched'` — the catalog returned `null` for this slot (track removed
 *   from the catalog). The scanner excludes these from the detection algorithm
 *   and counts them in `DetectionResult.unenrichedCount`.
 */
export type EnrichmentSlot =
  | { kind: 'enriched'; track: EnrichedTrack }
  | { kind: 'unenriched'; position: number; rawUri: string };

// ---------------------------------------------------------------------------
// CatalogEnricher
// ---------------------------------------------------------------------------

export interface CatalogEnricher {
  /**
   * Enrich every track in `tracks` by fetching its catalog record in
   * sequential batches of up to 50 IDs.
   *
   * **Empty-input invariant**: if `tracks.length === 0`, resolves with `[]`
   * immediately — no host call, no progress event emitted. The scanner
   * short-circuits before calling this method for empty enumerations, but
   * the port enforces the no-op as defense in depth.
   *
   * **Order alignment**: the returned array has the same length as `tracks`,
   * and `result[i]` corresponds to `tracks[i]`.
   *
   * **Progress events**: one `{ stage: 'enriching', processed, total }` event
   * per batch completion, where `processed` is the cumulative number of slots
   * populated and `total` is `tracks.length`.
   *
   * @param tracks - Non-empty (but zero-safe) list of `RawTrack` objects from
   *   the enumerator. Order is preserved in the returned array.
   * @param signal - Fires `'abort'` when the caller cancels. Checked at the
   *   start of every batch and after every `await`. Abort during a
   *   `Retry-After` sleep throws `DOMException('AbortError')` promptly.
   * @param onProgress - Invoked once per batch completion with the cumulative
   *   enrichment-slot count and the total expected.
   *
   * @returns Promise resolving with an `EnrichmentSlot[]` of the same length
   *   as `tracks`, aligned by position. `unenriched` slots hold the track's
   *   `position` and original URI for counting by the scanner.
   *
   * @throws `DetectionError('auth-token-expired', …)` when a host auth-expiry is
   *   detected (the one reachable enricher reason — ADR-0011/ADR-0018). The
   *   inline production enricher is a pure local transform and does not perform
   *   catalog lookups, so the abandoned Web-API reasons no longer apply.
   * @throws `DOMException('AbortError')` when `signal` aborts before the call
   *   resolves. Not surfaced to the store as `failed`.
   */
  enrich(
    tracks: ReadonlyArray<RawTrack>,
    signal: AbortSignal,
    onProgress: (event: ProgressEvent) => void,
  ): Promise<ReadonlyArray<EnrichmentSlot>>;
}
