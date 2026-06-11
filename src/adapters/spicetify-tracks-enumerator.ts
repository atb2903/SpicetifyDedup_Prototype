/**
 * Production `TracksEnumerator` adapter.
 *
 * Enumerates every non-local track in a user collection by calling:
 * - `Spicetify.Platform.LibraryAPI.getTracks({ limit, offset })` for Liked Songs.
 * - `Spicetify.Platform.PlaylistAPI.getContents(uri, { limit, offset })` for playlists.
 *
 * Responsibilities:
 *   1. Pre-check the `ScanRequest` payload (reject empty/invalid playlist URIs).
 *   2. Paginate until all tracks are fetched (page size = 200).
 *   3. Filter out local files (`spotify:local:…` URIs) after each page.
 *   4. Validate host page shape and per-item shape (fail loud on drift).
 *   5. Check for abort between pages.
 *   6. Emit a progress event per page.
 *   7. Classify host errors as `enumerator-failed` or `auth-token-expired`.
 *
 * Item host shape: `{ type, uri, name, duration: { milliseconds }, album: { uri, name },
 * artists: [{ uri, name }] }`. `duration` IS present inline as `duration.milliseconds`
 * and maps to `RawTrack.durationMs`; only `linked_from` is absent (so `canonicalUri`
 * falls back to `uri`).
 *
 * Exports `isLibraryTrackItem` (classifier) and `parseLibraryTrackItem` (parser)
 * per NFR-008 / charter Input Validation pattern so callers and tests can interact
 * with the host-item boundary without re-entering the adapter.
 */
import type { TracksEnumerator } from '../ports/tracks-enumerator';
import type { RawTrack, ScanRequest, ProgressEvent } from '../domain/detection-types';
import { DetectionError } from '../domain/detection-errors';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Page size for paging requests. Max accepted by both LibraryAPI and PlaylistAPI. */
const PAGE_SIZE = 200;

// ---------------------------------------------------------------------------
// Host-item classifier + parser (exported for testing and re-use)
// ---------------------------------------------------------------------------

/**
 * Raw item shape returned by `LibraryAPI.getTracks` / `PlaylistAPI.getContents`
 * for a single track slot.
 *
 * Fields that the adapter actually consumes. Extra fields from the host are
 * tolerated and ignored.
 */
export interface LibraryTrackItem {
  type: string;
  uri: string;
  name: string;
  duration?: { milliseconds: number };
  album: { uri: string; name: string };
  artists: ReadonlyArray<{ uri: string; name: string }>;
}

/**
 * Classifier predicate: returns `true` iff `x` has the minimum shape the adapter
 * requires to process it as a track item.
 *
 * Accepts local-file URIs (`spotify:local:…`) — they are accepted by the classifier
 * and filtered out by the enumeration loop, not the classifier.
 *
 * @param x - Candidate value from the host items array.
 */
export function isLibraryTrackItem(x: unknown): x is LibraryTrackItem {
  if (typeof x !== 'object' || x === null) return false;
  const item = x as Record<string, unknown>;
  if (item['type'] !== 'track') return false;
  if (typeof item['uri'] !== 'string' || item['uri'].length === 0) return false;
  if (typeof item['name'] !== 'string') return false;
  const artists = item['artists'];
  if (!Array.isArray(artists) || artists.length === 0) return false;
  const album = item['album'];
  if (typeof album !== 'object' || album === null) return false;
  return true;
}

/**
 * Parse a host track item into a `RawTrack`.
 *
 * Extracts the track ID from the URI (the last segment after the final `:`).
 * Assigns the supplied `position` (post-local-filter index).
 *
 * Does NOT call `isLibraryTrackItem` first — it validates independently so the
 * error context can carry the specific missing field name.
 *
 * @param x - Raw item from the host.
 * @param position - Zero-based post-local-filter position to assign.
 * @returns A fully-typed `RawTrack`.
 * @throws DetectionError('enumerator-failed') with `context.phase = 'validating-item'`
 *         and `context.missingField` on any shape failure.
 */
export function parseLibraryTrackItem(x: unknown, position: number): RawTrack {
  if (typeof x !== 'object' || x === null) {
    throw new DetectionError('enumerator-failed', 'track item is not an object', {
      context: { phase: 'validating-item', missingField: 'object' },
    });
  }
  const item = x as Record<string, unknown>;

  const uri = item['uri'];
  if (typeof uri !== 'string' || uri.length === 0) {
    throw new DetectionError('enumerator-failed', 'track item missing non-empty uri', {
      context: { phase: 'validating-item', missingField: 'uri' },
    });
  }

  const name = item['name'];
  if (typeof name !== 'string') {
    throw new DetectionError('enumerator-failed', 'track item missing name', {
      context: { phase: 'validating-item', missingField: 'name' },
    });
  }

  const artists = item['artists'];
  if (!Array.isArray(artists) || artists.length === 0) {
    throw new DetectionError('enumerator-failed', 'track item missing or empty artists', {
      context: { phase: 'validating-item', missingField: 'artists' },
    });
  }

  const album = item['album'];
  if (typeof album !== 'object' || album === null) {
    throw new DetectionError('enumerator-failed', 'track item missing album object', {
      context: { phase: 'validating-item', missingField: 'album' },
    });
  }

  // Extract track ID from URI: last segment after ':'.
  // split(':') always returns a non-empty array so the last element is never
  // undefined; the non-null assertion avoids a dead ternary branch.
  const parts = uri.split(':');
  const id = parts[parts.length - 1]!;

  const albumObj = album as Record<string, unknown>;
  const mappedArtists = (artists as unknown[]).map((a) => {
    const ao = a as Record<string, unknown>;
    return {
      uri: typeof ao['uri'] === 'string' ? ao['uri'] : '',
      name: typeof ao['name'] === 'string' ? ao['name'] : '',
    };
  });

  // Inline duration: the host returns `duration: { milliseconds: <int> }`.
  // Derive `durationMs` when that object carries a finite `milliseconds`
  // number; otherwise `null` (the track flows to an `unenriched` slot).
  const duration = item['duration'];
  let durationMs: number | null = null;
  if (typeof duration === 'object' && duration !== null) {
    const ms = (duration as Record<string, unknown>)['milliseconds'];
    if (typeof ms === 'number' && Number.isFinite(ms)) {
      durationMs = ms;
    }
  }

  return {
    uri,
    id,
    name,
    position,
    durationMs,
    artists: mappedArtists,
    album: {
      uri: typeof albumObj['uri'] === 'string' ? albumObj['uri'] : '',
      name: typeof albumObj['name'] === 'string' ? albumObj['name'] : '',
    },
  };
}

// ---------------------------------------------------------------------------
// Platform shape (injected via constructor for testability)
// ---------------------------------------------------------------------------

/**
 * Minimum platform surface needed by `SpicetifyTracksEnumerator`.
 *
 * Injected at construction time so tests can provide a stub without touching
 * `globalThis.Spicetify`.
 */
export interface TracksEnumeratorPlatform {
  LibraryAPI: {
    getTracks(params: { limit: number; offset: number }): Promise<unknown>;
  };
  PlaylistAPI: {
    getContents(uri: string, params: { limit: number; offset: number }): Promise<unknown>;
  };
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

/**
 * Production implementation of `TracksEnumerator`.
 *
 * Uses the injected `platform` to page through the host's library or playlist
 * API, filters local files, validates shapes, and emits progress events.
 */
export class SpicetifyTracksEnumerator implements TracksEnumerator {
  private readonly _platform: TracksEnumeratorPlatform | undefined;

  /** Lazy accessor: returns the injected platform or reads from globalThis.Spicetify.Platform. */
  private get platform(): TracksEnumeratorPlatform {
    if (this._platform !== undefined) return this._platform;
    return (
      (globalThis as unknown as { Spicetify?: { Platform?: TracksEnumeratorPlatform } })
        .Spicetify?.Platform as TracksEnumeratorPlatform
    );
  }

  /**
   * @param platform - Spicetify Platform subset. In production, omit to read
   *   lazily from `globalThis.Spicetify.Platform` (no access at construction time).
   *   In tests, pass a stub built from `makePlatform()`.
   */
  constructor(platform?: TracksEnumeratorPlatform) {
    this._platform = platform;
  }

  /**
   * Enumerate every non-local track in the collection identified by `request`.
   *
   * @param request - Discriminated payload identifying Liked Songs or a playlist URI.
   * @param signal - Fires `'abort'` to cancel pagination.
   * @param onProgress - Invoked once per page with `{ stage: 'enumerating', processed, total }`.
   * @returns Promise resolving with the full ordered list of `RawTrack`.
   * @throws DetectionError('enumerator-failed') on bad request, shape drift, or network failure.
   * @throws DetectionError('auth-token-expired') on a host auth-expired signal.
   * @throws DOMException('AbortError') when `signal` aborts.
   */
  async enumerate(
    request: ScanRequest,
    signal: AbortSignal,
    onProgress: (event: ProgressEvent) => void,
  ): Promise<ReadonlyArray<RawTrack>> {
    // Pre-check
    this.validateRequest(request);

    // Immediate abort guard
    if (signal.aborted) {
      throw new DOMException('Enumeration aborted before start', 'AbortError');
    }

    const tracks: RawTrack[] = [];
    let offset = 0;
    let total: number | null = null;
    let position = 0; // post-local-filter monotonic counter

    // eslint-disable-next-line no-constant-condition
    while (true) {
      // Abort check between pages
      if (signal.aborted) {
        throw new DOMException('Enumeration aborted between pages', 'AbortError');
      }

      const raw = await this.fetchPage(request, offset);
      const page = this.validatePage(raw);

      if (total === null) {
        total = page.totalLength;
      }

      // Filter and parse items
      const pageItems: RawTrack[] = [];
      for (const item of page.items) {
        if (!this.isLocalFile(item)) {
          const parsed = this.parseItem(item, position);
          pageItems.push(parsed);
          position++;
        }
      }

      tracks.push(...pageItems);

      // Progress event after each page
      onProgress({
        stage: 'enumerating',
        processed: position,
        total: total,
      });

      // Termination: fetched all known tracks
      if (offset + page.items.length >= page.totalLength) {
        break;
      }

      offset += page.items.length;
    }

    return tracks;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private validateRequest(request: ScanRequest): void {
    if (request.kind === 'playlist') {
      if (!request.playlistUri || request.playlistUri.length === 0) {
        throw new DetectionError(
          'enumerator-failed',
          'playlist playlistUri must be a non-empty string',
          { context: { phase: 'precheck', missingField: 'playlistUri' } },
        );
      }
      if (!request.playlistUri.startsWith('spotify:playlist:')) {
        throw new DetectionError(
          'enumerator-failed',
          `playlist playlistUri must start with 'spotify:playlist:'; got: ${request.playlistUri}`,
          { context: { phase: 'precheck', missingField: 'playlistUri' } },
        );
      }
    }
  }

  private async fetchPage(request: ScanRequest, offset: number): Promise<unknown> {
    try {
      if (request.kind === 'liked-songs') {
        return await this.platform.LibraryAPI.getTracks({ limit: PAGE_SIZE, offset });
      } else {
        return await this.platform.PlaylistAPI.getContents(request.playlistUri, {
          limit: PAGE_SIZE,
          offset,
        });
      }
    } catch (cause) {
      if (this.looksLikeAuthExpired(cause)) {
        throw new DetectionError(
          'auth-token-expired',
          'Host API rejected with an auth-expired signal during enumeration',
          { cause },
        );
      }
      throw new DetectionError(
        'enumerator-failed',
        'Host API rejected during enumeration',
        { cause },
      );
    }
  }

  private validatePage(raw: unknown): { items: unknown[]; totalLength: number } {
    if (typeof raw !== 'object' || raw === null) {
      throw new DetectionError('enumerator-failed', 'page response is not an object', {
        context: { phase: 'validating' },
      });
    }
    const page = raw as Record<string, unknown>;
    const items = page['items'];
    if (!Array.isArray(items)) {
      throw new DetectionError('enumerator-failed', 'page response missing items array', {
        context: { phase: 'validating' },
      });
    }
    const totalLength = page['totalLength'];
    if (typeof totalLength !== 'number' || !Number.isInteger(totalLength) || totalLength < 0) {
      throw new DetectionError(
        'enumerator-failed',
        `page response has invalid totalLength: ${String(totalLength)}`,
        { context: { phase: 'validating' } },
      );
    }
    return { items, totalLength };
  }

  private isLocalFile(item: unknown): boolean {
    if (typeof item !== 'object' || item === null) return false;
    const uri = (item as Record<string, unknown>)['uri'];
    return typeof uri === 'string' && uri.startsWith('spotify:local:');
  }

  private parseItem(item: unknown, position: number): RawTrack {
    return parseLibraryTrackItem(item, position);
  }

  private looksLikeAuthExpired(cause: unknown): boolean {
    if (typeof cause !== 'object' || cause === null) return false;
    const status = (cause as { status?: unknown }).status;
    if (status === 401) return true;
    const message = (cause as { message?: unknown }).message;
    if (typeof message !== 'string') return false;
    const lower = message.toLowerCase();
    if (lower.includes('401')) return true;
    return lower.includes('token') && (lower.includes('expired') || lower.includes('invalid'));
  }
}
