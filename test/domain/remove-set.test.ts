/**
 * Tests for `isRemovableResult` + `computeRemoveSet` (WP02 / T005, T006, T008).
 *
 * Pure domain — no host, no DOM. Drives 100% line+branch coverage on
 * `src/domain/remove-set.ts`. TDD: each behaviour asserted before the function
 * exists, then implemented to make it pass.
 *
 * Boundary discipline (charter): group of exactly 2 → 1 removed; group of N →
 * N−1; empty groups → empty set; the count invariant
 * `removableTrackCount === duplicateTrackCount − groups.length` is asserted via
 * the fixture builder so a malformed fixture is caught at construction.
 */
import { describe, it, expect } from 'vitest';
import { isRemovableResult, computeRemoveSet } from '../../src/domain/remove-set';
import { RemovalError, isRemovalError } from '../../src/domain/removal-errors';
import type {
  DetectionResult,
  DuplicateGroup,
  EnrichedTrack,
} from '../../src/domain/detection-types';
import type { RemovalTarget } from '../../src/domain/removal-types';

// ── Local fixture builders (SRP: not shared across files) ────────────────────

/**
 * Build one `EnrichedTrack` at `position`. `uid` is attached only when given so
 * the liked-songs (uid-absent) and playlist (uid-present) paths are both
 * reachable from fixtures.
 */
function track(position: number, uid?: string): EnrichedTrack {
  const t: EnrichedTrack = {
    position,
    uri: `spotify:track:t${position}`,
    canonicalUri: `spotify:track:t${position}`,
    name: `Song ${position}`,
    artists: [{ name: 'Artist' }],
    durationMs: 200000,
  };
  return uid === undefined ? t : { ...t, uid };
}

/**
 * Build a duplicate group from explicit members. Positions must be ascending;
 * `defaultKeepIndex` is 0 per FR-007.
 */
function group(id: string, members: EnrichedTrack[]): DuplicateGroup {
  return { id, reason: 'same-canonical-uri', members, defaultKeepIndex: 0 };
}

/**
 * Build a well-formed `DetectionResult` from the given groups, computing the
 * derived counts so the size invariant holds by construction. Callers that want
 * a *malformed* result tweak the returned object.
 */
function resultOf(groups: DuplicateGroup[]): DetectionResult {
  const duplicateTrackCount = groups.reduce((s, g) => s + g.members.length, 0);
  return {
    collectionKey: 'liked-songs',
    completedAt: 1000,
    groups,
    duplicateTrackCount,
    removableTrackCount: duplicateTrackCount - groups.length,
    skippedLocalCount: 0,
    unenrichedCount: 0,
    scannedTrackCount: duplicateTrackCount + 5,
  };
}

const LIKED: RemovalTarget = { kind: 'liked-songs' };
const PLAYLIST: RemovalTarget = { kind: 'playlist', playlistUri: 'spotify:playlist:p1' };

// ── isRemovableResult ─────────────────────────────────────────────────────────

describe('isRemovableResult', () => {
  it('returns true for a well-formed result with groups', () => {
    const r = resultOf([group('g0', [track(0), track(1)])]);
    expect(isRemovableResult(r)).toBe(true);
  });

  it('returns true for an empty-groups result (zero removable is well-formed)', () => {
    expect(isRemovableResult(resultOf([]))).toBe(true);
  });

  it('never throws — totality on hostile input', () => {
    expect(() => isRemovableResult(undefined)).not.toThrow();
    expect(() => isRemovableResult(Symbol('x'))).not.toThrow();
  });

  it('returns false for null', () => {
    expect(isRemovableResult(null)).toBe(false);
  });

  it('returns false for a non-object', () => {
    expect(isRemovableResult(42)).toBe(false);
    expect(isRemovableResult('result')).toBe(false);
  });

  it('returns false when collectionKey is not a string', () => {
    const r = { ...resultOf([]), collectionKey: 123 };
    expect(isRemovableResult(r)).toBe(false);
  });

  it('returns false when groups is not an array', () => {
    const r = { ...resultOf([]), groups: 'nope' };
    expect(isRemovableResult(r)).toBe(false);
  });

  it('returns false when duplicateTrackCount is not a number', () => {
    const r = { ...resultOf([]), duplicateTrackCount: '2' };
    expect(isRemovableResult(r)).toBe(false);
  });

  it('returns false when removableTrackCount is not a number', () => {
    const r = { ...resultOf([]), removableTrackCount: null as unknown };
    expect(isRemovableResult(r)).toBe(false);
  });

  it('returns false when skippedLocalCount is not a number', () => {
    const r = { ...resultOf([]), skippedLocalCount: '0' };
    expect(isRemovableResult(r)).toBe(false);
  });

  it('returns false when unenrichedCount is not a number', () => {
    const r = { ...resultOf([]), unenrichedCount: '0' };
    expect(isRemovableResult(r)).toBe(false);
  });

  it('returns false when scannedTrackCount is not a number', () => {
    const r = { ...resultOf([]), scannedTrackCount: '0' };
    expect(isRemovableResult(r)).toBe(false);
  });

  it('returns false when completedAt is not a number', () => {
    const r = { ...resultOf([]), completedAt: '1000' };
    expect(isRemovableResult(r)).toBe(false);
  });

  it('returns false when a group is not an object', () => {
    const r = { ...resultOf([]), groups: [null] };
    expect(isRemovableResult(r)).toBe(false);
  });

  it('returns false when a group members is not an array', () => {
    const r = resultOf([group('g0', [track(0), track(1)])]);
    const bad = {
      ...r,
      groups: [{ ...r.groups[0], members: 'x' }],
    };
    expect(isRemovableResult(bad)).toBe(false);
  });

  it('returns false when a group has fewer than 2 members', () => {
    const r = resultOf([group('g0', [track(0), track(1)])]);
    const bad = { ...r, groups: [{ ...r.groups[0], members: [track(0)] }] };
    expect(isRemovableResult(bad)).toBe(false);
  });

  it('returns false when defaultKeepIndex is not 0', () => {
    const r = resultOf([group('g0', [track(0), track(1)])]);
    const bad = { ...r, groups: [{ ...r.groups[0], defaultKeepIndex: 1 }] };
    expect(isRemovableResult(bad)).toBe(false);
  });

  it('returns false when members are not ascending by position (equal)', () => {
    const r = resultOf([group('g0', [track(0), track(0)])]);
    expect(isRemovableResult(r)).toBe(false);
  });

  it('returns false when members are not ascending by position (descending)', () => {
    const r = resultOf([group('g0', [track(5), track(1)])]);
    expect(isRemovableResult(r)).toBe(false);
  });

  it('returns false when a member is not an object', () => {
    const r = resultOf([group('g0', [track(0), track(1)])]);
    const bad = { ...r, groups: [{ ...r.groups[0], members: [track(0), null] }] };
    expect(isRemovableResult(bad)).toBe(false);
  });

  it('returns false when a member position is not a number', () => {
    const r = resultOf([group('g0', [track(0), track(1)])]);
    const bad = {
      ...r,
      groups: [{ ...r.groups[0], members: [{ ...track(0), position: '0' }, track(1)] }],
    };
    expect(isRemovableResult(bad)).toBe(false);
  });

  it('accepts a three-member ascending group', () => {
    const r = resultOf([group('g0', [track(0), track(2), track(4)])]);
    expect(isRemovableResult(r)).toBe(true);
  });
});

// ── computeRemoveSet ────────────────────────────────────────────────────────

describe('computeRemoveSet', () => {
  it('throws malformed-result (not-removable-result) when input fails the classifier', () => {
    const bad = resultOf([group('g0', [track(0)])]); // group of 1 → not removable
    try {
      computeRemoveSet(bad, LIKED);
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(isRemovalError(e)).toBe(true);
      const err = e as RemovalError;
      expect(err.code).toBe('malformed-result');
      expect(err.context?.reason).toBe('not-removable-result');
    }
  });

  it('returns an empty remove-set for empty groups (total, no throw)', () => {
    const set = computeRemoveSet(resultOf([]), LIKED);
    expect(set.collectionKey).toBe('liked-songs');
    expect(set.tracks).toEqual([]);
  });

  it('removes exactly 1 for a group of exactly 2 (boundary), keeping index 0', () => {
    const keep = track(0);
    const drop = track(3);
    const set = computeRemoveSet(resultOf([group('g0', [keep, drop])]), LIKED);
    expect(set.tracks).toHaveLength(1);
    expect(set.tracks[0].uri).toBe(drop.uri);
    expect(set.tracks.some((t) => t.uri === keep.uri)).toBe(false);
  });

  it('removes N−1 for a group of N; the kept ref never appears', () => {
    const keep = track(0);
    const members = [keep, track(1), track(2), track(3)];
    const set = computeRemoveSet(resultOf([group('g0', members)]), LIKED);
    expect(set.tracks).toHaveLength(3);
    expect(set.tracks.some((t) => t.uri === keep.uri)).toBe(false);
  });

  it('omits uid for liked-songs targets even when members carry one', () => {
    const members = [track(0, 'uidA'), track(1, 'uidB')];
    const set = computeRemoveSet(resultOf([group('g0', members)]), LIKED);
    expect(set.tracks).toHaveLength(1);
    expect(set.tracks[0].uid).toBeUndefined();
    expect('uid' in set.tracks[0]).toBe(false);
  });

  it('carries uid for playlist targets when every member has one', () => {
    const members = [track(0, 'uidKeep'), track(1, 'uidDrop')];
    const set = computeRemoveSet(resultOf([group('g0', members)]), PLAYLIST);
    expect(set.tracks).toHaveLength(1);
    expect(set.tracks[0].uid).toBe('uidDrop');
  });

  it('throws malformed-result (playlist-member-missing-uid) when a removed playlist member lacks uid', () => {
    const members = [track(0, 'uidKeep'), track(1)]; // dropped member has no uid
    try {
      computeRemoveSet(resultOf([group('g0', members)]), PLAYLIST);
      expect.unreachable('should have thrown');
    } catch (e) {
      const err = e as RemovalError;
      expect(err.code).toBe('malformed-result');
      expect(err.context?.reason).toBe('playlist-member-missing-uid');
    }
  });

  it('throws playlist-member-missing-uid when uid is an empty string', () => {
    const members = [track(0, 'uidKeep'), track(1, '')];
    try {
      computeRemoveSet(resultOf([group('g0', members)]), PLAYLIST);
      expect.unreachable('should have thrown');
    } catch (e) {
      expect((e as RemovalError).context?.reason).toBe('playlist-member-missing-uid');
    }
  });

  it('does not require uid on the kept (index 0) member for a playlist', () => {
    // index-0 member lacks uid but is kept, so it is never emitted → no throw
    const members = [track(0), track(1, 'uidDrop')];
    const set = computeRemoveSet(resultOf([group('g0', members)]), PLAYLIST);
    expect(set.tracks).toHaveLength(1);
    expect(set.tracks[0].uid).toBe('uidDrop');
  });

  it('orders emitted refs ascending by position across multiple groups', () => {
    // groups already finalized ascending; members ascending. Two groups.
    const g0 = group('g0', [track(0), track(2)]); // drop pos 2
    const g1 = group('g1', [track(1), track(3), track(5)]); // drop pos 3, 5
    const set = computeRemoveSet(resultOf([g0, g1]), LIKED);
    const positions = set.tracks.map((t) => Number(t.uri.replace('spotify:track:t', '')));
    expect(positions).toEqual([2, 3, 5]);
  });

  it('throws malformed-result (size-mismatch) when removableTrackCount disagrees', () => {
    const r = resultOf([group('g0', [track(0), track(1)])]);
    const bad = { ...r, removableTrackCount: 5 };
    try {
      computeRemoveSet(bad, LIKED);
      expect.unreachable('should have thrown');
    } catch (e) {
      const err = e as RemovalError;
      expect(err.code).toBe('malformed-result');
      expect(err.context?.reason).toBe('size-mismatch');
      expect(err.context?.expected).toBe(5);
      expect(err.context?.actual).toBe(1);
    }
  });

  it('echoes the source collectionKey for a playlist', () => {
    const r = resultOf([group('g0', [track(0, 'a'), track(1, 'b')])]);
    const playlistResult = { ...r, collectionKey: 'spotify:playlist:p1' };
    const set = computeRemoveSet(playlistResult, PLAYLIST);
    expect(set.collectionKey).toBe('spotify:playlist:p1');
  });

  it('does not mutate the input DetectionResult', () => {
    const r = resultOf([group('g0', [track(0), track(1)])]);
    const frozen = Object.freeze(r);
    expect(() => computeRemoveSet(frozen, LIKED)).not.toThrow();
    expect(r.groups).toHaveLength(1);
    expect(r.removableTrackCount).toBe(1);
  });

  it('agrees with the post-collapse removable count (transforms consistent)', () => {
    const r = resultOf([
      group('g0', [track(0), track(2)]),
      group('g1', [track(1), track(3), track(5)]),
    ]);
    const set = computeRemoveSet(r, LIKED);
    expect(set.tracks.length).toBe(r.removableTrackCount);
  });
});
