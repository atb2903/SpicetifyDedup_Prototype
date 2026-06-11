/**
 * Unit tests for `SpicetifyCatalogEnricher`.
 *
 * All tests inject a stub `CosmosAsync.get` via the constructor; tests also
 * inject a fake `now` clock for abort-during-sleep timing.
 *
 * Stubs use the REAL CosmosAsync contract: HTTP errors resolve as
 * `{ code, error, message, stack }` (status under `code`, no headers); 2xx
 * success resolves as the parsed body (e.g. `{ tracks: [...] }`, no `code`).
 *
 * Covers: batch size boundaries, 429 bounded exponential backoff, retry loop,
 * error classification (401, 4xx, 5xx, thrown, bad-shape), null slots, abort
 * semantics, progress events, and order alignment.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  SpicetifyCatalogEnricher,
  isCatalogTrack,
} from '../../src/adapters/spicetify-catalog-enricher';
import { DetectionError, isDetectionError } from '../../src/domain/detection-errors';
import type { RawTrack, ProgressEvent } from '../../src/domain/detection-types';
import type { EnrichmentSlot } from '../../src/ports/catalog-enricher';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRawTrack(i: number): RawTrack {
  return {
    uri: `spotify:track:TRACK${String(i).padStart(4, '0')}`,
    id: `TRACK${String(i).padStart(4, '0')}`,
    name: `Track ${i}`,
    artists: [{ uri: `spotify:artist:ART${i}`, name: `Artist ${i}` }],
    album: { uri: `spotify:album:ALB${i}`, name: `Album ${i}` },
    position: i,
  };
}

function makeRawTracks(count: number, startPos = 0): RawTrack[] {
  return Array.from({ length: count }, (_, i) => ({
    ...makeRawTrack(i),
    position: startPos + i,
  }));
}

function makeCatalogTrack(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    uri: `spotify:track:${id}`,
    name: `Name for ${id}`,
    artists: [{ name: `Artist for ${id}` }],
    duration_ms: 180000,
    ...overrides,
  };
}

function successResponse(ids: string[]) {
  return {
    tracks: ids.map((id) => makeCatalogTrack(id)),
  };
}

function nullResponse(count: number) {
  return {
    tracks: Array.from({ length: count }, () => null),
  };
}

type CosmosGet = (url: string) => Promise<unknown>;

function makeCosmos(get: CosmosGet) {
  return { get: vi.fn<CosmosGet>(get) };
}

function neverAborted(): AbortSignal {
  return new AbortController().signal;
}

function alreadyAborted(): AbortSignal {
  const c = new AbortController();
  c.abort();
  return c.signal;
}

// ---------------------------------------------------------------------------
// Batch size boundaries
// ---------------------------------------------------------------------------

describe('SpicetifyCatalogEnricher — batch size', () => {
  it('0 tracks → 0 host calls, returns []', async () => {
    const cosmos = makeCosmos(vi.fn());
    const enricher = new SpicetifyCatalogEnricher(cosmos);
    const result = await enricher.enrich([], neverAborted(), vi.fn());
    expect(result).toHaveLength(0);
    expect(cosmos.get).not.toHaveBeenCalled();
  });

  it('1 track → 1 batch, 1 host call', async () => {
    const tracks = makeRawTracks(1);
    const cosmos = makeCosmos(async (url) => {
      expect(url).toContain('ids=TRACK0000');
      return { tracks: [makeCatalogTrack('TRACK0000')] };
    });
    const enricher = new SpicetifyCatalogEnricher(cosmos);
    const result = await enricher.enrich(tracks, neverAborted(), vi.fn());
    expect(result).toHaveLength(1);
    expect(result[0]?.kind).toBe('enriched');
  });

  it('49 tracks → 1 batch', async () => {
    const tracks = makeRawTracks(49);
    const ids = tracks.map((t) => t.id);
    const cosmos = makeCosmos(async () => ({ tracks: ids.map((id) => makeCatalogTrack(id)) }));
    const enricher = new SpicetifyCatalogEnricher(cosmos);
    const result = await enricher.enrich(tracks, neverAborted(), vi.fn());
    expect(result).toHaveLength(49);
    expect(cosmos.get).toHaveBeenCalledTimes(1);
  });

  it('50 tracks → exactly 1 batch (boundary)', async () => {
    const tracks = makeRawTracks(50);
    const ids = tracks.map((t) => t.id);
    const cosmos = makeCosmos(async () => ({ tracks: ids.map((id) => makeCatalogTrack(id)) }));
    const enricher = new SpicetifyCatalogEnricher(cosmos);
    const result = await enricher.enrich(tracks, neverAborted(), vi.fn());
    expect(result).toHaveLength(50);
    expect(cosmos.get).toHaveBeenCalledTimes(1);
  });

  it('51 tracks → 2 batches (50 + 1)', async () => {
    const tracks = makeRawTracks(51);
    let callCount = 0;
    const cosmos = makeCosmos(async (url) => {
      callCount++;
      const idsParam = new URL(url).searchParams.get('ids') ?? '';
      const ids = idsParam.split(',');
      return { tracks: ids.map((id) => makeCatalogTrack(id)) };
    });
    const enricher = new SpicetifyCatalogEnricher(cosmos);
    const result = await enricher.enrich(tracks, neverAborted(), vi.fn());
    expect(result).toHaveLength(51);
    expect(callCount).toBe(2);
  });

  it('100 tracks → 2 batches of 50', async () => {
    const tracks = makeRawTracks(100);
    let callCount = 0;
    const cosmos = makeCosmos(async (url) => {
      callCount++;
      const idsParam = new URL(url).searchParams.get('ids') ?? '';
      const ids = idsParam.split(',');
      return { tracks: ids.map((id) => makeCatalogTrack(id)) };
    });
    const enricher = new SpicetifyCatalogEnricher(cosmos);
    await enricher.enrich(tracks, neverAborted(), vi.fn());
    expect(callCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 429 bounded exponential backoff with fake timers
// ---------------------------------------------------------------------------

/** Real CosmosAsync 429 error shape (status under `code`, no headers). */
function rateLimited() {
  return { code: 429, error: '', message: 'Failed to fetch', stack: '' };
}

describe('SpicetifyCatalogEnricher — 429 backoff', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('one 429 then success → backs off 1000ms then succeeds (boundary: 1 retry)', async () => {
    const tracks = makeRawTracks(1);
    let callCount = 0;
    const cosmos = makeCosmos(async () => {
      callCount++;
      if (callCount === 1) return rateLimited();
      return successResponse(tracks.map((t) => t.id));
    });
    const enricher = new SpicetifyCatalogEnricher(cosmos);
    const promise = enricher.enrich(tracks, neverAborted(), vi.fn());
    // Backoff has not yet elapsed: still only one call made.
    await vi.advanceTimersByTimeAsync(999);
    expect(callCount).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    const result = await promise;
    expect(callCount).toBe(2);
    expect(result).toHaveLength(1);
    expect(result[0]?.kind).toBe('enriched');
  });

  it('delays grow exponentially: 1000, 2000, 4000, 8000 across successive 429s', async () => {
    const tracks = makeRawTracks(1);
    let callCount = 0;
    const cosmos = makeCosmos(async () => {
      callCount++;
      if (callCount <= 4) return rateLimited();
      return successResponse(tracks.map((t) => t.id));
    });
    const enricher = new SpicetifyCatalogEnricher(cosmos);
    const promise = enricher.enrich(tracks, neverAborted(), vi.fn());
    // attempt 0 → 1000ms
    await vi.advanceTimersByTimeAsync(1000);
    expect(callCount).toBe(2);
    // attempt 1 → 2000ms
    await vi.advanceTimersByTimeAsync(2000);
    expect(callCount).toBe(3);
    // attempt 2 → 4000ms
    await vi.advanceTimersByTimeAsync(4000);
    expect(callCount).toBe(4);
    // attempt 3 → 8000ms
    await vi.advanceTimersByTimeAsync(8000);
    expect(callCount).toBe(5);
    const result = await promise;
    expect(result).toHaveLength(1);
  });

  it('MAX_ATTEMPTS - 1 (4) 429s then success → succeeds (boundary)', async () => {
    const tracks = makeRawTracks(1);
    let callCount = 0;
    const cosmos = makeCosmos(async () => {
      callCount++;
      if (callCount <= 4) return rateLimited();
      return successResponse(tracks.map((t) => t.id));
    });
    const enricher = new SpicetifyCatalogEnricher(cosmos);
    const promise = enricher.enrich(tracks, neverAborted(), vi.fn());
    // 1000 + 2000 + 4000 + 8000 = 15000ms total backoff (all below the 16000 cap)
    await vi.advanceTimersByTimeAsync(15000);
    const result = await promise;
    expect(callCount).toBe(5);
    expect(result).toHaveLength(1);
  });

  it('MAX_ATTEMPTS (5) 429s → throws rate-limit-unparseable (boundary)', async () => {
    const tracks = makeRawTracks(1);
    let callCount = 0;
    const cosmos = makeCosmos(async () => {
      callCount++;
      return rateLimited();
    });
    const enricher = new SpicetifyCatalogEnricher(cosmos);
    const promise = enricher.enrich(tracks, neverAborted(), vi.fn());
    const assertion = expect(promise).rejects.toSatisfy(
      (e: unknown) =>
        isDetectionError(e) && (e as DetectionError).reason === 'rate-limit-unparseable',
    );
    // 5 backoffs: 1000 + 2000 + 4000 + 8000 + 16000 (capped) = 31000ms.
    await vi.advanceTimersByTimeAsync(31000);
    await assertion;
    // 1 initial + 5 retries = 6 calls, the 6th still 429 → give up.
    expect(callCount).toBe(6);
  });

  it('backoff delay is capped at RATE_LIMIT_MAX_DELAY_MS (16000) on the final attempt', async () => {
    const tracks = makeRawTracks(1);
    let callCount = 0;
    const cosmos = makeCosmos(async () => {
      callCount++;
      // 5 consecutive 429s, then success on the 6th call.
      if (callCount <= 5) return rateLimited();
      return successResponse(tracks.map((t) => t.id));
    });
    const enricher = new SpicetifyCatalogEnricher(cosmos);
    const promise = enricher.enrich(tracks, neverAborted(), vi.fn());
    // Step through the first four backoffs: 1000 + 2000 + 4000 + 8000 = 15000.
    await vi.advanceTimersByTimeAsync(15000);
    expect(callCount).toBe(5);
    // Fifth backoff: 2**4 * 1000 = 16000 (exactly at the cap). 15999 not enough.
    await vi.advanceTimersByTimeAsync(15999);
    expect(callCount).toBe(5);
    await vi.advanceTimersByTimeAsync(1);
    const result = await promise;
    expect(callCount).toBe(6);
    expect(result).toHaveLength(1);
  });

  it('progress event not emitted for retry attempts — only on final success', async () => {
    const tracks = makeRawTracks(1);
    let callCount = 0;
    const cosmos = makeCosmos(async () => {
      callCount++;
      if (callCount === 1) return rateLimited();
      return successResponse(tracks.map((t) => t.id));
    });
    const onProgress = vi.fn<(e: ProgressEvent) => void>();
    const enricher = new SpicetifyCatalogEnricher(cosmos);
    const promise = enricher.enrich(tracks, neverAborted(), onProgress);
    await vi.advanceTimersByTimeAsync(1000);
    await promise;
    // Only 1 progress event (after success), not 2 (one per attempt)
    expect(onProgress).toHaveBeenCalledTimes(1);
  });

  it('aborting mid-backoff throws AbortError', async () => {
    const controller = new AbortController();
    const tracks = makeRawTracks(1);
    let callCount = 0;
    const cosmos = makeCosmos(async () => {
      callCount++;
      if (callCount === 1) return rateLimited();
      return successResponse(tracks.map((t) => t.id));
    });
    const enricher = new SpicetifyCatalogEnricher(cosmos);
    const promise = enricher.enrich(tracks, controller.signal, vi.fn());
    // Advance partway through the 1000ms backoff, then abort.
    await vi.advanceTimersByTimeAsync(100);
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(callCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

describe('SpicetifyCatalogEnricher — error classification', () => {
  it('code 401 → auth-token-expired', async () => {
    const cosmos = makeCosmos(async () => ({ code: 401, error: '', message: 'Unauthorized', stack: '' }));
    const enricher = new SpicetifyCatalogEnricher(cosmos);
    await expect(enricher.enrich(makeRawTracks(1), neverAborted(), vi.fn())).rejects.toSatisfy(
      (e: unknown) => isDetectionError(e) && (e as DetectionError).reason === 'auth-token-expired',
    );
  });

  it('body matching /access token expired/i → auth-token-expired', async () => {
    const cosmos = makeCosmos(async () => ({
      error: { message: 'The access token expired' },
    }));
    const enricher = new SpicetifyCatalogEnricher(cosmos);
    await expect(enricher.enrich(makeRawTracks(1), neverAborted(), vi.fn())).rejects.toSatisfy(
      (e: unknown) => isDetectionError(e) && (e as DetectionError).reason === 'auth-token-expired',
    );
  });

  it('string body matching /access token expired/i → auth-token-expired', async () => {
    const cosmos = makeCosmos(async () => 'Access Token Expired');
    const enricher = new SpicetifyCatalogEnricher(cosmos);
    await expect(enricher.enrich(makeRawTracks(1), neverAborted(), vi.fn())).rejects.toSatisfy(
      (e: unknown) => isDetectionError(e) && (e as DetectionError).reason === 'auth-token-expired',
    );
  });

  it('code 403 → catalog-rejected with context.status === 403', async () => {
    const cosmos = makeCosmos(async () => ({ code: 403, error: '', message: 'Forbidden', stack: '' }));
    const enricher = new SpicetifyCatalogEnricher(cosmos);
    let caughtError: unknown;
    try {
      await enricher.enrich(makeRawTracks(1), neverAborted(), vi.fn());
    } catch (e) {
      caughtError = e;
    }
    expect(isDetectionError(caughtError)).toBe(true);
    const err = caughtError as DetectionError;
    expect(err.reason).toBe('catalog-rejected');
    expect(err.context?.['status']).toBe(403);
  });

  it('code 404 → catalog-rejected', async () => {
    const cosmos = makeCosmos(async () => ({ code: 404, error: '', message: 'Not Found', stack: '' }));
    const enricher = new SpicetifyCatalogEnricher(cosmos);
    await expect(enricher.enrich(makeRawTracks(1), neverAborted(), vi.fn())).rejects.toSatisfy(
      (e: unknown) => isDetectionError(e) && (e as DetectionError).reason === 'catalog-rejected',
    );
  });

  it('code 400 → catalog-rejected with context.status === 400', async () => {
    const cosmos = makeCosmos(async () => ({ code: 400, error: '', message: 'Bad Request', stack: '' }));
    const enricher = new SpicetifyCatalogEnricher(cosmos);
    let caughtError: unknown;
    try {
      await enricher.enrich(makeRawTracks(1), neverAborted(), vi.fn());
    } catch (e) {
      caughtError = e;
    }
    expect(isDetectionError(caughtError)).toBe(true);
    const err = caughtError as DetectionError;
    expect(err.reason).toBe('catalog-rejected');
    expect(err.context?.['status']).toBe(400);
  });

  it('defensive `status` fallback: { status: 403 } (no code) → catalog-rejected with context.status === 403', async () => {
    // extractStatus reads `code` first then falls back to `status`. The real
    // contract uses `code`, but the fallback keeps the adapter robust if the
    // host ever returns `status`.
    const cosmos = makeCosmos(async () => ({ status: 403 }));
    const enricher = new SpicetifyCatalogEnricher(cosmos);
    let caughtError: unknown;
    try {
      await enricher.enrich(makeRawTracks(1), neverAborted(), vi.fn());
    } catch (e) {
      caughtError = e;
    }
    expect(isDetectionError(caughtError)).toBe(true);
    const err = caughtError as DetectionError;
    expect(err.reason).toBe('catalog-rejected');
    expect(err.context?.['status']).toBe(403);
  });

  it('code 500 → network-failure', async () => {
    const cosmos = makeCosmos(async () => ({ code: 500, error: '', message: 'Server Error', stack: '' }));
    const enricher = new SpicetifyCatalogEnricher(cosmos);
    await expect(enricher.enrich(makeRawTracks(1), neverAborted(), vi.fn())).rejects.toSatisfy(
      (e: unknown) => isDetectionError(e) && (e as DetectionError).reason === 'network-failure',
    );
  });

  it('code 503 → network-failure', async () => {
    const cosmos = makeCosmos(async () => ({ code: 503, error: '', message: 'Unavailable', stack: '' }));
    const enricher = new SpicetifyCatalogEnricher(cosmos);
    await expect(enricher.enrich(makeRawTracks(1), neverAborted(), vi.fn())).rejects.toSatisfy(
      (e: unknown) => isDetectionError(e) && (e as DetectionError).reason === 'network-failure',
    );
  });

  it('cosmos.get throws TypeError → network-failure with cause', async () => {
    const original = new TypeError('fetch failed');
    const cosmos = makeCosmos(async () => { throw original; });
    const enricher = new SpicetifyCatalogEnricher(cosmos);
    let caughtError: unknown;
    try {
      await enricher.enrich(makeRawTracks(1), neverAborted(), vi.fn());
    } catch (e) {
      caughtError = e;
    }
    expect(isDetectionError(caughtError)).toBe(true);
    const err = caughtError as DetectionError;
    expect(err.reason).toBe('network-failure');
    expect(err.cause).toBe(original);
  });

  it('200 + bad shape (no tracks array) → catalog-rejected with context.status: 200', async () => {
    const cosmos = makeCosmos(async () => ({ foo: 'bar' }));
    const enricher = new SpicetifyCatalogEnricher(cosmos);
    let caughtError: unknown;
    try {
      await enricher.enrich(makeRawTracks(1), neverAborted(), vi.fn());
    } catch (e) {
      caughtError = e;
    }
    expect(isDetectionError(caughtError)).toBe(true);
    const err = caughtError as DetectionError;
    expect(err.reason).toBe('catalog-rejected');
    expect(err.context?.['status']).toBe(200);
  });

  it('200 + { tracks: [{ id: "x" }] } (missing duration_ms) → malformed-enrichment-payload', async () => {
    const cosmos = makeCosmos(async () => ({ tracks: [{ id: 'x' }] }));
    const enricher = new SpicetifyCatalogEnricher(cosmos);
    await expect(enricher.enrich(makeRawTracks(1), neverAborted(), vi.fn())).rejects.toSatisfy(
      (e: unknown) => isDetectionError(e) && (e as DetectionError).reason === 'malformed-enrichment-payload',
    );
  });

  it('response that is an Error instance → network-failure', async () => {
    const cosmos = makeCosmos(async () => new Error('some error'));
    const enricher = new SpicetifyCatalogEnricher(cosmos);
    await expect(enricher.enrich(makeRawTracks(1), neverAborted(), vi.fn())).rejects.toSatisfy(
      (e: unknown) => isDetectionError(e) && (e as DetectionError).reason === 'network-failure',
    );
  });
});

// ---------------------------------------------------------------------------
// Null slots
// ---------------------------------------------------------------------------

describe('SpicetifyCatalogEnricher — null slots', () => {
  it('null catalog response → unenriched slot with correct position and rawUri', async () => {
    const tracks = makeRawTracks(1);
    const cosmos = makeCosmos(async () => ({ tracks: [null] }));
    const enricher = new SpicetifyCatalogEnricher(cosmos);
    const result = await enricher.enrich(tracks, neverAborted(), vi.fn());
    expect(result).toHaveLength(1);
    const slot = result[0]!;
    expect(slot.kind).toBe('unenriched');
    if (slot.kind === 'unenriched') {
      expect(slot.position).toBe(tracks[0]!.position);
      expect(slot.rawUri).toBe(tracks[0]!.uri);
    }
  });

  it('mixed null + valid → first unenriched, second enriched', async () => {
    const tracks = makeRawTracks(2);
    const ids = tracks.map((t) => t.id);
    const cosmos = makeCosmos(async () => ({
      tracks: [null, makeCatalogTrack(ids[1]!)],
    }));
    const enricher = new SpicetifyCatalogEnricher(cosmos);
    const result = await enricher.enrich(tracks, neverAborted(), vi.fn());
    expect(result).toHaveLength(2);
    expect(result[0]?.kind).toBe('unenriched');
    expect(result[1]?.kind).toBe('enriched');
  });
});

// ---------------------------------------------------------------------------
// Abort
// ---------------------------------------------------------------------------

describe('SpicetifyCatalogEnricher — abort', () => {
  it('pre-aborted signal → throws AbortError immediately, no host call', async () => {
    const cosmos = makeCosmos(vi.fn());
    const enricher = new SpicetifyCatalogEnricher(cosmos);
    await expect(
      enricher.enrich(makeRawTracks(1), alreadyAborted(), vi.fn()),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(cosmos.get).not.toHaveBeenCalled();
  });

  it('abort between batches throws AbortError on next iteration', async () => {
    const controller = new AbortController();
    let callCount = 0;
    const cosmos = makeCosmos(async (url) => {
      callCount++;
      // Abort after first batch
      if (callCount === 1) {
        controller.abort();
        const idsParam = new URL(url).searchParams.get('ids') ?? '';
        const ids = idsParam.split(',');
        return { tracks: ids.map((id) => makeCatalogTrack(id)) };
      }
      const idsParam = new URL(url).searchParams.get('ids') ?? '';
      const ids = idsParam.split(',');
      return { tracks: ids.map((id) => makeCatalogTrack(id)) };
    });
    const enricher = new SpicetifyCatalogEnricher(cosmos);
    // 51 tracks → 2 batches; abort after first
    await expect(
      enricher.enrich(makeRawTracks(51), controller.signal, vi.fn()),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(callCount).toBe(1);
  });

  it('abort during 429 backoff sleep → throws AbortError promptly', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const tracks = makeRawTracks(1);
    let callCount = 0;
    const cosmos = makeCosmos(async () => {
      callCount++;
      if (callCount === 1) {
        return { code: 429, error: '', message: 'Failed to fetch', stack: '' };
      }
      return successResponse(tracks.map((t) => t.id));
    });
    const enricher = new SpicetifyCatalogEnricher(cosmos);
    const promise = enricher.enrich(tracks, controller.signal, vi.fn());
    // Advance partway through the 1000ms backoff sleep
    await vi.advanceTimersByTimeAsync(100);
    // Now abort
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    vi.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// Progress events
// ---------------------------------------------------------------------------

describe('SpicetifyCatalogEnricher — progress events', () => {
  it('emits one progress event per batch completion', async () => {
    const tracks = makeRawTracks(51);
    const onProgress = vi.fn<(e: ProgressEvent) => void>();
    let callCount = 0;
    const cosmos = makeCosmos(async (url) => {
      callCount++;
      const idsParam = new URL(url).searchParams.get('ids') ?? '';
      const ids = idsParam.split(',');
      return { tracks: ids.map((id) => makeCatalogTrack(id)) };
    });
    const enricher = new SpicetifyCatalogEnricher(cosmos);
    await enricher.enrich(tracks, neverAborted(), onProgress);
    // 2 batches (50 + 1) → 2 events
    expect(onProgress).toHaveBeenCalledTimes(2);
  });

  it('progress event has correct stage, total, and cumulative processed', async () => {
    const tracks = makeRawTracks(51);
    const events: ProgressEvent[] = [];
    const cosmos = makeCosmos(async (url) => {
      const idsParam = new URL(url).searchParams.get('ids') ?? '';
      const ids = idsParam.split(',');
      return { tracks: ids.map((id) => makeCatalogTrack(id)) };
    });
    const enricher = new SpicetifyCatalogEnricher(cosmos);
    await enricher.enrich(tracks, neverAborted(), (e) => events.push(e));
    expect(events[0]?.stage).toBe('enriching');
    expect(events[0]?.total).toBe(51);
    expect(events[0]?.processed).toBe(50);
    expect(events[1]?.processed).toBe(51);
  });
});

// ---------------------------------------------------------------------------
// Order alignment
// ---------------------------------------------------------------------------

describe('SpicetifyCatalogEnricher — order alignment', () => {
  it('result length === tracks length', async () => {
    const tracks = makeRawTracks(5);
    const cosmos = makeCosmos(async () => successResponse(tracks.map((t) => t.id)));
    const enricher = new SpicetifyCatalogEnricher(cosmos);
    const result = await enricher.enrich(tracks, neverAborted(), vi.fn());
    expect(result).toHaveLength(5);
  });

  it('unenriched slot has position matching tracks[i].position', async () => {
    const tracks: RawTrack[] = [
      { uri: 'spotify:track:A', id: 'A', name: 'A', artists: [{ uri: '', name: 'Ar' }], album: { uri: '', name: '' }, position: 7 },
    ];
    const cosmos = makeCosmos(async () => ({ tracks: [null] }));
    const enricher = new SpicetifyCatalogEnricher(cosmos);
    const result = await enricher.enrich(tracks, neverAborted(), vi.fn());
    const slot = result[0] as EnrichmentSlot & { kind: 'unenriched' };
    expect(slot.position).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// globalThis fallback (no-arg constructor)
// ---------------------------------------------------------------------------

describe('SpicetifyCatalogEnricher — globalThis fallback', () => {
  it('reads CosmosAsync from globalThis.Spicetify when constructed with no argument', async () => {
    const tracks = makeRawTracks(1);
    const cosmosFn = vi.fn<CosmosGet>(async () => successResponse(tracks.map((t) => t.id)));
    const prev = (globalThis as Record<string, unknown>)['Spicetify'];
    try {
      (globalThis as Record<string, unknown>)['Spicetify'] = { CosmosAsync: { get: cosmosFn } };
      const enricher = new SpicetifyCatalogEnricher(); // no arg — triggers fallback branch
      const result = await enricher.enrich(tracks, neverAborted(), vi.fn());
      expect(result).toHaveLength(1);
      expect(result[0]?.kind).toBe('enriched');
      expect(cosmosFn).toHaveBeenCalledTimes(1);
    } finally {
      if (prev === undefined) {
        delete (globalThis as Record<string, unknown>)['Spicetify'];
      } else {
        (globalThis as Record<string, unknown>)['Spicetify'] = prev;
      }
    }
  });
});

// ---------------------------------------------------------------------------
// isCatalogTrack
// ---------------------------------------------------------------------------

describe('isCatalogTrack', () => {
  it('returns true for a valid catalog track', () => {
    expect(isCatalogTrack(makeCatalogTrack('ID1'))).toBe(true);
  });

  it('returns false for null', () => {
    expect(isCatalogTrack(null)).toBe(false);
  });

  it('returns false for non-object', () => {
    expect(isCatalogTrack('string')).toBe(false);
    expect(isCatalogTrack(42)).toBe(false);
  });

  it('returns false for missing id', () => {
    const t = { ...makeCatalogTrack('X') };
    delete (t as Record<string, unknown>)['id'];
    expect(isCatalogTrack(t)).toBe(false);
  });

  it('returns false for missing duration_ms', () => {
    const t = { ...makeCatalogTrack('X') };
    delete (t as Record<string, unknown>)['duration_ms'];
    expect(isCatalogTrack(t)).toBe(false);
  });

  it('returns false for missing artists', () => {
    const t = { ...makeCatalogTrack('X') };
    delete (t as Record<string, unknown>)['artists'];
    expect(isCatalogTrack(t)).toBe(false);
  });

  it('returns false for empty artists array', () => {
    expect(isCatalogTrack({ ...makeCatalogTrack('X'), artists: [] })).toBe(false);
  });

  it('returns false for missing uri', () => {
    const t = { ...makeCatalogTrack('X') };
    delete (t as Record<string, unknown>)['uri'];
    expect(isCatalogTrack(t)).toBe(false);
  });

  it('returns false when name is not a string (number)', () => {
    expect(isCatalogTrack({ ...makeCatalogTrack('X'), name: 42 })).toBe(false);
  });

  it('returns false when id is empty string', () => {
    expect(isCatalogTrack({ ...makeCatalogTrack('X'), id: '' })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Additional coverage: abort-on-sleep-entry, body.message auth
// ---------------------------------------------------------------------------

describe('SpicetifyCatalogEnricher — additional branch coverage', () => {
  it('sleep immediately rejects when signal is already aborted on entry', async () => {
    vi.useFakeTimers();
    // We test the sleep method indirectly: signal is aborted BEFORE the 429
    // backoff sleep begins. The flow: 429 → sleep(delay, signal) → already aborted.
    const controller = new AbortController();
    const tracks = makeRawTracks(1);
    let callCount = 0;
    const cosmos = makeCosmos(async () => {
      callCount++;
      if (callCount === 1) {
        // Abort signal synchronously before sleep starts
        controller.abort();
        return { code: 429, error: '', message: 'Failed to fetch', stack: '' };
      }
      return successResponse(tracks.map((t) => t.id));
    });
    const enricher = new SpicetifyCatalogEnricher(cosmos);
    await expect(
      enricher.enrich(tracks, controller.signal, vi.fn()),
    ).rejects.toMatchObject({ name: 'AbortError' });
    vi.useRealTimers();
  });

  it('body.message matching /access token expired/i → auth-token-expired', async () => {
    const tracks = makeRawTracks(1);
    const cosmos = makeCosmos(async () => ({
      message: 'The access token expired',
    }));
    const enricher = new SpicetifyCatalogEnricher(cosmos);
    await expect(enricher.enrich(tracks, neverAborted(), vi.fn())).rejects.toSatisfy(
      (e: unknown) => isDetectionError(e) && (e as DetectionError).reason === 'auth-token-expired',
    );
  });

  it('catalog returns a string body (non-object 200-ish) → catalog-rejected with status 200', async () => {
    // When CosmosAsync returns a string that doesn't match auth-expired and has
    // no status property, it falls through to parseResponse which throws catalog-rejected.
    const tracks = makeRawTracks(1);
    const cosmos = makeCosmos(async () => 'unexpected string response');
    const enricher = new SpicetifyCatalogEnricher(cosmos);
    let err: unknown;
    try {
      await enricher.enrich(tracks, neverAborted(), vi.fn());
    } catch (e) {
      err = e;
    }
    expect(isDetectionError(err)).toBe(true);
    expect((err as DetectionError).reason).toBe('catalog-rejected');
    expect((err as DetectionError).context?.['status']).toBe(200);
  });

  it('catalog returns a number → catalog-rejected (non-object, non-string, non-Error)', async () => {
    // Non-string, non-object, non-Error primitive: goes through looksLikeAuthExpired
    // (returns false since it's not a string and not an object) and then falls
    // through to parseResponse which throws catalog-rejected.
    const tracks = makeRawTracks(1);
    const cosmos = makeCosmos(async () => 42);
    const enricher = new SpicetifyCatalogEnricher(cosmos);
    await expect(enricher.enrich(tracks, neverAborted(), vi.fn())).rejects.toSatisfy(
      (e: unknown) => isDetectionError(e) && (e as DetectionError).reason === 'catalog-rejected',
    );
  });

  it('body.error.message that does not match auth-expired → does not throw auth-token-expired', async () => {
    // error.message present but not auth-expired → falls through to body.message check
    const tracks = makeRawTracks(1);
    const cosmos = makeCosmos(async () => ({
      error: { message: 'Some other error' },
    }));
    const enricher = new SpicetifyCatalogEnricher(cosmos);
    // Falls through to parseResponse (no tracks array) → catalog-rejected
    await expect(enricher.enrich(tracks, neverAborted(), vi.fn())).rejects.toSatisfy(
      (e: unknown) => isDetectionError(e) && (e as DetectionError).reason === 'catalog-rejected',
    );
  });
});
