/**
 * Port contract for the detection-scanner seam.
 *
 * Layer: `src/ports/` — may import from `src/domain/` only.
 *
 * `DetectionScanner` is the port the store consumes. The production adapter
 * (`src/adapters/detection-scanner.ts`, WP04) composes `TracksEnumerator`,
 * `CatalogEnricher`, and the pure `detect` algorithm into a single
 * orchestrated scan. Tests can swap in a fake scanner to drive store behavior
 * end-to-end without touching the underlying ports.
 *
 * 9-step composition shape (production adapter):
 * 1. Abort-check.
 * 2. Enumerate tracks (capturing `enumeratedHostCount` from first non-null `total`).
 * 3. Derive `skippedLocalCount = enumeratedHostCount − tracks.length`.
 * 4. Short-circuit on empty enumeration → return empty `DetectionResult`.
 * 5. Abort-check.
 * 6. Enrich tracks.
 * 7. Filter `unenriched` slots.
 * 8. Abort-check + emit `matching` start event.
 * 9. Run `detect(enriched)`, emit `matching` end event, assemble and return result.
 *
 * Canonical contract:
 * `kitty-specs/duplicate-track-detection-01KTFH5H/contracts/detection-scanner-port.md`
 *
 * Architecture constraint (`test/architecture.test.ts`):
 * `src/ports/` must not import from `src/adapters/`, `src/store/`, or `src/ui/`.
 */
import type {
  DetectionResult,
  ProgressEvent,
  ScanRequest,
} from '../domain/detection-types';

export interface DetectionScanner {
  /**
   * Run a full scan of `request`'s collection:
   * enumerate → enrich → match → group.
   *
   * The scanner is a pure coordinator: it delegates enumeration to a
   * `TracksEnumerator`, enrichment to a `CatalogEnricher`, and grouping to
   * the pure `detect` function. It does not issue host calls of its own.
   *
   * **Error pass-through**: the scanner re-throws whatever the enumerator
   * or enricher throws, without remapping reasons. The only error the scanner
   * itself introduces is `DOMException('AbortError')` from abort-checks.
   *
   * **No partial result**: if any step throws (other than `AbortError`), the
   * scan rejects and no `DetectionResult` is ever returned for that call.
   *
   * **Progress contract**:
   * - Enumerator emits `{ stage: 'enumerating', … }` events.
   * - Enricher emits `{ stage: 'enriching', … }` events.
   * - Scanner emits exactly two `{ stage: 'matching', … }` events (start + end).
   * - No event is emitted once `signal.aborted` is true.
   *
   * @param request - Discriminated payload identifying the collection to scan.
   * @param signal - Fires `'abort'` to cancel (re-trigger or route-reset).
   *   Checked at entry and between each major step. An `AbortError` from this
   *   scanner is **not** propagated to the store as `failed` — the store
   *   distinguishes `e.name === 'AbortError'` and swallows it.
   * @param onProgress - Invoked with `enumerating`, `enriching`, and
   *   `matching` stage events throughout the scan.
   *
   * @returns Promise resolving with the finalized `DetectionResult`.
   *
   * @throws `DetectionError` — re-thrown from the enumerator or enricher
   *   without remapping reasons.
   * @throws `DOMException('AbortError')` when `signal` aborts at any of the
   *   scanner's abort-check points.
   */
  scan(
    request: ScanRequest,
    signal: AbortSignal,
    onProgress: (event: ProgressEvent) => void,
  ): Promise<DetectionResult>;
}
