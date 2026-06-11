/**
 * Unit tests for `createDetectionScanner` (the pure composition adapter).
 *
 * All tests use `FakeTracksEnumerator` + `FakeCatalogEnricher` — no host calls.
 * Covers: happy paths, abort positions (before/between/during), error pass-through,
 * determinism, clock injection, skippedLocalCount, unenrichedCount, and the
 * Spicetify spot-check.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { createDetectionScanner } from '../../src/adapters/detection-scanner';
import { FakeTracksEnumerator } from '../../src/adapters/fake-tracks-enumerator';
import { FakeCatalogEnricher } from '../../src/adapters/fake-catalog-enricher';
import type { RawTrack, EnrichedTrack, ScanRequest, ProgressEvent } from '../../src/domain/detection-types';
import { DetectionError } from '../../src/domain/detection-errors';
import type { EnrichmentSlot } from '../../src/ports/catalog-enricher';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LIKED_SONGS_REQUEST: ScanRequest = { kind: 'liked-songs' };
const PLAYLIST_REQUEST: ScanRequest = {
  kind: 'playlist',
  playlistUri: 'spotify:playlist:TEST001',
};

function neverAborted(): AbortSignal {
  return new AbortController().signal;
}

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

function makeEnrichedTrack(raw: RawTrack, overrides: Partial<EnrichedTrack> = {}): EnrichedTrack {
  return {
    position: raw.position,
    uri: raw.uri,
    canonicalUri: raw.uri,
    name: raw.name,
    artists: [{ name: raw.artists[0]!.name }],
    durationMs: 180000,
    ...overrides,
  };
}

/** Build a catalog map for a set of raw tracks. nullIds are returned as null. */
function buildCatalog(
  tracks: RawTrack[],
  nullIds: Set<string> = new Set(),
  overrides: Map<string, EnrichedTrack> = new Map(),
): ReadonlyMap<string, EnrichedTrack | null> {
  return new Map(
    tracks.map((t) => {
      if (nullIds.has(t.id)) return [t.id, null];
      if (overrides.has(t.id)) return [t.id, overrides.get(t.id)!];
      return [t.id, makeEnrichedTrack(t)];
    }),
  );
}

// ---------------------------------------------------------------------------
// §1 — Empty enumeration
// ---------------------------------------------------------------------------

describe('createDetectionScanner — empty enumeration', () => {
  it('returns empty result, no enriching or matching events', async () => {
    const events: ProgressEvent[] = [];
    const onProgress = vi.fn((e: ProgressEvent) => events.push(e));
    const scanner = createDetectionScanner(
      new FakeTracksEnumerator({ tracks: [] }),
      new FakeCatalogEnricher({ catalog: new Map() }),
    );
    const result = await scanner.scan(LIKED_SONGS_REQUEST, neverAborted(), onProgress);
    expect(result.collectionKey).toBe('liked-songs');
    expect(result.groups).toEqual([]);
    expect(result.duplicateTrackCount).toBe(0);
    expect(result.removableTrackCount).toBe(0);
    expect(result.scannedTrackCount).toBe(0);
    expect(result.unenrichedCount).toBe(0);
    expect(result.skippedLocalCount).toBe(0);
    // No enriching or matching events should have been emitted.
    const enrichingOrMatching = events.filter(
      (e) => e.stage === 'enriching' || e.stage === 'matching',
    );
    expect(enrichingOrMatching).toHaveLength(0);
  });

  it('collectionKey is playlist URI for playlist request', async () => {
    const scanner = createDetectionScanner(
      new FakeTracksEnumerator({ tracks: [] }),
      new FakeCatalogEnricher({ catalog: new Map() }),
    );
    const result = await scanner.scan(PLAYLIST_REQUEST, neverAborted(), vi.fn());
    expect(result.collectionKey).toBe('spotify:playlist:TEST001');
  });
});

// ---------------------------------------------------------------------------
// §2 — 1 group across 2 tracks
// ---------------------------------------------------------------------------

describe('createDetectionScanner — 1 group from 2 duplicate tracks', () => {
  it('result has 1 group, duplicateTrackCount=2, removableTrackCount=1', async () => {
    const raw0 = makeRawTrack(0);
    const raw1 = makeRawTrack(1);
    const tracks = [raw0, raw1];
    // Same canonical URI → same-canonical-uri group.
    const enriched0 = makeEnrichedTrack(raw0, { canonicalUri: 'spotify:track:CANONICAL' });
    const enriched1 = makeEnrichedTrack(raw1, { uri: raw1.uri, canonicalUri: 'spotify:track:CANONICAL' });
    const catalog = new Map<string, EnrichedTrack | null>([
      [raw0.id, enriched0],
      [raw1.id, enriched1],
    ]);
    const scanner = createDetectionScanner(
      new FakeTracksEnumerator({ tracks }),
      new FakeCatalogEnricher({ catalog }),
    );
    const result = await scanner.scan(LIKED_SONGS_REQUEST, neverAborted(), vi.fn());
    expect(result.groups).toHaveLength(1);
    expect(result.duplicateTrackCount).toBe(2);
    expect(result.removableTrackCount).toBe(1);
    expect(result.scannedTrackCount).toBe(2);
    expect(result.unenrichedCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// §3 — Multiple groups
// ---------------------------------------------------------------------------

describe('createDetectionScanner — multiple groups', () => {
  it('groups are ordered by first-member position', async () => {
    // Two pairs:
    //   pair A: tracks at positions 0 + 1 (same canonical URI)
    //   pair B: tracks at positions 2 + 3 (same canonical URI)
    const tracks = [makeRawTrack(0), makeRawTrack(1), makeRawTrack(2), makeRawTrack(3)];
    const enrichA = makeEnrichedTrack(tracks[0]!, { canonicalUri: 'spotify:track:CANA' });
    const enrichA1 = makeEnrichedTrack(tracks[1]!, { canonicalUri: 'spotify:track:CANA' });
    const enrichB = makeEnrichedTrack(tracks[2]!, { canonicalUri: 'spotify:track:CANB' });
    const enrichB1 = makeEnrichedTrack(tracks[3]!, { canonicalUri: 'spotify:track:CANB' });
    const catalog = new Map<string, EnrichedTrack | null>([
      [tracks[0]!.id, enrichA],
      [tracks[1]!.id, enrichA1],
      [tracks[2]!.id, enrichB],
      [tracks[3]!.id, enrichB1],
    ]);
    const scanner = createDetectionScanner(
      new FakeTracksEnumerator({ tracks }),
      new FakeCatalogEnricher({ catalog }),
    );
    const result = await scanner.scan(LIKED_SONGS_REQUEST, neverAborted(), vi.fn());
    expect(result.groups).toHaveLength(2);
    // Group 0 has members from position 0 and 1; group 1 from 2 and 3.
    expect(result.groups[0]!.members[0]!.position).toBe(0);
    expect(result.groups[1]!.members[0]!.position).toBe(2);
    expect(result.duplicateTrackCount).toBe(4);
    expect(result.removableTrackCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// §4 — Abort positions
// ---------------------------------------------------------------------------

describe('createDetectionScanner — abort BEFORE enumerate', () => {
  it('throws AbortError; enumerator enumerate never called', async () => {
    const enumeratorSpy = { called: false };
    const fakeEnumerator = new FakeTracksEnumerator({ tracks: [makeRawTrack(0)] });
    const originalEnumerate = fakeEnumerator.enumerate.bind(fakeEnumerator);
    fakeEnumerator.enumerate = vi.fn((...args) => {
      enumeratorSpy.called = true;
      return originalEnumerate(...(args as Parameters<typeof originalEnumerate>));
    });

    const controller = new AbortController();
    controller.abort();

    const scanner = createDetectionScanner(
      fakeEnumerator,
      new FakeCatalogEnricher({ catalog: new Map() }),
    );
    await expect(
      scanner.scan(LIKED_SONGS_REQUEST, controller.signal, vi.fn()),
    ).rejects.toSatisfy(
      (e: unknown) => e instanceof DOMException && e.name === 'AbortError',
    );
    expect(fakeEnumerator.enumerate).not.toHaveBeenCalled();
  });
});

describe('createDetectionScanner — abort BETWEEN enumerate and enrich', () => {
  it('throws AbortError; enricher enrich never called', async () => {
    const track = makeRawTrack(0);
    const catalog = buildCatalog([track]);
    const fakeEnricher = new FakeCatalogEnricher({ catalog });
    const enrichSpy = vi.fn();
    const originalEnrich = fakeEnricher.enrich.bind(fakeEnricher);
    fakeEnricher.enrich = vi.fn((...args) => {
      enrichSpy();
      return originalEnrich(...(args as Parameters<typeof originalEnrich>));
    });

    const controller = new AbortController();

    // Use a fake enumerator that aborts signal AFTER it finishes (simulating
    // abort arriving between enumerate completing and enrich starting).
    const fakeEnumerator = new FakeTracksEnumerator({ tracks: [track] });
    const originalEnumerate = fakeEnumerator.enumerate.bind(fakeEnumerator);
    fakeEnumerator.enumerate = vi.fn(async (...args) => {
      const result = await originalEnumerate(...(args as Parameters<typeof originalEnumerate>));
      // Abort right after enumeration completes.
      controller.abort();
      return result;
    });

    const scanner = createDetectionScanner(fakeEnumerator, fakeEnricher);
    await expect(
      scanner.scan(LIKED_SONGS_REQUEST, controller.signal, vi.fn()),
    ).rejects.toSatisfy(
      (e: unknown) => e instanceof DOMException && e.name === 'AbortError',
    );
    expect(enrichSpy).not.toHaveBeenCalled();
  });
});

describe('createDetectionScanner — abort DURING enrich', () => {
  it('throws AbortError; no matching event emitted', async () => {
    const tracks = [makeRawTrack(0), makeRawTrack(1)];
    const catalog = buildCatalog(tracks);
    const events: ProgressEvent[] = [];
    const onProgress = vi.fn((e: ProgressEvent) => events.push(e));

    const controller = new AbortController();

    // Enricher aborts after processing; using a custom fake enricher that
    // aborts signal during enrichment.
    const fakeEnricher = new FakeCatalogEnricher({ catalog, batchSize: 50 });
    const originalEnrich = fakeEnricher.enrich.bind(fakeEnricher);
    fakeEnricher.enrich = vi.fn(async (ts, sig, onProg) => {
      const result = await originalEnrich(ts, sig, onProg);
      // Abort after enrichment completes (but scanner hasn't checked signal yet).
      controller.abort();
      return result;
    });

    const scanner = createDetectionScanner(
      new FakeTracksEnumerator({ tracks }),
      fakeEnricher,
    );
    await expect(
      scanner.scan(LIKED_SONGS_REQUEST, controller.signal, onProgress),
    ).rejects.toSatisfy(
      (e: unknown) => e instanceof DOMException && e.name === 'AbortError',
    );
    // No matching events should have been emitted.
    const matchingEvents = events.filter((e) => e.stage === 'matching');
    expect(matchingEvents).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// §5 — Error pass-through
// ---------------------------------------------------------------------------

describe('createDetectionScanner — enumerator throws DetectionError', () => {
  it('re-throws unchanged; enricher never called', async () => {
    const fakeEnumerator = new FakeTracksEnumerator({
      tracks: [makeRawTrack(0)],
      failOnFirstPage: true,
    });
    const fakeEnricher = new FakeCatalogEnricher({ catalog: new Map() });
    const enrichSpy = vi.spyOn(fakeEnricher, 'enrich');

    const scanner = createDetectionScanner(fakeEnumerator, fakeEnricher);
    await expect(
      scanner.scan(LIKED_SONGS_REQUEST, neverAborted(), vi.fn()),
    ).rejects.toSatisfy(
      (e: unknown) =>
        e instanceof DetectionError && e.reason === 'enumerator-failed',
    );
    expect(enrichSpy).not.toHaveBeenCalled();
  });
});

describe('createDetectionScanner — enricher throws DetectionError', () => {
  it('re-throws rate-limit-unparseable unchanged', async () => {
    const tracks = [makeRawTrack(0)];
    const fakeEnumerator = new FakeTracksEnumerator({ tracks });
    const fakeEnricher = new FakeCatalogEnricher({
      catalog: new Map(),
      forceMode: 'rate-limit-unparseable',
    });
    const scanner = createDetectionScanner(fakeEnumerator, fakeEnricher);
    await expect(
      scanner.scan(LIKED_SONGS_REQUEST, neverAborted(), vi.fn()),
    ).rejects.toSatisfy(
      (e: unknown) =>
        e instanceof DetectionError && e.reason === 'rate-limit-unparseable',
    );
  });
});

// ---------------------------------------------------------------------------
// §6 — Determinism
// ---------------------------------------------------------------------------

describe('createDetectionScanner — determinism', () => {
  it('same fakes + same input run twice → byte-equivalent DetectionResult.groups', async () => {
    const tracks = [makeRawTrack(0), makeRawTrack(1)];
    const enriched0 = makeEnrichedTrack(tracks[0]!, { canonicalUri: 'spotify:track:CANONLY' });
    const enriched1 = makeEnrichedTrack(tracks[1]!, { canonicalUri: 'spotify:track:CANONLY' });
    const catalog = new Map<string, EnrichedTrack | null>([
      [tracks[0]!.id, enriched0],
      [tracks[1]!.id, enriched1],
    ]);

    const run = async () => {
      const scanner = createDetectionScanner(
        new FakeTracksEnumerator({ tracks }),
        new FakeCatalogEnricher({ catalog }),
      );
      return scanner.scan(LIKED_SONGS_REQUEST, neverAborted(), vi.fn());
    };

    const result1 = await run();
    const result2 = await run();
    // Groups should be structurally identical.
    expect(JSON.stringify(result1.groups)).toBe(JSON.stringify(result2.groups));
  });
});

// ---------------------------------------------------------------------------
// §7 — Clock injection
// ---------------------------------------------------------------------------

describe('createDetectionScanner — clock injection', () => {
  it('result.completedAt equals the injected clock return value', async () => {
    const clock = () => 1234567890;
    const scanner = createDetectionScanner(
      new FakeTracksEnumerator({ tracks: [] }),
      new FakeCatalogEnricher({ catalog: new Map() }),
      clock,
    );
    const result = await scanner.scan(LIKED_SONGS_REQUEST, neverAborted(), vi.fn());
    expect(result.completedAt).toBe(1234567890);
  });
});

// ---------------------------------------------------------------------------
// §8 — skippedLocalCount derivation
// ---------------------------------------------------------------------------

describe('createDetectionScanner — skippedLocalCount', () => {
  it('hostTotalLength=100, tracks.length=80 → skippedLocalCount=20', async () => {
    const tracks = Array.from({ length: 80 }, (_, i) => makeRawTrack(i));
    const catalog = buildCatalog(tracks);
    const scanner = createDetectionScanner(
      new FakeTracksEnumerator({ tracks, hostTotalLength: 100 }),
      new FakeCatalogEnricher({ catalog }),
    );
    const result = await scanner.scan(LIKED_SONGS_REQUEST, neverAborted(), vi.fn());
    expect(result.skippedLocalCount).toBe(20);
  });

  it('skippedLocalCount=0 fallback when enumerator emits no total', async () => {
    // An enumerator that emits no progress events (empty collection).
    const scanner = createDetectionScanner(
      new FakeTracksEnumerator({ tracks: [] }),
      new FakeCatalogEnricher({ catalog: new Map() }),
    );
    const result = await scanner.scan(LIKED_SONGS_REQUEST, neverAborted(), vi.fn());
    expect(result.skippedLocalCount).toBe(0);
  });

  it('skippedLocalCount clamped to 0 when enumerator total is less than tracks (defensive)', async () => {
    // Pathological: hostTotalLength < tracks.length should not produce negative.
    const tracks = Array.from({ length: 10 }, (_, i) => makeRawTrack(i));
    const catalog = buildCatalog(tracks);
    const scanner = createDetectionScanner(
      new FakeTracksEnumerator({ tracks, hostTotalLength: 5 }),
      new FakeCatalogEnricher({ catalog }),
    );
    const result = await scanner.scan(LIKED_SONGS_REQUEST, neverAborted(), vi.fn());
    expect(result.skippedLocalCount).toBeGreaterThanOrEqual(0);
  });

  it('skippedLocalCount=0 when enumerating event has total:null', async () => {
    // Exercises the event.total !== null guard at line 76: when the host emits
    // an enumerating event with total:null, hostTotalLength stays null and
    // skippedLocalCount falls back to 0.
    const tracks = Array.from({ length: 5 }, (_, i) => makeRawTrack(i));
    const catalog = buildCatalog(tracks);
    const nullTotalEnumerator: import('../../src/ports/tracks-enumerator').TracksEnumerator = {
      async enumerate(_req, _sig, onProgress) {
        onProgress({ stage: 'enumerating', processed: 5, total: null });
        return tracks;
      },
    };
    const scanner = createDetectionScanner(
      nullTotalEnumerator,
      new FakeCatalogEnricher({ catalog }),
    );
    const result = await scanner.scan(LIKED_SONGS_REQUEST, neverAborted(), vi.fn());
    expect(result.skippedLocalCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// §9 — unenrichedCount
// ---------------------------------------------------------------------------

describe('createDetectionScanner — unenrichedCount', () => {
  it('catalog returns null for 3 of 10 → result.unenrichedCount===3', async () => {
    const tracks = Array.from({ length: 10 }, (_, i) => makeRawTrack(i));
    const nullIds = new Set([tracks[1]!.id, tracks[4]!.id, tracks[7]!.id]);
    const catalog = buildCatalog(tracks, nullIds);
    const scanner = createDetectionScanner(
      new FakeTracksEnumerator({ tracks }),
      new FakeCatalogEnricher({ catalog }),
    );
    const result = await scanner.scan(LIKED_SONGS_REQUEST, neverAborted(), vi.fn());
    expect(result.unenrichedCount).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// §10 — scannedTrackCount
// ---------------------------------------------------------------------------

describe('createDetectionScanner — scannedTrackCount', () => {
  it('equals enumerator yield count', async () => {
    const tracks = Array.from({ length: 15 }, (_, i) => makeRawTrack(i));
    const catalog = buildCatalog(tracks);
    const scanner = createDetectionScanner(
      new FakeTracksEnumerator({ tracks }),
      new FakeCatalogEnricher({ catalog }),
    );
    const result = await scanner.scan(LIKED_SONGS_REQUEST, neverAborted(), vi.fn());
    expect(result.scannedTrackCount).toBe(15);
  });
});

// ---------------------------------------------------------------------------
// §11 — Matching progress events
// ---------------------------------------------------------------------------

describe('createDetectionScanner — matching progress events', () => {
  it('emits exactly 2 matching events (start + end) when tracks are present', async () => {
    const tracks = [makeRawTrack(0)];
    const catalog = buildCatalog(tracks);
    const events: ProgressEvent[] = [];
    const onProgress = vi.fn((e: ProgressEvent) => events.push(e));
    const scanner = createDetectionScanner(
      new FakeTracksEnumerator({ tracks }),
      new FakeCatalogEnricher({ catalog }),
    );
    await scanner.scan(LIKED_SONGS_REQUEST, neverAborted(), onProgress);
    const matchingEvents = events.filter((e) => e.stage === 'matching');
    expect(matchingEvents).toHaveLength(2);
    expect(matchingEvents[0]).toMatchObject({ stage: 'matching', processed: 0 });
    expect(matchingEvents[1]).toMatchObject({ stage: 'matching', processed: 1 });
  });
});

// ---------------------------------------------------------------------------
// §12 — Spot-check: no Spicetify reference in the composition adapter file
// ---------------------------------------------------------------------------

describe('createDetectionScanner — spot-check no Spicetify imports', () => {
  it('adapter file body does not contain Spicetify or CosmosAsync import', () => {
    const filePath = join(
      __dirname,
      '../../src/adapters/detection-scanner.ts',
    );
    const body = readFileSync(filePath, 'utf8');
    // Only check import lines — comments are allowed to reference the abstraction.
    expect(body).not.toMatch(/from\s+['"][^'"]*spicetify/i);
    expect(body).not.toMatch(/CosmosAsync/);
  });
});
