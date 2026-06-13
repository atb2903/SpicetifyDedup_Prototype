/**
 * Tests for `trackRefKey` + `applyRemovalOutcome` (WP02 / T007, T008).
 *
 * Pure domain — no host, no DOM, no re-scan. Drives 100% line+branch coverage
 * on `src/domain/apply-removal-outcome.ts`.
 *
 * Count invariant: after EVERY scenario we assert
 * `removableTrackCount === duplicateTrackCount − groups.length` via
 * {@link expectCountInvariant}, so recompute drift is caught.
 */
import { describe, it, expect } from 'vitest';
import {
  trackRefKey,
  applyRemovalOutcome,
} from '../../src/domain/apply-removal-outcome';
import { RemovalError, isRemovalError } from '../../src/domain/removal-errors';
import type {
  DetectionResult,
  DuplicateGroup,
  EnrichedTrack,
} from '../../src/domain/detection-types';
import type {
  RemovalTarget,
  RemovalOutcome,
  TrackRef,
} from '../../src/domain/removal-types';

// ── Local fixture builders (SRP: not shared across files) ────────────────────

function track(position: number, opts?: { uri?: string; uid?: string }): EnrichedTrack {
  const uri = opts?.uri ?? `spotify:track:t${position}`;
  const t: EnrichedTrack = {
    position,
    uri,
    canonicalUri: uri,
    name: `Song ${position}`,
    artists: [{ name: 'Artist' }],
    durationMs: 200000,
  };
  return opts?.uid === undefined ? t : { ...t, uid: opts.uid };
}

function group(id: string, members: EnrichedTrack[]): DuplicateGroup {
  return { id, reason: 'same-canonical-uri', members, defaultKeepIndex: 0 };
}

function resultOf(groups: DuplicateGroup[]): DetectionResult {
  const duplicateTrackCount = groups.reduce((s, g) => s + g.members.length, 0);
  return {
    collectionKey: 'liked-songs',
    completedAt: 4242,
    groups,
    duplicateTrackCount,
    removableTrackCount: duplicateTrackCount - groups.length,
    skippedLocalCount: 3,
    unenrichedCount: 7,
    scannedTrackCount: duplicateTrackCount + 10,
  };
}

/** The recompute invariant that must hold on every returned DetectionResult. */
function expectCountInvariant(r: DetectionResult): void {
  expect(r.removableTrackCount).toBe(r.duplicateTrackCount - r.groups.length);
  expect(r.duplicateTrackCount).toBe(
    r.groups.reduce((s, g) => s + g.members.length, 0),
  );
}

const LIKED: RemovalTarget = { kind: 'liked-songs' };
const PLAYLIST: RemovalTarget = { kind: 'playlist', playlistUri: 'spotify:playlist:p1' };
const EMPTY: RemovalOutcome = { removed: [], failed: [] };

function ref(uri: string, uid?: string): TrackRef {
  return uid === undefined ? { uri } : { uri, uid };
}

// ── trackRefKey ──────────────────────────────────────────────────────────────

describe('trackRefKey', () => {
  it('keys by uri for liked-songs', () => {
    expect(trackRefKey(LIKED, ref('spotify:track:x'))).toBe('spotify:track:x');
  });

  it('keys by uid for playlists', () => {
    expect(trackRefKey(PLAYLIST, ref('spotify:track:x', 'uid-9'))).toBe('uid-9');
  });

  it('throws malformed-result when a playlist ref lacks a uid', () => {
    try {
      trackRefKey(PLAYLIST, ref('spotify:track:x'));
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(isRemovalError(e)).toBe(true);
      const err = e as RemovalError;
      expect(err.code).toBe('malformed-result');
      expect(err.context?.reason).toBe('playlist-ref-missing-uid');
    }
  });

  it('throws when a playlist ref uid is an empty string', () => {
    expect(() => trackRefKey(PLAYLIST, ref('spotify:track:x', ''))).toThrow(RemovalError);
  });
});

// ── applyRemovalOutcome ──────────────────────────────────────────────────────

describe('applyRemovalOutcome', () => {
  it('full success collapses all groups → removableTrackCount 0, groups empty (AS-7)', () => {
    const r = resultOf([
      group('g0', [track(0), track(1)]),
      group('g1', [track(2), track(3), track(4)]),
    ]);
    const outcome: RemovalOutcome = {
      removed: [ref('spotify:track:t1'), ref('spotify:track:t3'), ref('spotify:track:t4')],
      failed: [],
    };
    const next = applyRemovalOutcome(r, outcome, LIKED);
    expect(next.groups).toHaveLength(0);
    expect(next.removableTrackCount).toBe(0);
    expect(next.duplicateTrackCount).toBe(0);
    expectCountInvariant(next);
  });

  it('partial removal keeps groups with ≥2 survivors', () => {
    const r = resultOf([group('g0', [track(0), track(1), track(2)])]);
    // remove only t2 → 2 survivors → group remains
    const next = applyRemovalOutcome(r, { removed: [ref('spotify:track:t2')], failed: [] }, LIKED);
    expect(next.groups).toHaveLength(1);
    expect(next.groups[0].members).toHaveLength(2);
    expect(next.duplicateTrackCount).toBe(2);
    expect(next.removableTrackCount).toBe(1);
    expectCountInvariant(next);
  });

  it('collapses a group that drops below 2 survivors', () => {
    const r = resultOf([group('g0', [track(0), track(1), track(2)])]);
    // remove t1 and t2 → 1 survivor → group collapses
    const outcome: RemovalOutcome = {
      removed: [ref('spotify:track:t1'), ref('spotify:track:t2')],
      failed: [],
    };
    const next = applyRemovalOutcome(r, outcome, LIKED);
    expect(next.groups).toHaveLength(0);
    expect(next.removableTrackCount).toBe(0);
    expectCountInvariant(next);
  });

  it('empty outcome returns a structurally unchanged result', () => {
    const r = resultOf([group('g0', [track(0), track(1)])]);
    const next = applyRemovalOutcome(r, EMPTY, LIKED);
    expect(next.groups).toHaveLength(1);
    expect(next.duplicateTrackCount).toBe(r.duplicateTrackCount);
    expect(next.removableTrackCount).toBe(r.removableTrackCount);
    expect(next.groups[0].members).toHaveLength(2);
    expectCountInvariant(next);
  });

  it('all-failed leaves counts unchanged and keeps failed copies visible (AS-8)', () => {
    const r = resultOf([group('g0', [track(0), track(1)])]);
    const outcome: RemovalOutcome = {
      removed: [],
      failed: [{ track: ref('spotify:track:t1'), reason: 'network' }],
    };
    const next = applyRemovalOutcome(r, outcome, LIKED);
    expect(next.groups).toHaveLength(1);
    expect(next.groups[0].members).toHaveLength(2);
    expect(next.removableTrackCount).toBe(r.removableTrackCount);
    expectCountInvariant(next);
  });

  it('retains a failed copy while dropping a removed sibling', () => {
    const r = resultOf([group('g0', [track(0), track(1), track(2)])]);
    const outcome: RemovalOutcome = {
      removed: [ref('spotify:track:t1')],
      failed: [{ track: ref('spotify:track:t2'), reason: 'rate-limited' }],
    };
    const next = applyRemovalOutcome(r, outcome, LIKED);
    // t1 dropped, t0 + t2 survive → group remains with 2 members
    expect(next.groups).toHaveLength(1);
    const uris = next.groups[0].members.map((m) => m.uri);
    expect(uris).toEqual(['spotify:track:t0', 'spotify:track:t2']);
    expectCountInvariant(next);
  });

  it('throws outcome-mismatch when a removed key matches no member', () => {
    const r = resultOf([group('g0', [track(0), track(1)])]);
    const outcome: RemovalOutcome = { removed: [ref('spotify:track:ghost')], failed: [] };
    try {
      applyRemovalOutcome(r, outcome, LIKED);
      expect.unreachable('should have thrown');
    } catch (e) {
      const err = e as RemovalError;
      expect(err.code).toBe('outcome-mismatch');
      expect(err.context?.key).toBe('spotify:track:ghost');
    }
  });

  it('preserves scan-time diagnostics unchanged', () => {
    const r = resultOf([group('g0', [track(0), track(1), track(2)])]);
    const next = applyRemovalOutcome(r, { removed: [ref('spotify:track:t2')], failed: [] }, LIKED);
    expect(next.collectionKey).toBe(r.collectionKey);
    expect(next.completedAt).toBe(r.completedAt);
    expect(next.skippedLocalCount).toBe(r.skippedLocalCount);
    expect(next.unenrichedCount).toBe(r.unenrichedCount);
    expect(next.scannedTrackCount).toBe(r.scannedTrackCount);
    expectCountInvariant(next);
  });

  it('does not mutate the input DetectionResult', () => {
    const r = resultOf([group('g0', [track(0), track(1), track(2)])]);
    const next = applyRemovalOutcome(r, { removed: [ref('spotify:track:t2')], failed: [] }, LIKED);
    // original untouched
    expect(r.groups).toHaveLength(1);
    expect(r.groups[0].members).toHaveLength(3);
    expect(r.duplicateTrackCount).toBe(3);
    // returned is a distinct object
    expect(next).not.toBe(r);
    expect(next.groups).not.toBe(r.groups);
  });

  it('playlist: removing one uid drops that occurrence and keeps the same-uri sibling', () => {
    // two members share a uri but differ by uid (a repeated track in a playlist)
    const m0 = track(0, { uri: 'spotify:track:dup', uid: 'uid-keep' });
    const m1 = track(1, { uri: 'spotify:track:dup', uid: 'uid-drop' });
    const m2 = track(2, { uri: 'spotify:track:dup', uid: 'uid-other' });
    const r = resultOf([group('g0', [m0, m1, m2])]);
    const outcome: RemovalOutcome = {
      removed: [ref('spotify:track:dup', 'uid-drop')],
      failed: [],
    };
    const next = applyRemovalOutcome(r, outcome, PLAYLIST);
    expect(next.groups).toHaveLength(1);
    const uids = next.groups[0].members.map((m) => m.uid);
    expect(uids).toEqual(['uid-keep', 'uid-other']);
    expectCountInvariant(next);
  });

  it('idempotence: re-applying an all-success outcome throws outcome-mismatch', () => {
    const r = resultOf([group('g0', [track(0), track(1)])]);
    const outcome: RemovalOutcome = { removed: [ref('spotify:track:t1')], failed: [] };
    const once = applyRemovalOutcome(r, outcome, LIKED);
    expect(once.groups).toHaveLength(0);
    // applying the same outcome again: t1 is no longer present → mismatch
    expect(() => applyRemovalOutcome(once, outcome, LIKED)).toThrow(RemovalError);
  });

  it('handles multiple groups with mixed collapse and survival', () => {
    const r = resultOf([
      group('g0', [track(0), track(1)]), // remove t1 → collapses
      group('g1', [track(2), track(3), track(4)]), // remove t4 → 2 survive
    ]);
    const outcome: RemovalOutcome = {
      removed: [ref('spotify:track:t1'), ref('spotify:track:t4')],
      failed: [],
    };
    const next = applyRemovalOutcome(r, outcome, LIKED);
    expect(next.groups).toHaveLength(1);
    expect(next.groups[0].id).toBe('g1');
    expect(next.groups[0].members).toHaveLength(2);
    expect(next.duplicateTrackCount).toBe(2);
    expect(next.removableTrackCount).toBe(1);
    expectCountInvariant(next);
  });
});
