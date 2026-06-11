/**
 * In-memory `CatalogEnricher` test double.
 *
 * Built from an in-memory map of track ID → `EnrichedTrack | null`. Supports
 * force-modes for error-path coverage and honors `AbortSignal` at each batch
 * boundary.
 *
 * Lives in `src/adapters/` so the architecture test treats it like any other
 * adapter — it may import from `src/domain/` and `src/ports/` only.
 *
 * Used by:
 * - `detection-scanner.test.ts` — drives composition adapter without a host.
 * - `detection-store.test.ts` — drives store behavior without a host.
 * - `integration/detection-end-to-end.test.ts` (WP06) — full row-click-to-summary.
 */
import type { CatalogEnricher, EnrichmentSlot } from '../ports/catalog-enricher';
import type { RawTrack, EnrichedTrack, ProgressEvent } from '../domain/detection-types';
import { DetectionError } from '../domain/detection-errors';

/**
 * Force-mode values that trigger specific error paths (mutually exclusive).
 *
 * - `'auth-expired'` — throws `DetectionError('auth-token-expired')`.
 * - `'rate-limit-unparseable'` — throws `DetectionError('rate-limit-unparseable')`.
 * - `'shape-drift'` — throws `DetectionError('malformed-enrichment-payload')`.
 */
export type FakeEnricherForceMode =
  | 'auth-expired'
  | 'rate-limit-unparseable'
  | 'shape-drift';

/**
 * Constructor options for `FakeCatalogEnricher`.
 */
export interface FakeCatalogEnricherOptions {
  /**
   * Map from track id → `EnrichedTrack | null`.
   * `null` simulates a catalog `null` (removed/unavailable track).
   * Missing keys are treated as `null` (unenriched).
   */
  catalog: ReadonlyMap<string, EnrichedTrack | null>;
  /** Simulated batch size. Default 50. */
  batchSize?: number;
  /**
   * If set, triggers the corresponding error path (mutually exclusive).
   * The error is thrown at the batch index specified by `forceAfterBatches`.
   */
  forceMode?: FakeEnricherForceMode;
  /**
   * Number of batches to process successfully before the force-mode throws.
   * Default 0 (throw on the very first batch).
   */
  forceAfterBatches?: number;
}

/**
 * In-memory test double implementing the `CatalogEnricher` port.
 *
 * Batches the input `RawTrack[]` into chunks of `batchSize`. At each batch:
 * 1. Yields the microtask queue.
 * 2. Checks `signal.aborted`; throws `DOMException('AbortError')` if so.
 * 3. Throws force-mode error if batch index ≥ `forceAfterBatches` (when set).
 * 4. Resolves each track to `enriched` or `unenriched` via the catalog map.
 * 5. Emits a progress event.
 *
 * The returned array is positionally aligned with the input (`result[i]`
 * corresponds to `tracks[i]`).
 *
 * @see contracts/catalog-enricher-port.md §"Test surface"
 */
export class FakeCatalogEnricher implements CatalogEnricher {
  private readonly catalog: ReadonlyMap<string, EnrichedTrack | null>;
  private readonly batchSize: number;
  private readonly forceMode: FakeEnricherForceMode | undefined;
  private readonly forceAfterBatches: number;

  constructor(opts: FakeCatalogEnricherOptions) {
    this.catalog = opts.catalog;
    this.batchSize = opts.batchSize ?? 50;
    this.forceMode = opts.forceMode;
    this.forceAfterBatches = opts.forceAfterBatches ?? 0;
  }

  /**
   * Enrich tracks using the in-memory catalog.
   *
   * @param tracks - Tracks to enrich. Empty input resolves with `[]` immediately.
   * @param signal - Abort signal; checked at each batch boundary.
   * @param onProgress - Progress callback invoked after each batch.
   * @returns Positionally-aligned `EnrichmentSlot[]`.
   * @throws DOMException('AbortError') if aborted.
   * @throws DetectionError on force-mode activation.
   */
  async enrich(
    tracks: ReadonlyArray<RawTrack>,
    signal: AbortSignal,
    onProgress: (event: ProgressEvent) => void,
  ): Promise<ReadonlyArray<EnrichmentSlot>> {
    // Empty-input invariant: resolve immediately, no progress event.
    if (tracks.length === 0) {
      return [];
    }

    const slots: EnrichmentSlot[] = [];
    const batches = chunk(tracks, this.batchSize);

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex]!;

      // Microtask yield.
      await Promise.resolve();

      // Abort check.
      if (signal.aborted) {
        throw new DOMException('aborted', 'AbortError');
      }

      // Force-mode: throw if this batch index has reached the threshold.
      if (this.forceMode !== undefined && batchIndex >= this.forceAfterBatches) {
        throw buildForceError(this.forceMode);
      }

      // Process batch.
      for (const track of batch) {
        const catalogEntry = this.catalog.get(track.id);
        if (catalogEntry !== undefined && catalogEntry !== null) {
          slots.push({ kind: 'enriched', track: catalogEntry });
        } else {
          // null in catalog OR missing key → unenriched.
          slots.push({
            kind: 'unenriched',
            position: track.position,
            rawUri: track.uri,
          });
        }
      }

      // Progress event after batch.
      onProgress({
        stage: 'enriching',
        processed: slots.length,
        total: tracks.length,
      });
    }

    return slots;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build the appropriate `DetectionError` for a force-mode.
 *
 * @param mode - The active force mode.
 * @returns Corresponding `DetectionError` instance.
 */
function buildForceError(mode: FakeEnricherForceMode): DetectionError {
  switch (mode) {
    case 'auth-expired':
      return new DetectionError('auth-token-expired', 'fake: auth token expired');
    case 'rate-limit-unparseable':
      return new DetectionError('rate-limit-unparseable', 'fake: rate limit unparseable');
    case 'shape-drift':
      return new DetectionError('malformed-enrichment-payload', 'fake: shape drift');
  }
}

/**
 * Split `arr` into chunks of at most `size` elements.
 *
 * @param arr - Source array.
 * @param size - Maximum chunk size (must be > 0).
 * @returns Array of chunks; last chunk may be smaller than `size`.
 */
function chunk<T>(arr: ReadonlyArray<T>, size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size) as T[]);
  }
  return result;
}
