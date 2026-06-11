/**
 * Port contract for the catalog-enrichment seam.
 *
 * Layer: `src/ports/` — may import from `src/domain/` only.
 *
 * This file declares `CatalogEnricher` (the port) and `EnrichmentSlot`
 * (the discriminated union that wraps each per-track result). Both are
 * consumed by `DetectionScanner` and produced by adapters:
 * - `SpicetifyCatalogEnricher` (WP05) — issues batched
 *   `GET /v1/tracks?ids=…` calls via `Spicetify.CosmosAsync`.
 * - `FakeCatalogEnricher` (WP04) — uses an in-memory fixture map for
 *   store and integration tests.
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
   * @throws `DetectionError('auth-token-expired', …)` when the catalog returns
   *   a 401 or a body matching `/access token expired/i`.
   * @throws `DetectionError('rate-limit-unparseable', …)` when the catalog
   *   returns 429 and the `Retry-After` header is missing or malformed.
   * @throws `DetectionError('network-failure', …, { cause })` on 5xx or
   *   host-level network error.
   * @throws `DetectionError('malformed-enrichment-payload', …)` when the 200
   *   response body does not conform to the expected track shape.
   * @throws `DetectionError('catalog-rejected', …, { context: { status } })`
   *   on any other 4xx response.
   * @throws `DOMException('AbortError')` when `signal` aborts before the call
   *   resolves. Not surfaced to the store as `failed`.
   */
  enrich(
    tracks: ReadonlyArray<RawTrack>,
    signal: AbortSignal,
    onProgress: (event: ProgressEvent) => void,
  ): Promise<ReadonlyArray<EnrichmentSlot>>;
}
