/**
 * Unit tests for `SpicetifyTracksEnumerator`.
 *
 * All tests inject a stub `Platform` via the constructor — no `globalThis.Spicetify`
 * stubbing required. Covers: pagination, local-file filtering, abort semantics,
 * error classification, progress events, playlist path, host-shape validators.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SpicetifyTracksEnumerator,
  isLibraryTrackItem,
  parseLibraryTrackItem,
} from '../../src/adapters/spicetify-tracks-enumerator';
import { DetectionError, isDetectionError } from '../../src/domain/detection-errors';
import type { ScanRequest, ProgressEvent, RawTrack } from '../../src/domain/detection-types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a valid LibraryAPI page response. */
function makePage(count: number, totalLength: number, startIdx = 0) {
  return {
    items: Array.from({ length: count }, (_, i) => makeItem(startIdx + i)),
    totalLength,
    offset: startIdx,
    limit: 200,
  };
}

/** Build a valid track item at a given index. */
function makeItem(i: number, overrides: Record<string, unknown> = {}) {
  return {
    type: 'track',
    uri: `spotify:track:TRACK${String(i).padStart(4, '0')}`,
    name: `Track ${i}`,
    duration: { milliseconds: 180000 + i },
    album: { uri: `spotify:album:ALBUM${i}`, name: `Album ${i}` },
    artists: [{ uri: `spotify:artist:ART${i}`, name: `Artist ${i}` }],
    ...overrides,
  };
}

/** Build a local-file item. */
function makeLocalItem(i: number) {
  return {
    type: 'track',
    uri: `spotify:local:artist:album:track${i}:180`,
    name: `Local Track ${i}`,
    album: { uri: '', name: '' },
    artists: [{ uri: '', name: 'Local Artist' }],
  };
}

type GetTracks = (params: { limit: number; offset: number }) => Promise<unknown>;
type GetContents = (uri: string, params: { limit: number; offset: number }) => Promise<unknown>;

function makePlatform(opts: {
  getTracks?: GetTracks;
  getContents?: GetContents;
}) {
  return {
    LibraryAPI: {
      getTracks: vi.fn<GetTracks>(opts.getTracks ?? (() => Promise.resolve(makePage(0, 0)))),
    },
    PlaylistAPI: {
      getContents: vi.fn<GetContents>(
        opts.getContents ?? (() => Promise.resolve(makePage(0, 0))),
      ),
    },
  };
}

function likedRequest(): ScanRequest {
  return { kind: 'liked-songs' };
}

function playlistRequest(uri = 'spotify:playlist:ABCDEF123456'): ScanRequest {
  return { kind: 'playlist', playlistUri: uri };
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
// Pagination
// ---------------------------------------------------------------------------

describe('SpicetifyTracksEnumerator — pagination', () => {
  it('returns empty array for 0-item collection', async () => {
    const platform = makePlatform({
      getTracks: async () => makePage(0, 0),
    });
    const enumerator = new SpicetifyTracksEnumerator(platform);
    const result = await enumerator.enumerate(likedRequest(), neverAborted(), vi.fn());
    expect(result).toHaveLength(0);
    expect(platform.LibraryAPI.getTracks).toHaveBeenCalledTimes(1);
  });

  it('returns 1 item', async () => {
    const platform = makePlatform({
      getTracks: async () => makePage(1, 1),
    });
    const enumerator = new SpicetifyTracksEnumerator(platform);
    const result = await enumerator.enumerate(likedRequest(), neverAborted(), vi.fn());
    expect(result).toHaveLength(1);
    expect(result[0]?.position).toBe(0);
  });

  it('handles 199 items in a single page', async () => {
    const platform = makePlatform({
      getTracks: async () => makePage(199, 199),
    });
    const enumerator = new SpicetifyTracksEnumerator(platform);
    const result = await enumerator.enumerate(likedRequest(), neverAborted(), vi.fn());
    expect(result).toHaveLength(199);
    expect(platform.LibraryAPI.getTracks).toHaveBeenCalledTimes(1);
  });

  it('handles exactly 200 items (one full page, no second fetch)', async () => {
    const platform = makePlatform({
      getTracks: async () => makePage(200, 200),
    });
    const enumerator = new SpicetifyTracksEnumerator(platform);
    const result = await enumerator.enumerate(likedRequest(), neverAborted(), vi.fn());
    expect(result).toHaveLength(200);
    // Terminator: offset + items.length (0 + 200) >= totalLength (200) → break
    expect(platform.LibraryAPI.getTracks).toHaveBeenCalledTimes(1);
  });

  it('handles 201 items requiring two pages', async () => {
    let call = 0;
    const platform = makePlatform({
      getTracks: async (params) => {
        call++;
        if (params.offset === 0) return makePage(200, 201, 0);
        return makePage(1, 201, 200);
      },
    });
    const enumerator = new SpicetifyTracksEnumerator(platform);
    const result = await enumerator.enumerate(likedRequest(), neverAborted(), vi.fn());
    expect(result).toHaveLength(201);
    expect(call).toBe(2);
  });

  it('handles 401 items requiring three pages', async () => {
    const platform = makePlatform({
      getTracks: async (params) => {
        if (params.offset === 0) return makePage(200, 401, 0);
        if (params.offset === 200) return makePage(200, 401, 200);
        return makePage(1, 401, 400);
      },
    });
    const enumerator = new SpicetifyTracksEnumerator(platform);
    const result = await enumerator.enumerate(likedRequest(), neverAborted(), vi.fn());
    expect(result).toHaveLength(401);
    expect(platform.LibraryAPI.getTracks).toHaveBeenCalledTimes(3);
  });

  it('assigns monotonically increasing positions', async () => {
    const platform = makePlatform({
      getTracks: async (params) => {
        if (params.offset === 0) return makePage(200, 201, 0);
        return makePage(1, 201, 200);
      },
    });
    const enumerator = new SpicetifyTracksEnumerator(platform);
    const result = await enumerator.enumerate(likedRequest(), neverAborted(), vi.fn());
    result.forEach((t, i) => expect(t.position).toBe(i));
  });
});

// ---------------------------------------------------------------------------
// Local-file filtering
// ---------------------------------------------------------------------------

describe('SpicetifyTracksEnumerator — local-file filtering', () => {
  it('returns empty array when all items are local files', async () => {
    const platform = makePlatform({
      getTracks: async () => ({
        items: [makeLocalItem(0), makeLocalItem(1), makeLocalItem(2)],
        totalLength: 3,
        offset: 0,
        limit: 200,
      }),
    });
    const enumerator = new SpicetifyTracksEnumerator(platform);
    const result = await enumerator.enumerate(likedRequest(), neverAborted(), vi.fn());
    expect(result).toHaveLength(0);
  });

  it('filters out local items and keeps track items with correct post-filter positions', async () => {
    const platform = makePlatform({
      getTracks: async () => ({
        items: [makeLocalItem(0), makeItem(1), makeLocalItem(2), makeItem(3)],
        totalLength: 4,
        offset: 0,
        limit: 200,
      }),
    });
    const enumerator = new SpicetifyTracksEnumerator(platform);
    const result = await enumerator.enumerate(likedRequest(), neverAborted(), vi.fn());
    expect(result).toHaveLength(2);
    // Positions reset to 0, 1 (post-filter)
    expect(result[0]?.position).toBe(0);
    expect(result[1]?.position).toBe(1);
  });

  it('preserves track URIs correctly after local filtering', async () => {
    const platform = makePlatform({
      getTracks: async () => ({
        items: [makeLocalItem(0), makeItem(5)],
        totalLength: 2,
        offset: 0,
        limit: 200,
      }),
    });
    const enumerator = new SpicetifyTracksEnumerator(platform);
    const result = await enumerator.enumerate(likedRequest(), neverAborted(), vi.fn());
    expect(result[0]?.uri).toBe('spotify:track:TRACK0005');
  });
});

// ---------------------------------------------------------------------------
// Abort
// ---------------------------------------------------------------------------

describe('SpicetifyTracksEnumerator — abort', () => {
  it('throws AbortError immediately when signal is already aborted (no host call)', async () => {
    const getTracks = vi.fn();
    const platform = makePlatform({ getTracks });
    const enumerator = new SpicetifyTracksEnumerator(platform);
    await expect(
      enumerator.enumerate(likedRequest(), alreadyAborted(), vi.fn()),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(getTracks).not.toHaveBeenCalled();
  });

  it('throws AbortError between pages when signal is aborted after first page', async () => {
    const controller = new AbortController();
    let callCount = 0;
    const platform = makePlatform({
      getTracks: async () => {
        callCount++;
        // After first page completes, abort
        if (callCount === 1) {
          controller.abort();
          return makePage(200, 401, 0);
        }
        return makePage(200, 401, 200);
      },
    });
    const enumerator = new SpicetifyTracksEnumerator(platform);
    await expect(
      enumerator.enumerate(likedRequest(), controller.signal, vi.fn()),
    ).rejects.toMatchObject({ name: 'AbortError' });
    // Only one host call before abort check fires
    expect(callCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Precheck errors
// ---------------------------------------------------------------------------

describe('SpicetifyTracksEnumerator — precheck', () => {
  it('throws enumerator-failed synchronously for playlist with empty playlistUri (no host call)', async () => {
    const getTracks = vi.fn();
    const getContents = vi.fn();
    const platform = makePlatform({ getTracks, getContents });
    const enumerator = new SpicetifyTracksEnumerator(platform);
    const request: ScanRequest = { kind: 'playlist', playlistUri: '' };
    await expect(
      enumerator.enumerate(request, neverAborted(), vi.fn()),
    ).rejects.toSatisfy(
      (e: unknown) => isDetectionError(e) && e.reason === 'enumerator-failed',
    );
    expect(getContents).not.toHaveBeenCalled();
    expect(getTracks).not.toHaveBeenCalled();
  });

  it('throws enumerator-failed synchronously for playlist with non-spotify:playlist: URI', async () => {
    const getContents = vi.fn();
    const platform = makePlatform({ getContents });
    const enumerator = new SpicetifyTracksEnumerator(platform);
    const request: ScanRequest = { kind: 'playlist', playlistUri: 'spotify:track:XYZ' };
    await expect(
      enumerator.enumerate(request, neverAborted(), vi.fn()),
    ).rejects.toSatisfy(
      (e: unknown) => isDetectionError(e) && e.reason === 'enumerator-failed',
    );
    expect(getContents).not.toHaveBeenCalled();
  });

  it('precheck error carries context.phase = precheck', async () => {
    const platform = makePlatform({});
    const enumerator = new SpicetifyTracksEnumerator(platform);
    let caughtError: unknown;
    try {
      await enumerator.enumerate(
        { kind: 'playlist', playlistUri: '' },
        neverAborted(),
        vi.fn(),
      );
    } catch (e) {
      caughtError = e;
    }
    expect(isDetectionError(caughtError)).toBe(true);
    const err = caughtError as DetectionError;
    expect(err.context?.['phase']).toBe('precheck');
  });
});

// ---------------------------------------------------------------------------
// Host errors
// ---------------------------------------------------------------------------

describe('SpicetifyTracksEnumerator — host errors', () => {
  it('wraps getTracks rejection as enumerator-failed with cause', async () => {
    const original = new Error('network down');
    const platform = makePlatform({
      getTracks: async () => { throw original; },
    });
    const enumerator = new SpicetifyTracksEnumerator(platform);
    await expect(
      enumerator.enumerate(likedRequest(), neverAborted(), vi.fn()),
    ).rejects.toSatisfy(
      (e: unknown) => isDetectionError(e) && e.reason === 'enumerator-failed' && (e as DetectionError).cause === original,
    );
  });

  it('maps "access token expired" message to auth-token-expired', async () => {
    const platform = makePlatform({
      getTracks: async () => { throw new Error('The access token expired'); },
    });
    const enumerator = new SpicetifyTracksEnumerator(platform);
    await expect(
      enumerator.enumerate(likedRequest(), neverAborted(), vi.fn()),
    ).rejects.toSatisfy(
      (e: unknown) => isDetectionError(e) && e.reason === 'auth-token-expired',
    );
  });

  it('maps "Access Token Expired" (case-insensitive) to auth-token-expired', async () => {
    const platform = makePlatform({
      getTracks: async () => { throw new Error('Access Token Expired, please refresh'); },
    });
    const enumerator = new SpicetifyTracksEnumerator(platform);
    await expect(
      enumerator.enumerate(likedRequest(), neverAborted(), vi.fn()),
    ).rejects.toSatisfy(
      (e: unknown) => isDetectionError(e) && e.reason === 'auth-token-expired',
    );
  });

  it('treats page with non-number totalLength as shape drift → enumerator-failed', async () => {
    const platform = makePlatform({
      getTracks: async () => ({ items: [], totalLength: 'not-a-number' }),
    });
    const enumerator = new SpicetifyTracksEnumerator(platform);
    let caughtError: unknown;
    try {
      await enumerator.enumerate(likedRequest(), neverAborted(), vi.fn());
    } catch (e) {
      caughtError = e;
    }
    expect(isDetectionError(caughtError)).toBe(true);
    const err = caughtError as DetectionError;
    expect(err.reason).toBe('enumerator-failed');
    expect(err.context?.['phase']).toBe('validating');
  });

  it('treats page without items array as shape drift → enumerator-failed', async () => {
    const platform = makePlatform({
      getTracks: async () => ({ totalLength: 1 }),
    });
    const enumerator = new SpicetifyTracksEnumerator(platform);
    await expect(
      enumerator.enumerate(likedRequest(), neverAborted(), vi.fn()),
    ).rejects.toSatisfy(
      (e: unknown) => isDetectionError(e) && e.reason === 'enumerator-failed',
    );
  });

  it('throws enumerator-failed with phase:validating-item when item missing artists', async () => {
    const badItem = { type: 'track', uri: 'spotify:track:AAAA', name: 'Bad', album: { uri: '', name: '' } };
    const platform = makePlatform({
      getTracks: async () => ({ items: [badItem], totalLength: 1 }),
    });
    const enumerator = new SpicetifyTracksEnumerator(platform);
    let caughtError: unknown;
    try {
      await enumerator.enumerate(likedRequest(), neverAborted(), vi.fn());
    } catch (e) {
      caughtError = e;
    }
    expect(isDetectionError(caughtError)).toBe(true);
    const err = caughtError as DetectionError;
    expect(err.reason).toBe('enumerator-failed');
    expect(err.context?.['phase']).toBe('validating-item');
    expect(err.context?.['missingField']).toBe('artists');
  });

  it('throws enumerator-failed with phase:validating-item when item missing uri', async () => {
    const badItem = { type: 'track', name: 'Bad', album: { uri: '', name: '' }, artists: [{ uri: '', name: 'A' }] };
    const platform = makePlatform({
      getTracks: async () => ({ items: [badItem], totalLength: 1 }),
    });
    const enumerator = new SpicetifyTracksEnumerator(platform);
    let caughtError: unknown;
    try {
      await enumerator.enumerate(likedRequest(), neverAborted(), vi.fn());
    } catch (e) {
      caughtError = e;
    }
    expect(isDetectionError(caughtError)).toBe(true);
    const err = caughtError as DetectionError;
    expect(err.reason).toBe('enumerator-failed');
    expect(err.context?.['phase']).toBe('validating-item');
    expect(err.context?.['missingField']).toBe('uri');
  });
});

// ---------------------------------------------------------------------------
// Progress events
// ---------------------------------------------------------------------------

describe('SpicetifyTracksEnumerator — progress events', () => {
  it('emits one progress event per page', async () => {
    const onProgress = vi.fn<(e: ProgressEvent) => void>();
    const platform = makePlatform({
      getTracks: async (params) => {
        if (params.offset === 0) return makePage(200, 201, 0);
        return makePage(1, 201, 200);
      },
    });
    const enumerator = new SpicetifyTracksEnumerator(platform);
    await enumerator.enumerate(likedRequest(), neverAborted(), onProgress);
    expect(onProgress).toHaveBeenCalledTimes(2);
  });

  it('progress event total equals host totalLength', async () => {
    const onProgress = vi.fn<(e: ProgressEvent) => void>();
    const platform = makePlatform({
      getTracks: async () => makePage(5, 42),
    });
    const enumerator = new SpicetifyTracksEnumerator(platform);
    await enumerator.enumerate(likedRequest(), neverAborted(), onProgress);
    const event = onProgress.mock.calls[0]![0] as ProgressEvent;
    expect(event.stage).toBe('enumerating');
    expect(event.total).toBe(42);
  });

  it('progress event processed is post-filter cumulative count', async () => {
    const onProgress = vi.fn<(e: ProgressEvent) => void>();
    const platform = makePlatform({
      getTracks: async () => ({
        items: [makeLocalItem(0), makeItem(1), makeItem(2)],
        totalLength: 3,
        offset: 0,
        limit: 200,
      }),
    });
    const enumerator = new SpicetifyTracksEnumerator(platform);
    await enumerator.enumerate(likedRequest(), neverAborted(), onProgress);
    const event = onProgress.mock.calls[0]![0] as ProgressEvent;
    // 1 local filtered → processed = 2
    expect(event.processed).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Playlist path
// ---------------------------------------------------------------------------

describe('SpicetifyTracksEnumerator — playlist path', () => {
  it('calls PlaylistAPI.getContents for playlist requests, not LibraryAPI.getTracks', async () => {
    const platform = makePlatform({
      getTracks: vi.fn<GetTracks>(),
      getContents: async () => makePage(3, 3),
    });
    const enumerator = new SpicetifyTracksEnumerator(platform);
    await enumerator.enumerate(
      playlistRequest(),
      neverAborted(),
      vi.fn(),
    );
    expect(platform.PlaylistAPI.getContents).toHaveBeenCalled();
    expect(platform.LibraryAPI.getTracks).not.toHaveBeenCalled();
  });

  it('passes the playlistUri to getContents', async () => {
    const platform = makePlatform({
      getContents: async () => makePage(1, 1),
    });
    const enumerator = new SpicetifyTracksEnumerator(platform);
    const uri = 'spotify:playlist:MYPLAYLIST123';
    await enumerator.enumerate(
      { kind: 'playlist', playlistUri: uri },
      neverAborted(),
      vi.fn(),
    );
    expect(platform.PlaylistAPI.getContents).toHaveBeenCalledWith(
      uri,
      expect.objectContaining({ offset: 0 }),
    );
  });

  it('extracts id from track uri correctly', async () => {
    const platform = makePlatform({
      getTracks: async () => ({
        items: [makeItem(7)],
        totalLength: 1,
        offset: 0,
        limit: 200,
      }),
    });
    const enumerator = new SpicetifyTracksEnumerator(platform);
    const result = await enumerator.enumerate(likedRequest(), neverAborted(), vi.fn());
    expect(result[0]?.id).toBe('TRACK0007');
  });
});

// ---------------------------------------------------------------------------
// globalThis fallback (no-arg constructor)
// ---------------------------------------------------------------------------

describe('SpicetifyTracksEnumerator — globalThis fallback', () => {
  it('reads Platform from globalThis.Spicetify when constructed with no argument', async () => {
    const platform = makePlatform({
      getTracks: async () => makePage(1, 1),
    });
    const prev = (globalThis as Record<string, unknown>)['Spicetify'];
    try {
      (globalThis as Record<string, unknown>)['Spicetify'] = { Platform: platform };
      const enumerator = new SpicetifyTracksEnumerator(); // no arg — triggers fallback branch
      const result = await enumerator.enumerate(likedRequest(), neverAborted(), vi.fn());
      expect(result).toHaveLength(1);
      expect(result[0]?.position).toBe(0);
      expect(platform.LibraryAPI.getTracks).toHaveBeenCalledTimes(1);
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
// isLibraryTrackItem
// ---------------------------------------------------------------------------

describe('isLibraryTrackItem', () => {
  it('returns true for a valid item', () => {
    expect(isLibraryTrackItem(makeItem(0))).toBe(true);
  });

  it('returns false for an item without artists', () => {
    expect(isLibraryTrackItem({ type: 'track', uri: 'spotify:track:X', name: 'A', album: { uri: '', name: '' } })).toBe(false);
  });

  it('returns false for an item with empty artists array', () => {
    expect(isLibraryTrackItem({ ...makeItem(0), artists: [] })).toBe(false);
  });

  it('returns false when uri is missing', () => {
    const item = { ...makeItem(0) };
    delete (item as Record<string, unknown>)['uri'];
    expect(isLibraryTrackItem(item)).toBe(false);
  });

  it('returns false for non-string uri', () => {
    expect(isLibraryTrackItem({ ...makeItem(0), uri: 42 })).toBe(false);
  });

  it('returns false for non-object', () => {
    expect(isLibraryTrackItem(null)).toBe(false);
    expect(isLibraryTrackItem('string')).toBe(false);
    expect(isLibraryTrackItem(42)).toBe(false);
  });

  it('returns false when type is not track', () => {
    expect(isLibraryTrackItem({ ...makeItem(0), type: 'episode' })).toBe(false);
  });

  it('returns true for a local file item (spotify:local: URI)', () => {
    expect(isLibraryTrackItem(makeLocalItem(0))).toBe(true);
  });

  it('returns false when name is missing (non-string)', () => {
    expect(isLibraryTrackItem({ ...makeItem(0), name: undefined })).toBe(false);
  });

  it('returns false when name is a number', () => {
    expect(isLibraryTrackItem({ ...makeItem(0), name: 42 })).toBe(false);
  });

  it('returns false when album is null', () => {
    expect(isLibraryTrackItem({ ...makeItem(0), album: null })).toBe(false);
  });

  it('returns false when album is a number (non-object)', () => {
    expect(isLibraryTrackItem({ ...makeItem(0), album: 42 })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parseLibraryTrackItem
// ---------------------------------------------------------------------------

describe('parseLibraryTrackItem', () => {
  it('parses a valid item', () => {
    const item = makeItem(5);
    const result = parseLibraryTrackItem(item, 0);
    expect(result.uri).toBe(item.uri);
    expect(result.name).toBe(item.name);
    expect(result.artists).toEqual(item.artists);
    expect(result.album).toEqual(item.album);
  });

  it('maps inline duration.milliseconds to durationMs', () => {
    const item = makeItem(5); // duration: { milliseconds: 180005 }
    const result = parseLibraryTrackItem(item, 0);
    expect(result.durationMs).toBe(180005);
  });

  it('durationMs is null when duration is absent', () => {
    const item = {
      type: 'track',
      uri: 'spotify:track:X',
      name: 'N',
      album: { uri: '', name: '' },
      artists: [{ uri: '', name: 'A' }],
    };
    const result = parseLibraryTrackItem(item, 0);
    expect(result.durationMs).toBeNull();
  });

  it('durationMs is null when duration object lacks a numeric milliseconds', () => {
    const item = makeItem(5, { duration: { milliseconds: 'oops' } });
    const result = parseLibraryTrackItem(item, 0);
    expect(result.durationMs).toBeNull();
  });

  it('durationMs is null when milliseconds is non-finite', () => {
    const item = makeItem(5, { duration: { milliseconds: Number.NaN } });
    const result = parseLibraryTrackItem(item, 0);
    expect(result.durationMs).toBeNull();
  });

  it('durationMs is null when duration is not an object', () => {
    const item = makeItem(5, { duration: 180000 });
    const result = parseLibraryTrackItem(item, 0);
    expect(result.durationMs).toBeNull();
  });

  it('durationMs is null when duration is explicitly null', () => {
    const item = makeItem(5, { duration: null });
    const result = parseLibraryTrackItem(item, 0);
    expect(result.durationMs).toBeNull();
  });

  it('throws enumerator-failed when artists is missing with missingField: artists', () => {
    const item = { type: 'track', uri: 'spotify:track:X', name: 'N', album: { uri: '', name: '' } };
    expect(() => parseLibraryTrackItem(item, 0)).toThrow(
      expect.objectContaining({ reason: 'enumerator-failed' }),
    );
    let caughtError: unknown;
    try { parseLibraryTrackItem(item, 0); } catch (e) { caughtError = e; }
    expect((caughtError as DetectionError).context?.['missingField']).toBe('artists');
  });

  it('throws enumerator-failed when uri is missing with missingField: uri', () => {
    const item = { type: 'track', name: 'N', album: { uri: '', name: '' }, artists: [{ uri: '', name: 'A' }] };
    let caughtError: unknown;
    try { parseLibraryTrackItem(item, 0); } catch (e) { caughtError = e; }
    expect(isDetectionError(caughtError)).toBe(true);
    expect((caughtError as DetectionError).context?.['missingField']).toBe('uri');
  });

  it('throws enumerator-failed when name is missing', () => {
    const item = { type: 'track', uri: 'spotify:track:X', album: { uri: '', name: '' }, artists: [{ uri: '', name: 'A' }] };
    expect(() => parseLibraryTrackItem(item, 0)).toThrow(
      expect.objectContaining({ reason: 'enumerator-failed' }),
    );
  });

  it('throws enumerator-failed when artists is empty', () => {
    const item = { type: 'track', uri: 'spotify:track:X', name: 'N', album: { uri: '', name: '' }, artists: [] };
    expect(() => parseLibraryTrackItem(item, 0)).toThrow(
      expect.objectContaining({ reason: 'enumerator-failed' }),
    );
  });
});

// ---------------------------------------------------------------------------
// RawTrack shape
// ---------------------------------------------------------------------------

describe('SpicetifyTracksEnumerator — RawTrack shape', () => {
  it('returns a RawTrack with all required fields', async () => {
    const platform = makePlatform({
      getTracks: async () => ({
        items: [makeItem(42)],
        totalLength: 1,
        offset: 0,
        limit: 200,
      }),
    });
    const enumerator = new SpicetifyTracksEnumerator(platform);
    const result: ReadonlyArray<RawTrack> = await enumerator.enumerate(likedRequest(), neverAborted(), vi.fn());
    const track = result[0]!;
    expect(track.uri).toBe('spotify:track:TRACK0042');
    expect(track.id).toBe('TRACK0042');
    expect(track.name).toBe('Track 42');
    expect(track.position).toBe(0);
    expect(track.artists).toHaveLength(1);
    expect(track.album).toBeDefined();
    expect(track.durationMs).toBe(180042);
  });
});

// ---------------------------------------------------------------------------
// parseLibraryTrackItem — additional coverage for non-object and missing album
// ---------------------------------------------------------------------------

describe('parseLibraryTrackItem — ternary fallbacks', () => {
  it('artist without uri → defaults to empty string uri', () => {
    const item = {
      type: 'track',
      uri: 'spotify:track:X',
      name: 'N',
      album: { uri: 'spotify:album:A', name: 'Album' },
      artists: [{ name: 'Artist A' }], // no uri
    };
    const result = parseLibraryTrackItem(item, 0);
    expect(result.artists[0]?.uri).toBe('');
    expect(result.artists[0]?.name).toBe('Artist A');
  });

  it('artist without name → defaults to empty string name', () => {
    const item = {
      type: 'track',
      uri: 'spotify:track:X',
      name: 'N',
      album: { uri: 'spotify:album:A', name: 'Album' },
      artists: [{ uri: 'spotify:artist:A' }], // no name
    };
    const result = parseLibraryTrackItem(item, 0);
    expect(result.artists[0]?.name).toBe('');
    expect(result.artists[0]?.uri).toBe('spotify:artist:A');
  });

  it('album without uri → defaults to empty string', () => {
    const item = {
      type: 'track',
      uri: 'spotify:track:X',
      name: 'N',
      album: { name: 'Album' }, // no uri
      artists: [{ uri: '', name: 'Artist' }],
    };
    const result = parseLibraryTrackItem(item, 0);
    expect(result.album.uri).toBe('');
    expect(result.album.name).toBe('Album');
  });

  it('album without name → defaults to empty string', () => {
    const item = {
      type: 'track',
      uri: 'spotify:track:X',
      name: 'N',
      album: { uri: 'spotify:album:A' }, // no name
      artists: [{ uri: '', name: 'Artist' }],
    };
    const result = parseLibraryTrackItem(item, 0);
    expect(result.album.name).toBe('');
    expect(result.album.uri).toBe('spotify:album:A');
  });
});

describe('parseLibraryTrackItem — additional branches', () => {
  it('throws enumerator-failed for non-object input (null)', () => {
    let err: unknown;
    try { parseLibraryTrackItem(null, 0); } catch (e) { err = e; }
    expect(isDetectionError(err)).toBe(true);
    expect((err as DetectionError).reason).toBe('enumerator-failed');
    expect((err as DetectionError).context?.['missingField']).toBe('object');
  });

  it('throws enumerator-failed for non-object input (string)', () => {
    let err: unknown;
    try { parseLibraryTrackItem('a string', 0); } catch (e) { err = e; }
    expect(isDetectionError(err)).toBe(true);
    expect((err as DetectionError).reason).toBe('enumerator-failed');
  });

  it('throws enumerator-failed with missingField: album when album is missing', () => {
    const item = {
      type: 'track',
      uri: 'spotify:track:X',
      name: 'N',
      artists: [{ uri: '', name: 'A' }],
      // album intentionally omitted
    };
    let err: unknown;
    try { parseLibraryTrackItem(item, 0); } catch (e) { err = e; }
    expect(isDetectionError(err)).toBe(true);
    expect((err as DetectionError).context?.['missingField']).toBe('album');
  });

  it('throws enumerator-failed when album is null', () => {
    const item = {
      type: 'track',
      uri: 'spotify:track:X',
      name: 'N',
      artists: [{ uri: '', name: 'A' }],
      album: null,
    };
    let err: unknown;
    try { parseLibraryTrackItem(item, 0); } catch (e) { err = e; }
    expect(isDetectionError(err)).toBe(true);
    expect((err as DetectionError).context?.['missingField']).toBe('album');
  });
});

// ---------------------------------------------------------------------------
// SpicetifyTracksEnumerator — page-is-not-object coverage
// ---------------------------------------------------------------------------

describe('SpicetifyTracksEnumerator — page shape: non-object response', () => {
  it('throws enumerator-failed when getTracks returns a non-object (string)', async () => {
    const platform = makePlatform({
      getTracks: async () => 'not-an-object',
    });
    const enumerator = new SpicetifyTracksEnumerator(platform);
    let err: unknown;
    try {
      await enumerator.enumerate(likedRequest(), neverAborted(), vi.fn());
    } catch (e) {
      err = e;
    }
    expect(isDetectionError(err)).toBe(true);
    expect((err as DetectionError).reason).toBe('enumerator-failed');
    expect((err as DetectionError).context?.['phase']).toBe('validating');
  });

  it('throws enumerator-failed when getTracks returns null', async () => {
    const platform = makePlatform({
      getTracks: async () => null,
    });
    const enumerator = new SpicetifyTracksEnumerator(platform);
    await expect(
      enumerator.enumerate(likedRequest(), neverAborted(), vi.fn()),
    ).rejects.toSatisfy(
      (e: unknown) => isDetectionError(e) && (e as DetectionError).reason === 'enumerator-failed',
    );
  });
});

// ---------------------------------------------------------------------------
// SpicetifyTracksEnumerator — looksLikeAuthExpired branch coverage
// ---------------------------------------------------------------------------

describe('SpicetifyTracksEnumerator — auth-expired detection branches', () => {
  it('maps status === 401 on error object to auth-token-expired', async () => {
    const platform = makePlatform({
      getTracks: async () => { throw Object.assign(new Error('forbidden'), { status: 401 }); },
    });
    const enumerator = new SpicetifyTracksEnumerator(platform);
    await expect(
      enumerator.enumerate(likedRequest(), neverAborted(), vi.fn()),
    ).rejects.toSatisfy(
      (e: unknown) => isDetectionError(e) && (e as DetectionError).reason === 'auth-token-expired',
    );
  });

  it('maps message containing "401" to auth-token-expired', async () => {
    const platform = makePlatform({
      getTracks: async () => { throw new Error('HTTP 401 unauthorized'); },
    });
    const enumerator = new SpicetifyTracksEnumerator(platform);
    await expect(
      enumerator.enumerate(likedRequest(), neverAborted(), vi.fn()),
    ).rejects.toSatisfy(
      (e: unknown) => isDetectionError(e) && (e as DetectionError).reason === 'auth-token-expired',
    );
  });

  it('maps "token invalid" message to auth-token-expired', async () => {
    const platform = makePlatform({
      getTracks: async () => { throw new Error('token invalid'); },
    });
    const enumerator = new SpicetifyTracksEnumerator(platform);
    await expect(
      enumerator.enumerate(likedRequest(), neverAborted(), vi.fn()),
    ).rejects.toSatisfy(
      (e: unknown) => isDetectionError(e) && (e as DetectionError).reason === 'auth-token-expired',
    );
  });

  it('non-object cause → enumerator-failed (not auth-token-expired)', async () => {
    const platform = makePlatform({
      getTracks: async () => { throw 'a string error'; },
    });
    const enumerator = new SpicetifyTracksEnumerator(platform);
    await expect(
      enumerator.enumerate(likedRequest(), neverAborted(), vi.fn()),
    ).rejects.toSatisfy(
      (e: unknown) => isDetectionError(e) && (e as DetectionError).reason === 'enumerator-failed',
    );
  });

  it('error with non-string message → enumerator-failed (not auth-token-expired)', async () => {
    const cause = Object.assign(new Error(), { message: 42 });
    const platform = makePlatform({
      getTracks: async () => { throw cause; },
    });
    const enumerator = new SpicetifyTracksEnumerator(platform);
    await expect(
      enumerator.enumerate(likedRequest(), neverAborted(), vi.fn()),
    ).rejects.toSatisfy(
      (e: unknown) => isDetectionError(e) && (e as DetectionError).reason === 'enumerator-failed',
    );
  });
});

// ---------------------------------------------------------------------------
// SpicetifyTracksEnumerator — isLocalFile with non-object item
// ---------------------------------------------------------------------------

describe('SpicetifyTracksEnumerator — isLocalFile branch', () => {
  it('treats non-object items in array as non-local (falls through to parseItem which throws)', async () => {
    // When an item in the page is a primitive, isLocalFile returns false,
    // and parseLibraryTrackItem throws enumerator-failed.
    const platform = makePlatform({
      getTracks: async () => ({
        items: [42], // primitive item
        totalLength: 1,
        offset: 0,
        limit: 200,
      }),
    });
    const enumerator = new SpicetifyTracksEnumerator(platform);
    await expect(
      enumerator.enumerate(likedRequest(), neverAborted(), vi.fn()),
    ).rejects.toSatisfy(
      (e: unknown) => isDetectionError(e) && (e as DetectionError).reason === 'enumerator-failed',
    );
  });
});
