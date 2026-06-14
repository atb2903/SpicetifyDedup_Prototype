/**
 * Production `CatalogEnricher` adapter — pure local transform.
 *
 * The Spotify desktop client's internal `LibraryAPI.getTracks` /
 * `PlaylistAPI.getContents` already return each track's duration inline as
 * `duration.milliseconds`, which the enumerator maps onto `RawTrack.durationMs`.
 * Live verification proved the public `api.spotify.com` path is unreachable
 * from the client (cold `429` even on `/v1/me`), so catalog enrichment is done
 * here entirely off the enumeration data — no network, no timers, no globals.
 *
 * Responsibilities:
 *   1. Empty-input guard (resolves `[]` immediately, no progress event).
 *   2. Abort guard before start and before each chunk.
 *   3. Per `RawTrack`: build an `enriched` slot when `durationMs` is present,
 *      otherwise an `unenriched` slot. `canonicalUri` falls back to the track's
 *      own `uri` — the inline shape carries no `linked_from` (accepted tradeoff).
 *   4. Emit one `{ stage: 'enriching', processed, total }` progress event per
 *      completed chunk.
 *
 * Conforms to the `CatalogEnricher` port unchanged; the composition adapter,
 * store, UI, and detector are untouched by the swap.
 */
import type { CatalogEnricher, EnrichmentSlot } from '../ports/catalog-enricher';
import type { RawTrack, ProgressEvent } from '../domain/detection-types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Number of tracks processed per chunk before emitting a progress event.
 * Purely a progress-granularity / abort-responsiveness knob — the transform
 * itself is synchronous and has no per-call host constraint.
 */
const CHUNK_SIZE = 200;

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

/**
 * Pure-local implementation of `CatalogEnricher`.
 *
 * Builds `EnrichedTrack` slots from the inline duration carried on each
 * `RawTrack`. Performs no network I/O, sets no timers, and reads no globals.
 */
export class InlineCatalogEnricher implements CatalogEnricher {
  /**
   * Enrich every track in `tracks` from its inline `durationMs`.
   *
   * Tracks with a non-null `durationMs` yield an `enriched` slot whose
   * `canonicalUri` equals the track's own `uri` (no `linked_from` inline).
   * Tracks with `durationMs === null` yield an `unenriched` slot.
   *
   * @param tracks - `RawTrack[]` from the enumerator. Order is preserved in
   *   the returned array (`result[i]` corresponds to `tracks[i]`).
   * @param signal - Fires `'abort'` when the caller cancels. Checked before
   *   the first chunk and before each subsequent chunk.
   * @param onProgress - Invoked once per completed chunk with
   *   `{ stage: 'enriching', processed, total }`.
   * @returns Promise resolving with an `EnrichmentSlot[]` of the same length
   *   as `tracks`, aligned by position.
   * @throws `DOMException('AbortError')` when `signal` aborts before start or
   *   between chunks.
   */
  async enrich(
    tracks: ReadonlyArray<RawTrack>,
    signal: AbortSignal,
    onProgress: (event: ProgressEvent) => void,
  ): Promise<ReadonlyArray<EnrichmentSlot>> {
    // Empty-input invariant: no work, no progress event.
    if (tracks.length === 0) {
      return [];
    }

    // Immediate abort guard.
    if (signal.aborted) {
      throw new DOMException('Enrichment aborted before start', 'AbortError');
    }

    const total = tracks.length;
    const slots: EnrichmentSlot[] = [];
    let processed = 0;

    for (let chunkStart = 0; chunkStart < total; chunkStart += CHUNK_SIZE) {
      // Abort check before each chunk.
      if (signal.aborted) {
        throw new DOMException('Enrichment aborted between chunks', 'AbortError');
      }

      const chunkEnd = Math.min(chunkStart + CHUNK_SIZE, total);
      for (let i = chunkStart; i < chunkEnd; i++) {
        const t = tracks[i]!;
        if (t.durationMs !== null) {
          slots.push({
            kind: 'enriched',
            track: {
              position: t.position,
              uri: t.uri,
              canonicalUri: t.uri,
              name: t.name,
              artists: t.artists.map((a) => ({ name: a.name })),
              durationMs: t.durationMs,
              // Preserve the playlist occurrence id verbatim (ADR-0012). Added
              // only when defined so Liked-Songs tracks keep `uid` absent —
              // never fabricated — matching the enumerator's convention.
              ...(t.uid !== undefined ? { uid: t.uid } : {}),
            },
          });
        } else {
          slots.push({ kind: 'unenriched', position: t.position, rawUri: t.uri });
        }
      }

      processed = chunkEnd;
      onProgress({ stage: 'enriching', processed, total });
    }

    return slots;
  }
}
