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
 *      - 429 → bounded exponential backoff + retry; gives up after
 *        `RATE_LIMIT_MAX_ATTEMPTS` retries → `rate-limit-unparseable`.
 *      - 4xx other than 401/429 → `catalog-rejected`.
 *      - 5xx or thrown Error → `network-failure`.
 *      - 200 + missing `tracks` array → `catalog-rejected` (shape violation).
 *      - 200 + track slot missing required fields → `malformed-enrichment-payload`.
 *      - null slot in `tracks[]` → `unenriched` slot (removed/unknown track).
 *   4. Abort semantics: check abort before each batch and wake up promptly from
 *      backoff sleeps.
 *   5. Emit one progress event per completed batch (not per retry attempt).
 *
 * Exports `isCatalogTrack` classifier per NFR-008 / charter Input Validation.
 *
 * CosmosAsync response shape (confirmed empirically against the real Spotify
 * client): on an HTTP error (non-2xx) the promise RESOLVES (does not reject)
 * with an object `{ code: <httpStatusNumber>, error: string, message: string,
 * stack: string }` — the status is under `code`, and there are NO headers and
 * no `Retry-After`. On success (2xx) it resolves with the parsed JSON body
 * directly (e.g. `{ tracks: [...] }`) with no `code`. It only rejects on
 * lower-level failures, which the adapter maps to `network-failure`.
 */
import type { CatalogEnricher, EnrichmentSlot } from '../ports/catalog-enricher';
import type { RawTrack, ProgressEvent } from '../domain/detection-types';
import { DetectionError } from '../domain/detection-errors';
import { asEnrichedTrack } from '../domain/enriched-track-parser';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum IDs per catalog batch (Spotify Web API constraint). */
const BATCH_SIZE = 50;

/** Base URL for the catalog tracks endpoint. */
const TRACKS_URL = 'https://api.spotify.com/v1/tracks';

/** Initial backoff delay before retrying a rate-limited (429) batch. */
const RATE_LIMIT_BASE_DELAY_MS = 1000;
/** Maximum single backoff delay (cap for exponential growth). */
const RATE_LIMIT_MAX_DELAY_MS = 16000;
/** Maximum number of 429 retry attempts before giving up. */
const RATE_LIMIT_MAX_ATTEMPTS = 5;

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
  private readonly _cosmos: CosmosAsyncClient | undefined;

  /** Lazy accessor: returns the injected client or reads from globalThis.Spicetify.CosmosAsync. */
  private get cosmos(): CosmosAsyncClient {
    if (this._cosmos !== undefined) return this._cosmos;
    return (
      (globalThis as unknown as { Spicetify?: { CosmosAsync?: CosmosAsyncClient } })
        .Spicetify?.CosmosAsync as CosmosAsyncClient
    );
  }

  /**
   * @param cosmos - CosmosAsync subset. In production, omit to read lazily
   *   from `globalThis.Spicetify.CosmosAsync` (no access at construction time).
   *   In tests, pass a stub.
   */
  constructor(cosmos?: CosmosAsyncClient) {
    this._cosmos = cosmos;
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
   * @throws DetectionError('rate-limit-unparseable') on 429 still rate-limited
   *         after the bounded backoff retries are exhausted.
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
   * On 429, retries with bounded exponential backoff (the real CosmosAsync 429
   * error object carries no Retry-After to honor), giving up after
   * `RATE_LIMIT_MAX_ATTEMPTS` retries. Other errors throw immediately.
   */
  private async fetchBatch(
    batchTracks: ReadonlyArray<RawTrack>,
    signal: AbortSignal,
  ): Promise<EnrichmentSlot[]> {
    const ids = batchTracks.map((t) => t.id).join(',');
    const url = `${TRACKS_URL}?ids=${ids}`;

    let attempt = 0;

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

      // On an HTTP error CosmosAsync resolves with `{ code, error, message, stack }`
      // (status under `code`, no headers). On success it resolves with the parsed
      // body directly (no `code`). extractStatus reads `code` (with `status` as a
      // defensive fallback).
      const status = this.extractStatus(raw);

      // Auth expired
      if (status === 401 || this.looksLikeAuthExpired(raw)) {
        throw new DetectionError(
          'auth-token-expired',
          'Catalog endpoint returned an auth-expired signal',
        );
      }

      // Rate limited — bounded exponential backoff then retry. The real 429
      // object has no Retry-After, so we back off ourselves.
      if (status === 429) {
        if (attempt >= RATE_LIMIT_MAX_ATTEMPTS) {
          throw new DetectionError(
            'rate-limit-unparseable',
            `Catalog still rate-limited after ${RATE_LIMIT_MAX_ATTEMPTS} backoff retries`,
          );
        }
        const delay = Math.min(
          RATE_LIMIT_BASE_DELAY_MS * 2 ** attempt,
          RATE_LIMIT_MAX_DELAY_MS,
        );
        await this.sleep(delay, signal);
        attempt += 1;
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
   * Sleep for `ms` milliseconds (always > 0 in the backoff path), but wake
   * early if `signal` aborts.
   */
  private sleep(ms: number, signal: AbortSignal): Promise<void> {
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
   * On an HTTP error CosmosAsync resolves with `{ code: number, ... }` (the
   * status lives under `code`, with no `status` key). On a 2xx success it
   * resolves with the parsed body, which has neither `code` nor `status`. We
   * read `code` first and keep `status` as a defensive fallback.
   */
  private extractStatus(raw: unknown): number | undefined {
    if (typeof raw !== 'object' || raw === null) return undefined;
    const obj = raw as Record<string, unknown>;
    if (typeof obj['code'] === 'number') return obj['code'];
    if (typeof obj['status'] === 'number') return obj['status'];
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
