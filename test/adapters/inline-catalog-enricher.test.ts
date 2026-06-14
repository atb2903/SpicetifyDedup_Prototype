/**
 * Tests for `InlineCatalogEnricher` — the pure-local `CatalogEnricher`.
 *
 * Verifies the contract: empty-input invariant, enriched/unenriched slot
 * construction from inline `RawTrack.durationMs`, abort semantics (before
 * start and between chunks), per-chunk progress events, and chunk boundaries
 * (1, 200, 201 tracks).
 */
import { describe, it, expect, vi } from 'vitest';
import { InlineCatalogEnricher } from '../../src/adapters/inline-catalog-enricher';
import type { EnrichmentSlot } from '../../src/ports/catalog-enricher';
import type { RawTrack, ProgressEvent } from '../../src/domain/detection-types';

function makeRawTrack(i: number, durationMs: number | null = 100000 + i): RawTrack {
  return {
    uri: `spotify:track:TRACK${i.toString().padStart(4, '0')}`,
    id: `TRACK${i.toString().padStart(4, '0')}`,
    name: `Track ${i}`,
    artists: [{ uri: `spotify:artist:ART${i}`, name: `Artist ${i}` }],
    album: { uri: `spotify:album:ALB${i}`, name: `Album ${i}` },
    position: i,
    durationMs,
  };
}

function makeRawTracks(count: number): RawTrack[] {
  return Array.from({ length: count }, (_, i) => makeRawTrack(i));
}

describe('InlineCatalogEnricher', () => {
  it('returns [] for empty input without emitting progress', async () => {
    const enricher = new InlineCatalogEnricher();
    const onProgress = vi.fn();
    const result = await enricher.enrich([], new AbortController().signal, onProgress);
    expect(result).toEqual([]);
    expect(onProgress).not.toHaveBeenCalled();
  });

  it('builds an enriched slot for every track with a non-null durationMs', async () => {
    const enricher = new InlineCatalogEnricher();
    const tracks = makeRawTracks(3);
    const onProgress = vi.fn();
    const result = await enricher.enrich(tracks, new AbortController().signal, onProgress);

    expect(result).toHaveLength(3);
    result.forEach((slot, i) => {
      expect(slot.kind).toBe('enriched');
      if (slot.kind !== 'enriched') throw new Error('unreachable');
      expect(slot.track).toEqual({
        position: i,
        uri: tracks[i]!.uri,
        canonicalUri: tracks[i]!.uri,
        name: tracks[i]!.name,
        artists: [{ name: `Artist ${i}` }],
        durationMs: tracks[i]!.durationMs,
      });
    });
  });

  it('propagates a non-empty uid onto the enriched track (ADR-0012)', async () => {
    const enricher = new InlineCatalogEnricher();
    const track: RawTrack = { ...makeRawTrack(0), uid: '610a666b423c78e4' };
    const result = await enricher.enrich([track], new AbortController().signal, vi.fn());
    const slot = result[0] as Extract<EnrichmentSlot, { kind: 'enriched' }>;
    expect(slot.kind).toBe('enriched');
    expect(slot.track.uid).toBe('610a666b423c78e4');
  });

  it('leaves uid absent on the enriched track for a Liked-Songs RawTrack (no fabrication)', async () => {
    const enricher = new InlineCatalogEnricher();
    // makeRawTrack() builds no uid — the Liked-Songs origin shape.
    const result = await enricher.enrich([makeRawTrack(0)], new AbortController().signal, vi.fn());
    const slot = result[0] as Extract<EnrichmentSlot, { kind: 'enriched' }>;
    expect(slot.kind).toBe('enriched');
    expect(slot.track.uid).toBeUndefined();
    expect('uid' in slot.track).toBe(false);
  });

  it('maps artists to name-only entries (drops uri)', async () => {
    const enricher = new InlineCatalogEnricher();
    const track: RawTrack = {
      ...makeRawTrack(0),
      artists: [
        { uri: 'spotify:artist:A', name: 'Alpha' },
        { uri: 'spotify:artist:B', name: 'Beta' },
      ],
    };
    const result = await enricher.enrich([track], new AbortController().signal, vi.fn());
    const slot = result[0] as Extract<EnrichmentSlot, { kind: 'enriched' }>;
    expect(slot.track.artists).toEqual([{ name: 'Alpha' }, { name: 'Beta' }]);
  });

  it('builds an unenriched slot for tracks with durationMs === null', async () => {
    const enricher = new InlineCatalogEnricher();
    const tracks = [makeRawTrack(0, 123000), makeRawTrack(1, null), makeRawTrack(2, 456000)];
    const onProgress = vi.fn();
    const result = await enricher.enrich(tracks, new AbortController().signal, onProgress);

    expect(result[0]!.kind).toBe('enriched');
    expect(result[1]).toEqual({ kind: 'unenriched', position: 1, rawUri: tracks[1]!.uri });
    expect(result[2]!.kind).toBe('enriched');
  });

  it('throws AbortError when the signal is already aborted before start', async () => {
    const enricher = new InlineCatalogEnricher();
    const controller = new AbortController();
    controller.abort();
    await expect(
      enricher.enrich(makeRawTracks(3), controller.signal, vi.fn()),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('throws AbortError between chunks when the signal aborts mid-iteration', async () => {
    const enricher = new InlineCatalogEnricher();
    // 201 tracks => 2 chunks (200 + 1). Abort fires after the first chunk's
    // progress event so the second-chunk guard throws.
    const tracks = makeRawTracks(201);
    const controller = new AbortController();
    const onProgress = vi.fn((_event: ProgressEvent) => {
      // Abort right after the first chunk reports progress.
      controller.abort();
    });
    await expect(
      enricher.enrich(tracks, controller.signal, onProgress),
    ).rejects.toMatchObject({ name: 'AbortError' });
    // Only the first chunk's progress event fired before the abort.
    expect(onProgress).toHaveBeenCalledTimes(1);
  });

  it('emits one progress event per chunk with correct processed/total', async () => {
    const enricher = new InlineCatalogEnricher();
    const tracks = makeRawTracks(450); // 3 chunks: 200, 200, 50
    const events: ProgressEvent[] = [];
    await enricher.enrich(tracks, new AbortController().signal, (e) => events.push(e));
    expect(events).toEqual([
      { stage: 'enriching', processed: 200, total: 450 },
      { stage: 'enriching', processed: 400, total: 450 },
      { stage: 'enriching', processed: 450, total: 450 },
    ]);
  });

  it('handles exactly 1 track (single chunk)', async () => {
    const enricher = new InlineCatalogEnricher();
    const events: ProgressEvent[] = [];
    const result = await enricher.enrich(makeRawTracks(1), new AbortController().signal, (e) =>
      events.push(e),
    );
    expect(result).toHaveLength(1);
    expect(events).toEqual([{ stage: 'enriching', processed: 1, total: 1 }]);
  });

  it('handles exactly 200 tracks (one full chunk)', async () => {
    const enricher = new InlineCatalogEnricher();
    const events: ProgressEvent[] = [];
    const result = await enricher.enrich(makeRawTracks(200), new AbortController().signal, (e) =>
      events.push(e),
    );
    expect(result).toHaveLength(200);
    expect(events).toEqual([{ stage: 'enriching', processed: 200, total: 200 }]);
  });

  it('handles 201 tracks (two chunks: 200 + 1)', async () => {
    const enricher = new InlineCatalogEnricher();
    const events: ProgressEvent[] = [];
    const result = await enricher.enrich(makeRawTracks(201), new AbortController().signal, (e) =>
      events.push(e),
    );
    expect(result).toHaveLength(201);
    expect(events).toEqual([
      { stage: 'enriching', processed: 200, total: 201 },
      { stage: 'enriching', processed: 201, total: 201 },
    ]);
  });
});
