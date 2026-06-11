/**
 * Production `CatalogEnricher` adapter.
 *
 * Enriches a list of `RawTrack` by fetching their catalog records from
 * `GET https://api.spotify.com/v1/tracks?ids=…` in sequential 50-ID batches
 * via `Spicetify.CosmosAsync.get`.
 *
 * Responsibilities:
 *   1. Empty-input guard (no host call; resolves `[]` immediately).
 *   2. Batch the IDs 50 at a time (the catalog endpoint maximum).
 *   3. Classify every response:
 *      - Recognised auth-expired signal (status 401 or body text) → `auth-token-expired`.
 *      - 429 + parseable Retry-After → sleep + retry (unbounded retry loop per research §R-009).
 *      - 429 + missing/malformed Retry-After → `rate-limit-unparseable`.
 *      - 4xx other than 401/429 → `catalog-rejected`.
 *      - 5xx or thrown Error → `network-failure`.
 *      - 200 + missing `tracks` array → `catalog-rejected` (shape violation).
 *      - 200 + track slot missing required fields → `malformed-enrichment-payload`.
 *      - null slot in `tracks[]` → `unenriched` slot (removed/unknown track).
 *   4. Abort semantics: check abort before each batch and wake up promptly from
 *      Retry-After sleeps.
 *   5. Emit one progress event per completed batch (not per retry attempt).
 *
 * Exports `isCatalogTrack` classifier per NFR-008 / charter Input Validation.
 *
 * CosmosAsync response shape: the host wraps HTTP responses as objects with an
 * optional `status` property (for non-2xx) and/or a JSON body. 2xx responses
 * are returned as the parsed body directly (no `status` key). The adapter
 * normalises both forms.
 */
import type { CatalogEnricher, EnrichmentSlot } from '../ports/catalog-enricher';
import type { RawTrack, ProgressEvent } from '../domain/detection-types';
import { DetectionError } from '../domain/detection-errors';
import { parseRetryAfter } from './retry-after';
import { asEnrichedTrack } from '../domain/enriched-track-parser';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum IDs per catalog batch (Spotify Web API constraint). */
const BATCH_SIZE = 50;

/** Base URL for the catalog tracks endpoint. */
const TRACKS_URL = 'https://api.spotify.com/v1/tracks';

// ---------------------------------------------------------------------------
// Classifier
// ---------------------------------------------------------------------------

/**
 * Raw catalog track shape as returned by `GET /v1/tracks?ids=…` for a single
 * non-null slot.
 *
 * The adapter uses this interface to pre-validate before calling `asEnrichedTrack`.
 */
export interface CatalogTrack {
  id: string;
  uri: string;
  name: string;
  artists: ReadonlyArray<{ name: string }>;
  duration_ms: number;
  linked_from?: { uri: string };
}

/**
 * Classifier predicate: returns `true` iff `x` has the minimum shape the adapter
 * requires to consider it a valid catalog track entry (before full parsing).
 *
 * Does not validate `linked_from` — that is an optional field validated by
 * `asEnrichedTrack`.
 *
 * @param x - Candidate value from the catalog response `tracks` array.
 */
export function isCatalogTrack(x: unknown): x is CatalogTrack {
  if (typeof x !== 'object' || x === null) return false;
  const t = x as Record<string, unknown>;
  if (typeof t['id'] !== 'string' || t['id'].length === 0) return false;
  if (typeof t['uri'] !== 'string' || t['uri'].length === 0) return false;
  if (typeof t['name'] !== 'string') return false;
  const artists = t['artists'];
  if (!Array.isArray(artists) || artists.length === 0) return false;
  if (typeof t['duration_ms'] !== 'number') return false;
  return true;
}

// ---------------------------------------------------------------------------
// CosmosAsync interface (injected for testability)
// ---------------------------------------------------------------------------

/**
 * Minimum CosmosAsync surface needed by the enricher.
 */
export interface CosmosAsyncClient {
  get(url: string): Promise<unknown>;
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

/**
 * Production implementation of `CatalogEnricher`.
 *
 * Uses the injected `cosmos` client to fetch catalog records sequentially.
 */
export class SpicetifyCatalogEnricher implements CatalogEnricher {
  private readonly cosmos: CosmosAsyncClient;

  /**
   * @param cosmos - CosmosAsync subset. In production, pass
   *   `(globalThis as { Spicetify: { CosmosAsync: CosmosAsyncClient } }).Spicetify.CosmosAsync`.
   *   In tests, pass a stub.
   */
  constructor(cosmos: CosmosAsyncClient) {
    this.cosmos = cosmos;
  }

  /**
   * Enrich every track in `tracks` by fetching its catalog record.
   *
   * @param tracks - `RawTrack[]` from the enumerator. Order preserved.
   * @param signal - Fires `'abort'` when the caller cancels.
   * @param onProgress - Invoked once per completed 50-ID batch with
   *                     `{ stage: 'enriching', processed, total }`.
   * @returns Promise resolving with `EnrichmentSlot[]` aligned to `tracks`.
   * @throws DetectionError('auth-token-expired') on 401 or token-expired body.
   * @throws DetectionError('rate-limit-unparseable') on 429 with bad Retry-After.
   * @throws DetectionError('network-failure') on 5xx, thrown Error, or Error instance.
   * @throws DetectionError('malformed-enrichment-payload') on bad per-track shape.
   * @throws DetectionError('catalog-rejected') on 4xx other than 401/429.
   * @throws DOMException('AbortError') when `signal` aborts.
   */
  async enrich(
    tracks: ReadonlyArray<RawTrack>,
    signal: AbortSignal,
    onProgress: (event: ProgressEvent) => void,
  ): Promise<ReadonlyArray<EnrichmentSlot>> {
    // Empty-input invariant
    if (tracks.length === 0) {
      return [];
    }

    // Immediate abort guard
    if (signal.aborted) {
      throw new DOMException('Enrichment aborted before start', 'AbortError');
    }

    const total = tracks.length;
    const slots: EnrichmentSlot[] = [];
    let processed = 0;

    // Process in sequential batches
    for (let batchStart = 0; batchStart < total; batchStart += BATCH_SIZE) {
      // Abort check before each batch
      if (signal.aborted) {
        throw new DOMException('Enrichment aborted between batches', 'AbortError');
      }

      const batchTracks = tracks.slice(batchStart, batchStart + BATCH_SIZE);
      const batchSlots = await this.fetchBatch(batchTracks, signal);

      slots.push(...batchSlots);
      processed += batchTracks.length;

      // Progress event after successful batch completion
      onProgress({
        stage: 'enriching',
        processed,
        total,
      });
    }

    return slots;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Fetch and parse a single batch of tracks.
   *
   * Retries indefinitely on 429 + valid Retry-After. Other errors throw immediately.
   */
  private async fetchBatch(
    batchTracks: ReadonlyArray<RawTrack>,
    signal: AbortSignal,
  ): Promise<EnrichmentSlot[]> {
    const ids = batchTracks.map((t) => t.id).join(',');
    const url = `${TRACKS_URL}?ids=${ids}`;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      let raw: unknown;
      try {
        raw = await this.cosmos.get(url);
      } catch (cause) {
        throw new DetectionError('network-failure', 'CosmosAsync.get threw during catalog fetch', {
          cause,
        });
      }

      // CosmosAsync returns error responses as objects with a `status` property.
      // 2xx success responses are returned as the parsed body without a `status`.
      const status = this.extractStatus(raw);

      // Auth expired
      if (status === 401 || this.looksLikeAuthExpired(raw)) {
        throw new DetectionError(
          'auth-token-expired',
          'Catalog endpoint returned an auth-expired signal',
        );
      }

      // Rate limited — sleep and retry
      if (status === 429) {
        // status === 429 implies extractStatus() confirmed raw is an object with
        // a numeric status property, so the cast is safe.
        const headers = this.extractHeaders(raw as Record<string, unknown>);
        const retryAfterHeader = headers?.['Retry-After'] ?? headers?.['retry-after'];
        let delayMs: number;
        try {
          delayMs = parseRetryAfter(retryAfterHeader);
        } catch (parseErr) {
          // parseRetryAfter only throws RetryAfterParseError; we catch
          // generically for type narrowing, then always map to our typed error.
          throw new DetectionError(
            'rate-limit-unparseable',
            `Catalog 429 has unparseable Retry-After header: ${String(retryAfterHeader)}`,
            { cause: parseErr },
          );
        }
        await this.sleep(delayMs, signal);
        // Retry
        continue;
      }

      // 5xx → network-failure
      if (status !== undefined && status >= 500) {
        throw new DetectionError('network-failure', `Catalog endpoint returned ${status}`, {
          context: { status },
        });
      }

      // 4xx other than 401/429 → catalog-rejected
      if (status !== undefined && status >= 400) {
        throw new DetectionError('catalog-rejected', `Catalog endpoint returned ${status}`, {
          context: { status },
        });
      }

      // Error instance returned as value
      if (raw instanceof Error) {
        throw new DetectionError('network-failure', `CosmosAsync.get returned an Error instance`, {
          cause: raw,
        });
      }

      // 200-ish: validate shape
      return this.parseResponse(raw, batchTracks);
    }
  }

  /**
   * Parse the catalog response and build `EnrichmentSlot[]` aligned to `batchTracks`.
   */
  private parseResponse(
    raw: unknown,
    batchTracks: ReadonlyArray<RawTrack>,
  ): EnrichmentSlot[] {
    if (typeof raw !== 'object' || raw === null) {
      throw new DetectionError('catalog-rejected', 'Catalog response is not an object', {
        context: { status: 200 },
      });
    }

    const body = raw as Record<string, unknown>;
    const tracksArray = body['tracks'];
    if (!Array.isArray(tracksArray)) {
      throw new DetectionError('catalog-rejected', 'Catalog response missing tracks array', {
        context: { status: 200 },
      });
    }

    const slots: EnrichmentSlot[] = [];
    for (let i = 0; i < batchTracks.length; i++) {
      const rawTrack = batchTracks[i]!;
      const slot = tracksArray[i];

      if (slot === null || slot === undefined) {
        slots.push({
          kind: 'unenriched',
          position: rawTrack.position,
          rawUri: rawTrack.uri,
        });
        continue;
      }

      // Use isCatalogTrack as a pre-check before asEnrichedTrack for better
      // error messages on missing required fields
      if (!isCatalogTrack(slot)) {
        // asEnrichedTrack will throw malformed-enrichment-payload with specifics
        asEnrichedTrack(slot, rawTrack.position); // always throws
        // unreachable, but satisfies TypeScript
        throw new DetectionError('malformed-enrichment-payload', 'unreachable');
      }

      const enriched = asEnrichedTrack(slot, rawTrack.position);
      slots.push({ kind: 'enriched', track: enriched });
    }

    return slots;
  }

  /**
   * Sleep for `ms` milliseconds, but wake early if `signal` aborts.
   */
  private sleep(ms: number, signal: AbortSignal): Promise<void> {
    if (ms <= 0) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      if (signal.aborted) {
        reject(new DOMException('Aborted before sleep', 'AbortError'));
        return;
      }

      const onAbort = () => {
        clearTimeout(timer);
        reject(new DOMException('Sleep aborted', 'AbortError'));
      };

      const timer = setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      }, ms);

      signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  /**
   * Extract the HTTP status from a CosmosAsync response object.
   *
   * CosmosAsync returns non-2xx as `{ status: number, ... }`.
   * 2xx responses omit the status property (body is returned directly).
   */
  private extractStatus(raw: unknown): number | undefined {
    if (typeof raw !== 'object' || raw === null) return undefined;
    const status = (raw as Record<string, unknown>)['status'];
    if (typeof status === 'number') return status;
    return undefined;
  }

  /**
   * Extract the headers object from a CosmosAsync non-2xx response.
   *
   * Called only in the 429 path where `raw` is already confirmed to be an
   * object (it had a numeric `status` property); the null guard is omitted.
   */
  private extractHeaders(raw: Record<string, unknown>): Record<string, string> | undefined {
    const headers = raw['headers'];
    if (typeof headers === 'object' && headers !== null) {
      return headers as Record<string, string>;
    }
    return undefined;
  }

  /**
   * Returns true if the response body signals an expired auth token.
   */
  private looksLikeAuthExpired(raw: unknown): boolean {
    if (typeof raw === 'string') {
      return /access token expired/i.test(raw);
    }
    if (typeof raw !== 'object' || raw === null) return false;
    const body = raw as Record<string, unknown>;
    // Check body.error.message
    const error = body['error'];
    if (typeof error === 'object' && error !== null) {
      const message = (error as Record<string, unknown>)['message'];
      if (typeof message === 'string' && /access token expired/i.test(message)) {
        return true;
      }
    }
    // Check body.message
    const message = body['message'];
    if (typeof message === 'string' && /access token expired/i.test(message)) {
      return true;
    }
    return false;
  }
}
