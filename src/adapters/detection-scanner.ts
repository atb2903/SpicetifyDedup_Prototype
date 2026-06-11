/**
 * Composition adapter: `createDetectionScanner`
 *
 * Wires a `TracksEnumerator`, a `CatalogEnricher`, and the pure `detect`
 * algorithm together into a single `DetectionScanner` implementation.
 *
 * This adapter is intentionally thin — it contains no host calls of its own.
 * All host interaction is delegated to the injected enumerator and enricher,
 * which can be swapped for fakes in tests (T013 / WP06 integration tests).
 *
 * Architecture: `src/adapters/` — may import from `src/domain/` and
 * `src/ports/` only. No host-bound or Spicetify-specific imports here.
 *
 * @see contracts/detection-scanner-port.md
 * @see ADR-0007 — AbortSignal as the single cancellation primitive
 * @see ADR-0008 — Progress signal shape
 */

import type { DetectionScanner } from '../ports/detection-scanner';
import type { TracksEnumerator } from '../ports/tracks-enumerator';
import type { CatalogEnricher, EnrichmentSlot } from '../ports/catalog-enricher';
import type {
  ScanRequest,
  DetectionResult,
  ProgressEvent,
  EnrichedTrack,
} from '../domain/detection-types';
import { detect } from '../domain/duplicate-detector';

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a `DetectionScanner` by composing an enumerator, an enricher, and
 * the pure detection algorithm.
 *
 * Orchestration contract:
 *  1. Check `signal.aborted` before any work begins.
 *  2. Enumerate all non-local tracks via `enumerator.enumerate`.
 *  3. Check `signal.aborted` after enumeration resolves.
 *  4. Enrich the tracks via `enricher.enrich`.
 *  5. Check `signal.aborted` after enrichment resolves.
 *  6. Emit a `matching` start event (`processed=0`), run `detect`, emit a
 *     `matching` end event (`processed=N`), then build and return the result.
 *
 * The scanner never catches errors — `DetectionError` and `DOMException`
 * ('AbortError') propagate unchanged to the caller (FR-011, FR-012).
 *
 * @param enumerator - Port implementation for collection enumeration.
 * @param enricher - Port implementation for catalog enrichment.
 * @param clock - Injected clock (returns UTC ms). Defaults to `Date.now`.
 *   Inject a deterministic function in tests for predictable `completedAt`.
 * @returns A `DetectionScanner` bound to the provided dependencies.
 */
export function createDetectionScanner(
  enumerator: TracksEnumerator,
  enricher: CatalogEnricher,
  clock: () => number = Date.now,
): DetectionScanner {
  return {
    async scan(
      request: ScanRequest,
      signal: AbortSignal,
      onProgress: (event: ProgressEvent) => void,
    ): Promise<DetectionResult> {
      // ── Step 1: Pre-flight abort check ────────────────────────────────────
      if (signal.aborted) {
        throw new DOMException('aborted', 'AbortError');
      }

      // ── Step 2: Enumerate tracks ───────────────────────────────────────────
      // Track the last reported hostTotalLength so we can derive skippedLocalCount.
      let hostTotalLength: number | null = null;
      const enumerationProgress = (event: ProgressEvent) => {
        if (event.stage === 'enumerating' && event.total !== null) {
          hostTotalLength = event.total;
        }
        onProgress(event);
      };

      const rawTracks = await enumerator.enumerate(request, signal, enumerationProgress);

      // ── Step 3: Post-enumeration abort check ──────────────────────────────
      if (signal.aborted) {
        throw new DOMException('aborted', 'AbortError');
      }

      // ── Step 4: Enrich tracks ─────────────────────────────────────────────
      const slots: ReadonlyArray<EnrichmentSlot> =
        rawTracks.length === 0
          ? []
          : await enricher.enrich(rawTracks, signal, onProgress);

      // ── Step 5: Post-enrichment abort check ───────────────────────────────
      if (signal.aborted) {
        throw new DOMException('aborted', 'AbortError');
      }

      // ── Step 6: Extract enriched tracks, count unenriched ─────────────────
      const enrichedTracks: EnrichedTrack[] = [];
      let unenrichedCount = 0;
      for (const slot of slots) {
        if (slot.kind === 'enriched') {
          enrichedTracks.push(slot.track);
        } else {
          unenrichedCount++;
        }
      }

      // ── Step 7: Run the detection algorithm ───────────────────────────────
      // Matching progress events are only emitted when there are enriched
      // tracks to match against — skipping them for empty collections avoids
      // misleading consumers and satisfies the §1 empty-enumeration contract.
      const total = enrichedTracks.length;
      let groups: ReturnType<typeof detect>;
      if (total > 0) {
        onProgress({ stage: 'matching', processed: 0, total });
        groups = detect(enrichedTracks);
        onProgress({ stage: 'matching', processed: total, total });
      } else {
        groups = detect(enrichedTracks);
      }

      // ── Step 8: Derive summary counts ─────────────────────────────────────
      const duplicateTrackCount = groups.reduce(
        (acc, g) => acc + g.members.length,
        0,
      );
      const removableTrackCount = groups.reduce(
        (acc, g) => acc + (g.members.length - 1),
        0,
      );

      const scannedTrackCount = rawTracks.length;
      const skippedLocalCount = hostTotalLength !== null
        ? Math.max(0, hostTotalLength - scannedTrackCount)
        : 0;

      // ── Step 9: Derive the collection key ─────────────────────────────────
      const collectionKey =
        request.kind === 'liked-songs' ? 'liked-songs' : request.playlistUri;

      return {
        collectionKey,
        completedAt: clock(),
        groups,
        duplicateTrackCount,
        removableTrackCount,
        skippedLocalCount,
        unenrichedCount,
        scannedTrackCount,
      };
    },
  };
}
