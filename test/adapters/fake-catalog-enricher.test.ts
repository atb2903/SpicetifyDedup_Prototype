/**
 * Unit tests for `FakeCatalogEnricher`.
 *
 * Verifies the test-double contract: batching, progress events, force-modes,
 * abort positions, order alignment, and empty-input invariant.
 */
import { describe, it, expect, vi } from 'vitest';
import { FakeCatalogEnricher } from '../../src/adapters/fake-catalog-enricher';
import type { RawTrack, EnrichedTrack } from '../../src/domain/detection-types';
import { DetectionError } from '../../src/domain/detection-errors';
import type { EnrichmentSlot } from '../../src/ports/catalog-enricher';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRawTrack(i: number): RawTrack {
  return {
    uri: `spotify:track:TRACK${i.toString().padStart(4, '0')}`,
    id: `TRACK${i.toString().padStart(4, '0')}`,
    name: `Track ${i}`,
    artists: [{ uri: `spotify:artist:ART${i}`, name: `Artist ${i}` }],
    album: { uri: `spotify:album:ALB${i}`, name: `Album ${i}` },
    position: i,
  };
}

function makeRawTracks(count: number): RawTrack[] {
  return Array.from({ length: count }, (_, i) => makeRawTrack(i));
}

function makeEnrichedTrack(i: number): EnrichedTrack {
  const id = `TRACK${i.toString().padStart(4, '0')}`;
  return {
    position: i,
    uri: `spotify:track:${id}`,
    canonicalUri: `spotify:track:${id}`,
    name: `Track ${i}`,
    artists: [{ name: `Artist ${i}` }],
    durationMs: 180000 + i,
  };
}

function makeCatalog(
  tracks: RawTrack[],
  nullIndices: Set<number> = new Set(),
): ReadonlyMap<string, EnrichedTrack | null> {
  return new Map(
    tracks.map((t, i) => [
      t.id,
      nullIndices.has(i) ? null : makeEnrichedTrack(t.position),
    ]),
  );
}

function neverAborted(): AbortSignal {
  return new AbortController().signal;
}

// ---------------------------------------------------------------------------
// Empty input invariant
// ---------------------------------------------------------------------------

describe('FakeCatalogEnricher — empty input', () => {
  it('resolves with [] immediately, emits no progress event', async () => {
    const onProgress = vi.fn();
    const enricher = new FakeCatalogEnricher({
      catalog: new Map(),
    });
    const result = await enricher.enrich([], neverAborted(), onProgress);
    expect(result).toEqual([]);
    expect(onProgress).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Single batch
// ---------------------------------------------------------------------------

describe('FakeCatalogEnricher — single batch', () => {
  it('10 tracks, batchSize=50 → 1 progress event', async () => {
    const tracks = makeRawTracks(10);
    const catalog = makeCatalog(tracks);
    const onProgress = vi.fn();
    const enricher = new FakeCatalogEnricher({ catalog, batchSize: 50 });
    await enricher.enrich(tracks, neverAborted(), onProgress);
    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenCalledWith({
      stage: 'enriching',
      processed: 10,
      total: 10,
    });
  });
});

// ---------------------------------------------------------------------------
// Multi-batch
// ---------------------------------------------------------------------------

describe('FakeCatalogEnricher — multi-batch', () => {
  it('120 tracks, batchSize=50 → 3 progress events with cumulative slot counts', async () => {
    const tracks = makeRawTracks(120);
    const catalog = makeCatalog(tracks);
    const events: Array<{ processed: number; total: number }> = [];
    const onProgress = vi.fn((e) =>
      events.push({ processed: e.processed, total: e.total }),
    );
    const enricher = new FakeCatalogEnricher({ catalog, batchSize: 50 });
    await enricher.enrich(tracks, neverAborted(), onProgress);
    expect(onProgress).toHaveBeenCalledTimes(3);
    expect(events[0]).toEqual({ processed: 50, total: 120 });
    expect(events[1]).toEqual({ processed: 100, total: 120 });
    expect(events[2]).toEqual({ processed: 120, total: 120 });
  });

  it('returns all slots in order', async () => {
    const tracks = makeRawTracks(120);
    const catalog = makeCatalog(tracks);
    const enricher = new FakeCatalogEnricher({ catalog, batchSize: 50 });
    const result = await enricher.enrich(tracks, neverAborted(), vi.fn());
    expect(result).toHaveLength(120);
    result.forEach((slot, i) => {
      expect(slot.kind).toBe('enriched');
    });
  });
});

// ---------------------------------------------------------------------------
// null catalog entries → unenriched slots
// ---------------------------------------------------------------------------

describe('FakeCatalogEnricher — null catalog entries', () => {
  it('null in catalog → returns unenriched slot with correct position and rawUri', async () => {
    const tracks = makeRawTracks(3);
    const catalog = makeCatalog(tracks, new Set([1])); // index 1 is null
    const enricher = new FakeCatalogEnricher({ catalog, batchSize: 50 });
    const result = await enricher.enrich(tracks, neverAborted(), vi.fn());
    expect(result).toHaveLength(3);
    expect(result[0]!.kind).toBe('enriched');
    expect(result[1]!.kind).toBe('unenriched');
    const unenriched = result[1] as Extract<EnrichmentSlot, { kind: 'unenriched' }>;
    expect(unenriched.position).toBe(tracks[1]!.position);
    expect(unenriched.rawUri).toBe(tracks[1]!.uri);
    expect(result[2]!.kind).toBe('enriched');
  });
});

// ---------------------------------------------------------------------------
// Unknown ID (not in map) → unenriched
// ---------------------------------------------------------------------------

describe('FakeCatalogEnricher — unknown id', () => {
  it('id not in catalog map → treated as unenriched', async () => {
    const tracks = makeRawTracks(2);
    // Only put track 0 in the catalog; track 1 is absent.
    const catalog = new Map<string, EnrichedTrack | null>([
      [tracks[0]!.id, makeEnrichedTrack(0)],
    ]);
    const enricher = new FakeCatalogEnricher({ catalog, batchSize: 50 });
    const result = await enricher.enrich(tracks, neverAborted(), vi.fn());
    expect(result).toHaveLength(2);
    expect(result[0]!.kind).toBe('enriched');
    expect(result[1]!.kind).toBe('unenriched');
  });
});

// ---------------------------------------------------------------------------
// Order alignment: result[i] corresponds to tracks[i]
// ---------------------------------------------------------------------------

describe('FakeCatalogEnricher — order alignment', () => {
  it('result[i] corresponds to tracks[i]', async () => {
    const tracks = makeRawTracks(5);
    const catalog = makeCatalog(tracks, new Set([2])); // index 2 is null
    const enricher = new FakeCatalogEnricher({ catalog, batchSize: 50 });
    const result = await enricher.enrich(tracks, neverAborted(), vi.fn());
    expect(result).toHaveLength(5);
    for (let i = 0; i < 5; i++) {
      const slot = result[i]!;
      if (i === 2) {
        expect(slot.kind).toBe('unenriched');
        const u = slot as Extract<EnrichmentSlot, { kind: 'unenriched' }>;
        expect(u.position).toBe(tracks[i]!.position);
      } else {
        expect(slot.kind).toBe('enriched');
        const e = slot as Extract<EnrichmentSlot, { kind: 'enriched' }>;
        expect(e.track.position).toBe(tracks[i]!.position);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Force modes
// ---------------------------------------------------------------------------

describe('FakeCatalogEnricher — force auth-expired', () => {
  it('throws DetectionError(auth-token-expired) immediately', async () => {
    const tracks = makeRawTracks(5);
    const enricher = new FakeCatalogEnricher({
      catalog: new Map(),
      forceMode: 'auth-expired',
    });
    await expect(
      enricher.enrich(tracks, neverAborted(), vi.fn()),
    ).rejects.toSatisfy(
      (e: unknown) =>
        e instanceof DetectionError && e.reason === 'auth-token-expired',
    );
  });
});

describe('FakeCatalogEnricher — force rate-limit-unparseable after 2 batches', () => {
  it('first 2 batches succeed, 3rd batch throws', async () => {
    const tracks = makeRawTracks(150); // 3 batches of 50
    const catalog = makeCatalog(tracks);
    const events: unknown[] = [];
    const onProgress = vi.fn((e) => events.push(e));
    const enricher = new FakeCatalogEnricher({
      catalog,
      batchSize: 50,
      forceMode: 'rate-limit-unparseable',
      forceAfterBatches: 2,
    });
    await expect(
      enricher.enrich(tracks, neverAborted(), onProgress),
    ).rejects.toSatisfy(
      (e: unknown) =>
        e instanceof DetectionError && e.reason === 'rate-limit-unparseable',
    );
    // First 2 batches emitted progress, 3rd threw before emitting.
    expect(onProgress).toHaveBeenCalledTimes(2);
  });
});

describe('FakeCatalogEnricher — force shape-drift', () => {
  it('throws DetectionError(malformed-enrichment-payload) immediately', async () => {
    const tracks = makeRawTracks(5);
    const enricher = new FakeCatalogEnricher({
      catalog: new Map(),
      forceMode: 'shape-drift',
    });
    await expect(
      enricher.enrich(tracks, neverAborted(), vi.fn()),
    ).rejects.toSatisfy(
      (e: unknown) =>
        e instanceof DetectionError &&
        e.reason === 'malformed-enrichment-payload',
    );
  });
});

// ---------------------------------------------------------------------------
// Abort positions
// ---------------------------------------------------------------------------

describe('FakeCatalogEnricher — abort before first batch', () => {
  it('throws AbortError, emits no progress', async () => {
    const tracks = makeRawTracks(10);
    const catalog = makeCatalog(tracks);
    const onProgress = vi.fn();
    const controller = new AbortController();
    controller.abort();
    const enricher = new FakeCatalogEnricher({ catalog, batchSize: 50 });
    await expect(
      enricher.enrich(tracks, controller.signal, onProgress),
    ).rejects.toSatisfy(
      (e: unknown) =>
        e instanceof DOMException && e.name === 'AbortError',
    );
    expect(onProgress).not.toHaveBeenCalled();
  });
});

describe('FakeCatalogEnricher — abort mid-stream', () => {
  it('first batch resolves, second batch signal check throws AbortError', async () => {
    const tracks = makeRawTracks(100); // 2 batches of 50
    const catalog = makeCatalog(tracks);
    const controller = new AbortController();
    const events: unknown[] = [];
    const onProgress = vi.fn((e) => {
      events.push(e);
      // Abort after first batch's progress event.
      if (events.length === 1) {
        controller.abort();
      }
    });
    const enricher = new FakeCatalogEnricher({ catalog, batchSize: 50 });
    await expect(
      enricher.enrich(tracks, controller.signal, onProgress),
    ).rejects.toSatisfy(
      (e: unknown) =>
        e instanceof DOMException && e.name === 'AbortError',
    );
    // First batch completed (progress emitted), second batch threw on signal check.
    expect(onProgress).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Default batchSize
// ---------------------------------------------------------------------------

describe('FakeCatalogEnricher — default batchSize', () => {
  it('uses batchSize=50 by default: 120 tracks → 3 batches', async () => {
    const tracks = makeRawTracks(120);
    const catalog = makeCatalog(tracks);
    const onProgress = vi.fn();
    const enricher = new FakeCatalogEnricher({ catalog });
    await enricher.enrich(tracks, neverAborted(), onProgress);
    expect(onProgress).toHaveBeenCalledTimes(3);
  });
});
