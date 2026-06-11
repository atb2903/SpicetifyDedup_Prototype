/**
 * Fail-loud parser and classifier predicate for the catalog → algorithm
 * boundary.
 *
 * `asEnrichedTrack` validates a raw catalog response object and returns a
 * fully-typed `EnrichedTrack`. On any validation failure it throws a typed
 * `DetectionError('malformed-enrichment-payload', …)` (NFR-008).
 *
 * `isEnrichedTrack` is the paired classifier predicate that lets callers
 * pre-check a value without catching an exception.
 *
 * Architectural constraint: this module may only import from `src/domain/`.
 * No React, no Zustand, no adapters, no Spicetify.
 */

import type { EnrichedTrack } from './detection-types';
import { DetectionError } from './detection-errors';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Regex for a valid Spotify track URI. */
const TRACK_URI_RE = /^spotify:track:[A-Za-z0-9]+$/;

/**
 * Throw a `DetectionError('malformed-enrichment-payload', …)` with the given
 * message and attach `position` + `missingField` to the error context.
 */
function throwMalformed(
  message: string,
  position: number,
  missingField: string,
  cause?: unknown,
): never {
  throw new DetectionError('malformed-enrichment-payload', message, {
    cause,
    context: { position, missingField },
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a raw catalog response object into a fully-typed `EnrichedTrack`.
 *
 * Validates every field against the rules in data-model §1.2:
 * - `uri` — string matching `/^spotify:track:[A-Za-z0-9]+$/`.
 * - `name` — any string (may be empty).
 * - `artists` — non-empty array; first entry must have a non-empty `name`.
 * - `duration_ms` — non-negative integer.
 * - `linked_from?.uri` — if present, must match the track-URI pattern.
 *
 * `canonicalUri` is set to `linked_from.uri` when present; otherwise `uri`.
 *
 * @param input - Raw catalog response object (the shape from the `/v1/tracks` endpoint).
 * @param position - The `RawTrack.position` of the originating track; forwarded to the
 *   returned `EnrichedTrack` and attached to any error context.
 * @returns A fully-typed `EnrichedTrack`.
 * @throws {DetectionError} With `reason === 'malformed-enrichment-payload'` on any
 *   validation failure. The error's `context` carries `{ position, missingField }`.
 */
export function asEnrichedTrack(input: unknown, position: number): EnrichedTrack {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throwMalformed(
      `Expected a non-null object at position ${position}; got ${input === null ? 'null' : typeof input}`,
      position,
      'input',
    );
  }

  const raw = input as Record<string, unknown>;

  // --- uri ---
  if (typeof raw['uri'] !== 'string' || !TRACK_URI_RE.test(raw['uri'] as string)) {
    throwMalformed(
      `Invalid or missing 'uri' at position ${position}: ${JSON.stringify(raw['uri'])}`,
      position,
      'uri',
    );
  }
  const uri = raw['uri'] as string;

  // --- name ---
  if (typeof raw['name'] !== 'string') {
    throwMalformed(
      `Invalid or missing 'name' at position ${position}: ${JSON.stringify(raw['name'])}`,
      position,
      'name',
    );
  }
  const name = raw['name'] as string;

  // --- artists ---
  const rawArtists = raw['artists'];
  if (
    !Array.isArray(rawArtists) ||
    rawArtists.length === 0 ||
    typeof (rawArtists as unknown[])[0] !== 'object' ||
    (rawArtists as unknown[])[0] === null ||
    typeof ((rawArtists as Record<string, unknown>[])[0] as Record<string, unknown>)['name'] !==
      'string' ||
    (
      (rawArtists as Record<string, unknown>[])[0] as Record<string, unknown>
    )['name'] === ''
  ) {
    throwMalformed(
      `Invalid or missing 'artists' at position ${position}: must be a non-empty array with a non-empty first artist name`,
      position,
      'artists',
    );
  }
  const artists = (rawArtists as Record<string, unknown>[]).map((a) => ({
    name: String(a['name']),
  }));

  // --- duration_ms ---
  const rawDuration = raw['duration_ms'];
  if (
    typeof rawDuration !== 'number' ||
    !Number.isInteger(rawDuration) ||
    rawDuration < 0
  ) {
    throwMalformed(
      `Invalid or missing 'duration_ms' at position ${position}: must be a non-negative integer, got ${JSON.stringify(rawDuration)}`,
      position,
      'duration_ms',
    );
  }
  const durationMs = rawDuration as number;

  // --- linked_from?.uri ---
  let canonicalUri = uri;
  if ('linked_from' in raw && raw['linked_from'] !== undefined && raw['linked_from'] !== null) {
    const linkedFrom = raw['linked_from'] as Record<string, unknown>;
    if (
      typeof linkedFrom !== 'object' ||
      Array.isArray(linkedFrom) ||
      typeof linkedFrom['uri'] !== 'string' ||
      !TRACK_URI_RE.test(linkedFrom['uri'] as string)
    ) {
      throwMalformed(
        `Invalid 'linked_from.uri' at position ${position}: must match the track-URI pattern, got ${JSON.stringify(linkedFrom?.['uri'])}`,
        position,
        'linked_from',
      );
    }
    canonicalUri = linkedFrom['uri'] as string;
  }

  return { position, uri, canonicalUri, name, artists, durationMs };
}

/**
 * Classifier predicate for `EnrichedTrack`. Returns `true` iff `x` has the
 * shape of a valid `EnrichedTrack` (same rules as `asEnrichedTrack`, but never
 * throws — returns `false` on any violation instead).
 *
 * Use this to pre-check values when you want to branch rather than try/catch.
 *
 * @param x - Any value.
 * @returns `true` iff `x` satisfies every `EnrichedTrack` constraint.
 */
export function isEnrichedTrack(x: unknown): x is EnrichedTrack {
  if (x === null || typeof x !== 'object' || Array.isArray(x)) return false;
  const t = x as Record<string, unknown>;

  if (typeof t['position'] !== 'number' || !Number.isInteger(t['position']) || (t['position'] as number) < 0)
    return false;
  if (typeof t['uri'] !== 'string' || !TRACK_URI_RE.test(t['uri'] as string)) return false;
  if (typeof t['canonicalUri'] !== 'string' || !TRACK_URI_RE.test(t['canonicalUri'] as string))
    return false;
  if (typeof t['name'] !== 'string') return false;

  const artists = t['artists'];
  if (
    !Array.isArray(artists) ||
    artists.length === 0 ||
    typeof (artists as unknown[])[0] !== 'object' ||
    (artists as unknown[])[0] === null ||
    typeof ((artists as Record<string, unknown>[])[0] as Record<string, unknown>)['name'] !==
      'string' ||
    (
      (artists as Record<string, unknown>[])[0] as Record<string, unknown>
    )['name'] === ''
  )
    return false;

  if (
    typeof t['durationMs'] !== 'number' ||
    !Number.isInteger(t['durationMs'] as number) ||
    (t['durationMs'] as number) < 0
  )
    return false;

  return true;
}
