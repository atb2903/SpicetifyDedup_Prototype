/**
 * In-memory `TracksEnumerator` test double.
 *
 * Accepts a fixture array at construction time and pages through it,
 * emitting progress events and honoring `AbortSignal` at each page boundary.
 *
 * Lives in `src/adapters/` so the architecture test treats it like any other
 * adapter — it may import from `src/domain/` and `src/ports/` only.
 *
 * Used by:
 * - `detection-scanner.test.ts` — drives composition adapter without a host.
 * - `detection-store.test.ts` — drives store behavior without a host.
 * - `integration/detection-end-to-end.test.ts` (WP06) — full row-click-to-summary.
 */
import type { TracksEnumerator } from '../ports/tracks-enumerator';
import type {
  RawTrack,
  ScanRequest,
  ProgressEvent,
  EnumerationResult,
} from '../domain/detection-types';
import { DetectionError } from '../domain/detection-errors';

/**
 * Constructor options for `FakeTracksEnumerator`.
 */
export interface FakeTracksEnumeratorOptions {
  /** Fixture tracks (in collection order, post-local-filter). */
  tracks: ReadonlyArray<RawTrack>;
  /** Page size for simulated pagination. Default 200. */
  pageSize?: number;
  /**
   * Optional override: host's reported `totalLength` used solely for the
   * `enumerating` progress event's `total` field. Default = `tracks.length`.
   *
   * This drives ONLY the progress signal; it no longer derives the skip tally
   * (NEW-1 / ADR-0021). To express a local-only skip count, use
   * {@link FakeTracksEnumeratorOptions.skippedLocalCount}.
   */
  hostTotalLength?: number;
  /**
   * Local-only skip tally reported on the {@link EnumerationResult}. Mirrors
   * the production adapter's genuine `spotify:local:` count. Default 0.
   */
  skippedLocalCount?: number;
  /**
   * If `true`, throws `DetectionError('enumerator-failed', 'fake failure')`
   * on the first page. Used for error-path coverage.
   */
  failOnFirstPage?: boolean;
}

/**
 * In-memory test double implementing the `TracksEnumerator` port.
 *
 * Fixture tracks are chunked into pages of `pageSize`. At each page boundary
 * the implementation:
 * 1. Yields the microtask queue (`await Promise.resolve()`).
 * 2. Checks `signal.aborted`; throws `DOMException('AbortError')` if so.
 * 3. Emits a progress event.
 *
 * @see contracts/tracks-enumerator-port.md §"Test surface"
 */
export class FakeTracksEnumerator implements TracksEnumerator {
  private readonly tracks: ReadonlyArray<RawTrack>;
  private readonly pageSize: number;
  private readonly hostTotalLength: number;
  private readonly skippedLocalCount: number;
  private readonly failOnFirstPage: boolean;

  constructor(opts: FakeTracksEnumeratorOptions) {
    this.tracks = opts.tracks;
    this.pageSize = opts.pageSize ?? 200;
    this.hostTotalLength = opts.hostTotalLength ?? opts.tracks.length;
    this.skippedLocalCount = opts.skippedLocalCount ?? 0;
    this.failOnFirstPage = opts.failOnFirstPage ?? false;
  }

  /**
   * Enumerate fixture tracks by paging through them, honoring abort and emitting
   * `enumerating` progress events.
   *
   * @param request - The scan request (not used by the fake; the same fixture
   *   is returned regardless of the request kind).
   * @param signal - Abort signal; checked at each page boundary.
   * @param onProgress - Progress callback invoked after each page.
   * @returns An `EnumerationResult` mirroring the production return shape:
   *   `{ tracks, skippedLocalCount }`.
   * @throws DetectionError('enumerator-failed') if `failOnFirstPage` is set.
   * @throws DOMException('AbortError') if `signal` is aborted.
   */
  async enumerate(
    _request: ScanRequest,
    signal: AbortSignal,
    onProgress: (event: ProgressEvent) => void,
  ): Promise<EnumerationResult> {
    // Force-failure path.
    if (this.failOnFirstPage) {
      throw new DetectionError('enumerator-failed', 'fake failure');
    }

    // Empty fixture: resolve immediately with no progress event.
    if (this.tracks.length === 0) {
      return { tracks: [], skippedLocalCount: this.skippedLocalCount };
    }

    // Page through the fixture.
    const pages = chunk(this.tracks, this.pageSize);
    let cumulative = 0;

    for (const page of pages) {
      // Microtask yield — allows AbortSignal race tests to work correctly.
      await Promise.resolve();

      // Abort check at page boundary.
      if (signal.aborted) {
        throw new DOMException('aborted', 'AbortError');
      }

      cumulative += page.length;
      onProgress({
        stage: 'enumerating',
        processed: cumulative,
        total: this.hostTotalLength,
      });
    }

    return { tracks: this.tracks, skippedLocalCount: this.skippedLocalCount };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
