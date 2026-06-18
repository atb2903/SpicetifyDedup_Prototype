/**
 * Unit tests for `FakeTracksEnumerator`.
 *
 * Verifies the test-double contract: paging, progress events, abort positions,
 * and the `failOnFirstPage` force-mode.
 */
import { describe, it, expect, vi } from 'vitest';
import { FakeTracksEnumerator } from '../../src/adapters/fake-tracks-enumerator';
import type { RawTrack, ScanRequest } from '../../src/domain/detection-types';
import { DetectionError } from '../../src/domain/detection-errors';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTrack(i: number): RawTrack {
  return {
    uri: `spotify:track:TRACK${i.toString().padStart(4, '0')}`,
    id: `TRACK${i.toString().padStart(4, '0')}`,
    name: `Track ${i}`,
    artists: [{ uri: `spotify:artist:ART${i}`, name: `Artist ${i}` }],
    album: { uri: `spotify:album:ALB${i}`, name: `Album ${i}` },
    position: i,
    durationMs: 180000 + i,
  };
}

function makeTracks(count: number): RawTrack[] {
  return Array.from({ length: count }, (_, i) => makeTrack(i));
}

const LIKED_SONGS_REQUEST: ScanRequest = { kind: 'liked-songs' };

function neverAborted(): AbortSignal {
  return new AbortController().signal;
}

// ---------------------------------------------------------------------------
// Empty fixture
// ---------------------------------------------------------------------------

describe('FakeTracksEnumerator — empty fixture', () => {
  it('resolves with [] immediately, emits no progress event', async () => {
    const onProgress = vi.fn();
    const enumerator = new FakeTracksEnumerator({ tracks: [] });
    const { tracks: result } = await enumerator.enumerate(LIKED_SONGS_REQUEST, neverAborted(), onProgress);
    expect(result).toEqual([]);
    expect(onProgress).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Single-page fixture
// ---------------------------------------------------------------------------

describe('FakeTracksEnumerator — single-page fixture', () => {
  it('resolves with all tracks, emits one progress event with processed=5, total=5', async () => {
    const tracks = makeTracks(5);
    const onProgress = vi.fn();
    const enumerator = new FakeTracksEnumerator({ tracks, pageSize: 10 });
    const { tracks: result } = await enumerator.enumerate(LIKED_SONGS_REQUEST, neverAborted(), onProgress);
    expect(result).toEqual(tracks);
    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenCalledWith({
      stage: 'enumerating',
      processed: 5,
      total: 5,
    });
  });
});

// ---------------------------------------------------------------------------
// Multi-page fixture
// ---------------------------------------------------------------------------

describe('FakeTracksEnumerator — multi-page fixture', () => {
  it('250 tracks, pageSize=100 → 3 progress events with cumulative processed', async () => {
    const tracks = makeTracks(250);
    const events: Array<{ processed: number; total: number | null }> = [];
    const onProgress = vi.fn((e) => events.push({ processed: e.processed, total: e.total }));
    const enumerator = new FakeTracksEnumerator({ tracks, pageSize: 100 });
    const { tracks: result } = await enumerator.enumerate(LIKED_SONGS_REQUEST, neverAborted(), onProgress);
    expect(result).toHaveLength(250);
    expect(onProgress).toHaveBeenCalledTimes(3);
    expect(events[0]).toEqual({ processed: 100, total: 250 });
    expect(events[1]).toEqual({ processed: 200, total: 250 });
    expect(events[2]).toEqual({ processed: 250, total: 250 });
  });

  it('exact boundary: 200 tracks, pageSize=200 → 1 progress event', async () => {
    const tracks = makeTracks(200);
    const onProgress = vi.fn();
    const enumerator = new FakeTracksEnumerator({ tracks, pageSize: 200 });
    await enumerator.enumerate(LIKED_SONGS_REQUEST, neverAborted(), onProgress);
    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenCalledWith({
      stage: 'enumerating',
      processed: 200,
      total: 200,
    });
  });

  it('201 tracks, pageSize=200 → 2 progress events', async () => {
    const tracks = makeTracks(201);
    const onProgress = vi.fn();
    const enumerator = new FakeTracksEnumerator({ tracks, pageSize: 200 });
    await enumerator.enumerate(LIKED_SONGS_REQUEST, neverAborted(), onProgress);
    expect(onProgress).toHaveBeenCalledTimes(2);
  });

  it('returns all tracks in order', async () => {
    const tracks = makeTracks(250);
    const enumerator = new FakeTracksEnumerator({ tracks, pageSize: 100 });
    const { tracks: result } = await enumerator.enumerate(LIKED_SONGS_REQUEST, neverAborted(), vi.fn());
    expect(result).toEqual(tracks);
  });
});

// ---------------------------------------------------------------------------
// hostTotalLength override
// ---------------------------------------------------------------------------

describe('FakeTracksEnumerator — hostTotalLength', () => {
  it('uses hostTotalLength (100) as total in progress events even when tracks.length is 80', async () => {
    const tracks = makeTracks(80);
    const events: Array<{ processed: number; total: number | null }> = [];
    const onProgress = vi.fn((e) => events.push({ processed: e.processed, total: e.total }));
    const enumerator = new FakeTracksEnumerator({
      tracks,
      pageSize: 200,
      hostTotalLength: 100,
    });
    await enumerator.enumerate(LIKED_SONGS_REQUEST, neverAborted(), onProgress);
    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(events[0]).toEqual({ processed: 80, total: 100 });
  });

  it('multi-page with hostTotalLength override keeps host count constant across all pages', async () => {
    const tracks = makeTracks(150);
    const events: Array<{ processed: number; total: number | null }> = [];
    const onProgress = vi.fn((e) => events.push({ processed: e.processed, total: e.total }));
    const enumerator = new FakeTracksEnumerator({
      tracks,
      pageSize: 100,
      hostTotalLength: 200,
    });
    await enumerator.enumerate(LIKED_SONGS_REQUEST, neverAborted(), onProgress);
    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(events[0]).toEqual({ processed: 100, total: 200 });
    expect(events[1]).toEqual({ processed: 150, total: 200 });
  });
});

// ---------------------------------------------------------------------------
// Abort positions
// ---------------------------------------------------------------------------

describe('FakeTracksEnumerator — abort before first page', () => {
  it('throws AbortError, emits no progress event', async () => {
    const tracks = makeTracks(10);
    const onProgress = vi.fn();
    const controller = new AbortController();
    controller.abort();
    const enumerator = new FakeTracksEnumerator({ tracks, pageSize: 200 });
    await expect(
      enumerator.enumerate(LIKED_SONGS_REQUEST, controller.signal, onProgress),
    ).rejects.toSatisfy(
      (e: unknown) =>
        e instanceof DOMException && e.name === 'AbortError',
    );
    expect(onProgress).not.toHaveBeenCalled();
  });
});

describe('FakeTracksEnumerator — abort between pages', () => {
  it('throws AbortError at the page boundary check after page 1', async () => {
    const tracks = makeTracks(250);
    const events: unknown[] = [];
    const controller = new AbortController();
    const onProgress = vi.fn((e) => {
      events.push(e);
      // Abort after the first page's progress event.
      if (events.length === 1) {
        controller.abort();
      }
    });
    const enumerator = new FakeTracksEnumerator({ tracks, pageSize: 100 });
    await expect(
      enumerator.enumerate(LIKED_SONGS_REQUEST, controller.signal, onProgress),
    ).rejects.toSatisfy(
      (e: unknown) =>
        e instanceof DOMException && e.name === 'AbortError',
    );
    // Progress for page 1 was emitted, but page 2 check threw before page 2 progress.
    expect(onProgress).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// failOnFirstPage force-mode
// ---------------------------------------------------------------------------

describe('FakeTracksEnumerator — failOnFirstPage', () => {
  it('throws DetectionError with reason enumerator-failed', async () => {
    const tracks = makeTracks(5);
    const onProgress = vi.fn();
    const enumerator = new FakeTracksEnumerator({
      tracks,
      failOnFirstPage: true,
    });
    await expect(
      enumerator.enumerate(LIKED_SONGS_REQUEST, neverAborted(), onProgress),
    ).rejects.toSatisfy(
      (e: unknown) =>
        e instanceof DetectionError && e.reason === 'enumerator-failed',
    );
  });

  it('emits no progress event before throwing', async () => {
    const tracks = makeTracks(5);
    const onProgress = vi.fn();
    const enumerator = new FakeTracksEnumerator({
      tracks,
      failOnFirstPage: true,
    });
    await expect(
      enumerator.enumerate(LIKED_SONGS_REQUEST, neverAborted(), onProgress),
    ).rejects.toThrow(DetectionError);
    expect(onProgress).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Default pageSize
// ---------------------------------------------------------------------------

describe('FakeTracksEnumerator — default pageSize', () => {
  it('uses pageSize=200 by default: 250 tracks → 2 pages', async () => {
    const tracks = makeTracks(250);
    const onProgress = vi.fn();
    const enumerator = new FakeTracksEnumerator({ tracks });
    await enumerator.enumerate(LIKED_SONGS_REQUEST, neverAborted(), onProgress);
    expect(onProgress).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// EnumerationResult shape — the fake mirrors the real return contract (NEW-1)
// ---------------------------------------------------------------------------

describe('FakeTracksEnumerator — EnumerationResult shape (NEW-1)', () => {
  it('returns { tracks, skippedLocalCount } with skippedLocalCount defaulting to 0', async () => {
    const tracks = makeTracks(3);
    const enumerator = new FakeTracksEnumerator({ tracks });
    const result = await enumerator.enumerate(LIKED_SONGS_REQUEST, neverAborted(), vi.fn());
    expect(result.tracks).toEqual(tracks);
    expect(result.skippedLocalCount).toBe(0);
  });

  it('reports the configured skippedLocalCount on the result', async () => {
    const tracks = makeTracks(5);
    const enumerator = new FakeTracksEnumerator({ tracks, skippedLocalCount: 7 });
    const result = await enumerator.enumerate(LIKED_SONGS_REQUEST, neverAborted(), vi.fn());
    expect(result.skippedLocalCount).toBe(7);
    expect(result.tracks).toHaveLength(5);
  });

  it('empty fixture still returns the result shape with skippedLocalCount', async () => {
    const enumerator = new FakeTracksEnumerator({ tracks: [], skippedLocalCount: 2 });
    const result = await enumerator.enumerate(LIKED_SONGS_REQUEST, neverAborted(), vi.fn());
    expect(result.tracks).toEqual([]);
    expect(result.skippedLocalCount).toBe(2);
  });
});
