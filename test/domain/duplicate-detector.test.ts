/**
 * Tests for `src/domain/duplicate-detector.ts`.
 *
 * Covers the JMPerez dedup algorithm with exhaustive boundary testing
 * for the 2000 ms duration tolerance (NFR-003), collection size edge cases,
 * region-relink (AS-4), case/whitespace insensitivity, determinism, and
 * group ordering.
 */

import { describe, it, expect } from 'vitest';
import { detect } from '../../src/domain/duplicate-detector';
import type { EnrichedTrack } from '../../src/domain/detection-types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _posCounter = 0;

/** Reset the position counter between test groups. */
function resetPos(): void {
  _posCounter = 0;
}

/**
 * Build an `EnrichedTrack` with sensible defaults, overridable per field.
 * `position` auto-increments unless provided explicitly.
 */
function track(overrides: Partial<EnrichedTrack> & { uri?: string } = {}): EnrichedTrack {
  const pos = overrides.position ?? _posCounter++;
  const uri = overrides.uri ?? `spotify:track:T${String(pos).padStart(4, '0')}`;
  return {
    position: pos,
    uri,
    canonicalUri: overrides.canonicalUri ?? uri,
    name: overrides.name ?? 'Default Song',
    artists: overrides.artists ?? [{ name: 'Default Artist' }],
    durationMs: overrides.durationMs ?? 180000,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// §A — Collection-size edge cases
// ---------------------------------------------------------------------------

describe('detect — collection size edge cases', () => {
  it('empty input returns empty array', () => {
    expect(detect([])).toEqual([]);
  });

  it('1 track returns empty array (no singletons in output)', () => {
    resetPos();
    expect(detect([track()])).toEqual([]);
  });

  it('2 unrelated tracks (different canonicalUri, different name+artist) returns empty', () => {
    resetPos();
    const t1 = track({ name: 'Song A', artists: [{ name: 'Artist X' }] });
    const t2 = track({ name: 'Song B', artists: [{ name: 'Artist Y' }] });
    expect(detect([t1, t2])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// §B — Rule 1: same canonical URI
// ---------------------------------------------------------------------------

describe('detect — Rule 1: same canonical URI', () => {
  it('2 tracks with same canonicalUri produce 1 group (reason: same-canonical-uri)', () => {
    resetPos();
    const uri = 'spotify:track:CANON';
    const t1 = track({ uri, canonicalUri: uri });
    const t2 = track({ uri: 'spotify:track:OTHER', canonicalUri: uri });
    const result = detect([t1, t2]);
    expect(result).toHaveLength(1);
    expect(result[0].reason).toBe('same-canonical-uri');
    expect(result[0].members).toHaveLength(2);
  });

  it('region-relinked track (AS-4): t1 canonical === t2 canonical via linked_from', () => {
    resetPos();
    // t1: fresh market version with its own URI but linked_from points to the canonical
    const t1 = track({
      uri: 'spotify:track:REGIONAL',
      canonicalUri: 'spotify:track:CANONICAL',
      name: 'Song',
      artists: [{ name: 'Artist' }],
      durationMs: 200000,
    });
    // t2: another copy also pointing at the same canonical
    const t2 = track({
      uri: 'spotify:track:RELINKED2',
      canonicalUri: 'spotify:track:CANONICAL',
      name: 'Song',
      artists: [{ name: 'Artist' }],
      durationMs: 200000,
    });
    const result = detect([t1, t2]);
    expect(result).toHaveLength(1);
    expect(result[0].reason).toBe('same-canonical-uri');
    expect(result[0].members).toHaveLength(2);
  });

  it('defaultKeepIndex is always 0 on a same-canonical-uri group', () => {
    resetPos();
    const uri = 'spotify:track:X';
    const t1 = track({ uri, canonicalUri: uri });
    const t2 = track({ canonicalUri: uri });
    const [group] = detect([t1, t2]);
    expect(group.defaultKeepIndex).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// §C — Rule 2: name + artist + duration tolerance boundary tests
// ---------------------------------------------------------------------------

describe('detect — Rule 2: name+artist+duration (2000 ms tolerance)', () => {
  /** Two tracks with the same name+artist but `delta` ms difference in duration. */
  function pairWithDelta(delta: number): EnrichedTrack[] {
    resetPos();
    const base = 180000;
    return [
      track({ name: 'Song', artists: [{ name: 'Artist' }], durationMs: base }),
      track({ name: 'Song', artists: [{ name: 'Artist' }], durationMs: base + delta }),
    ];
  }

  it('duration delta 0 ms (identical) → 1 group', () => {
    const result = detect(pairWithDelta(0));
    expect(result).toHaveLength(1);
    expect(result[0].reason).toBe('name-artist-duration');
  });

  it('duration delta 1 ms → 1 group', () => {
    const result = detect(pairWithDelta(1));
    expect(result).toHaveLength(1);
  });

  it('duration delta 1999 ms → 1 group (max−1, inside tolerance)', () => {
    const result = detect(pairWithDelta(1999));
    expect(result).toHaveLength(1);
  });

  it('duration delta 2000 ms (boundary, inclusive) → 1 group', () => {
    const result = detect(pairWithDelta(2000));
    expect(result).toHaveLength(1);
    expect(result[0].reason).toBe('name-artist-duration');
  });

  it('duration delta 2001 ms (max+1, outside tolerance) → 0 groups', () => {
    const result = detect(pairWithDelta(2001));
    expect(result).toHaveLength(0);
  });

  it('negative delta -2000 ms (boundary in reverse) → 1 group', () => {
    const result = detect(pairWithDelta(-2000));
    expect(result).toHaveLength(1);
  });

  it('negative delta -2001 ms (outside tolerance in reverse) → 0 groups', () => {
    const result = detect(pairWithDelta(-2001));
    expect(result).toHaveLength(0);
  });

  it('defaultKeepIndex is always 0 on a name-artist-duration group', () => {
    const [group] = detect(pairWithDelta(0));
    expect(group.defaultKeepIndex).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// §D — Chain tolerance (1999-1999-1999 chain → 1 group of 3)
// ---------------------------------------------------------------------------

describe('detect — chain tolerance (transitive matching)', () => {
  it('1999-1999-1999 chain produces ONE group of 3 (matches upstream behaviour)', () => {
    resetPos();
    // t1 @ 0 ms, t2 @ 1999 ms (Δ=1999, within tolerance of t1)
    // t3 @ 3998 ms (Δ=1999 of t2, Δ=3998 of t1 — but added to t2's group)
    const t1 = track({ name: 'Song', artists: [{ name: 'Artist' }], durationMs: 0 });
    const t2 = track({ name: 'Song', artists: [{ name: 'Artist' }], durationMs: 1999 });
    const t3 = track({ name: 'Song', artists: [{ name: 'Artist' }], durationMs: 3998 });
    const result = detect([t1, t2, t3]);
    expect(result).toHaveLength(1);
    expect(result[0].members).toHaveLength(3);
    expect(result[0].reason).toBe('name-artist-duration');
  });
});

// ---------------------------------------------------------------------------
// §E — Case and whitespace insensitivity
// ---------------------------------------------------------------------------

describe('detect — case and whitespace insensitivity', () => {
  it("'Song' and 'song' with same artist and close duration → 1 group", () => {
    resetPos();
    const t1 = track({ name: 'Song', artists: [{ name: 'Artist' }], durationMs: 180000 });
    const t2 = track({ name: 'song', artists: [{ name: 'Artist' }], durationMs: 180000 });
    expect(detect([t1, t2])).toHaveLength(1);
  });

  it("' Song ' (padded) and 'Song' with same artist → 1 group", () => {
    resetPos();
    const t1 = track({ name: ' Song ', artists: [{ name: 'Artist' }], durationMs: 180000 });
    const t2 = track({ name: 'Song', artists: [{ name: 'Artist' }], durationMs: 180000 });
    expect(detect([t1, t2])).toHaveLength(1);
  });

  it("same name, artist name differs only by case → 1 group", () => {
    resetPos();
    const t1 = track({ name: 'Song', artists: [{ name: 'ARTIST' }], durationMs: 180000 });
    const t2 = track({ name: 'Song', artists: [{ name: 'artist' }], durationMs: 180000 });
    expect(detect([t1, t2])).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// §F — Empty name boundary (documented behaviour)
// ---------------------------------------------------------------------------

describe('detect — empty name (documented boundary)', () => {
  it('two tracks with empty names, same artist, same duration → 1 group', () => {
    resetPos();
    const t1 = track({ name: '', artists: [{ name: 'Artist' }], durationMs: 120000 });
    const t2 = track({ name: '', artists: [{ name: 'Artist' }], durationMs: 120000 });
    expect(detect([t1, t2])).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// §G — Group ordering and defaultKeepIndex
// ---------------------------------------------------------------------------

describe('detect — ordering', () => {
  it('members within a group are ordered by position ascending', () => {
    // Provide tracks out of natural order — algorithm must sort members by position
    resetPos();
    const canon = 'spotify:track:SHARED';
    const t1 = track({ position: 3, uri: 'spotify:track:A', canonicalUri: canon });
    const t2 = track({ position: 1, uri: 'spotify:track:B', canonicalUri: canon });
    const t3 = track({ position: 2, uri: 'spotify:track:C', canonicalUri: canon });
    // Pass in non-position order: 3, 1, 2
    const result = detect([t1, t2, t3]);
    expect(result).toHaveLength(1);
    const positions = result[0].members.map((m) => m.position);
    expect(positions).toEqual([1, 2, 3]);
  });

  it('groups are ordered by first-member position ascending', () => {
    resetPos();
    // Group A: positions 4 and 5
    const groupA1 = track({ position: 4, name: 'Song A', artists: [{ name: 'Artist A' }], durationMs: 100000 });
    const groupA2 = track({ position: 5, name: 'Song A', artists: [{ name: 'Artist A' }], durationMs: 100000 });
    // Group B: positions 0 and 1
    const groupB1 = track({ position: 0, name: 'Song B', artists: [{ name: 'Artist B' }], durationMs: 200000 });
    const groupB2 = track({ position: 1, name: 'Song B', artists: [{ name: 'Artist B' }], durationMs: 200000 });

    // Pass in mixed order
    const result = detect([groupA1, groupB1, groupA2, groupB2]);
    expect(result).toHaveLength(2);
    // Group B (first member at position 0) should come first
    expect(result[0].members[0].position).toBe(0);
    expect(result[1].members[0].position).toBe(4);
  });

  it('defaultKeepIndex is 0 on every group', () => {
    resetPos();
    const canon1 = 'spotify:track:C1';
    const canon2 = 'spotify:track:C2';
    // Use distinct names/durations to prevent cross-group name+artist matching
    const t1 = track({ uri: canon1, canonicalUri: canon1, name: 'Alpha', artists: [{ name: 'X' }], durationMs: 100000 });
    const t2 = track({ uri: 'spotify:track:C1b', canonicalUri: canon1, name: 'Alpha', artists: [{ name: 'X' }], durationMs: 100000 });
    const t3 = track({ uri: canon2, canonicalUri: canon2, name: 'Beta', artists: [{ name: 'Y' }], durationMs: 200000 });
    const t4 = track({ uri: 'spotify:track:C2b', canonicalUri: canon2, name: 'Beta', artists: [{ name: 'Y' }], durationMs: 200000 });
    const result = detect([t1, t2, t3, t4]);
    expect(result).toHaveLength(2);
    for (const group of result) {
      expect(group.defaultKeepIndex).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// §H — Multiple independent groups
// ---------------------------------------------------------------------------

describe('detect — multiple groups', () => {
  it('two independent duplicate pairs produce 2 groups', () => {
    resetPos();
    const t1 = track({ name: 'Song X', artists: [{ name: 'Artist' }], durationMs: 180000 });
    const t2 = track({ name: 'Song X', artists: [{ name: 'Artist' }], durationMs: 180000 });
    const t3 = track({ name: 'Song Y', artists: [{ name: 'Artist' }], durationMs: 240000 });
    const t4 = track({ name: 'Song Y', artists: [{ name: 'Artist' }], durationMs: 240000 });
    const result = detect([t1, t2, t3, t4]);
    expect(result).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// §I — Reason tagging (mixed-rule groups)
// ---------------------------------------------------------------------------

describe('detect — reason tagging', () => {
  it('group where all non-first members joined via Rule 1 → reason: same-canonical-uri', () => {
    resetPos();
    const canon = 'spotify:track:CANON';
    const t1 = track({ uri: canon, canonicalUri: canon });
    const t2 = track({ canonicalUri: canon });
    const t3 = track({ canonicalUri: canon });
    const result = detect([t1, t2, t3]);
    expect(result).toHaveLength(1);
    expect(result[0].reason).toBe('same-canonical-uri');
  });

  it('group where any non-first member joined via Rule 2 → reason: name-artist-duration', () => {
    resetPos();
    const canon = 'spotify:track:CANON';
    // t1 is the seed (canonical)
    const t1 = track({ uri: canon, canonicalUri: canon, name: 'Song', artists: [{ name: 'A' }], durationMs: 100000 });
    // t2 joins via Rule 1 (same canonicalUri)
    const t2 = track({ canonicalUri: canon, name: 'Song', artists: [{ name: 'A' }], durationMs: 100000 });
    // t3 joins via Rule 2 (different canonical URI, same name+artist+close duration)
    const t3 = track({
      uri: 'spotify:track:DIFF',
      canonicalUri: 'spotify:track:DIFF',
      name: 'Song',
      artists: [{ name: 'A' }],
      durationMs: 100500,
    });
    const result = detect([t1, t2, t3]);
    expect(result).toHaveLength(1);
    // t3 joined via Rule 2 → mixed group → reason: 'name-artist-duration'
    expect(result[0].reason).toBe('name-artist-duration');
  });
});

// ---------------------------------------------------------------------------
// §J — Determinism
// ---------------------------------------------------------------------------

describe('detect — determinism (NFR-001)', () => {
  it('identical input produces byte-equivalent output on two runs', () => {
    resetPos();
    const tracks: EnrichedTrack[] = [
      track({ name: 'Song A', artists: [{ name: 'Artist' }], durationMs: 180000 }),
      track({ name: 'Song A', artists: [{ name: 'Artist' }], durationMs: 180000 }),
      track({ name: 'Song B', artists: [{ name: 'Other' }], durationMs: 300000 }),
    ];

    const run1 = JSON.stringify(detect(tracks));
    const run2 = JSON.stringify(detect(tracks));
    expect(run1).toBe(run2);
  });
});

// ---------------------------------------------------------------------------
// §K — Group id uniqueness
// ---------------------------------------------------------------------------

describe('detect — group id', () => {
  it('each group has a distinct id within a scan', () => {
    resetPos();
    const t1 = track({ name: 'Song X', artists: [{ name: 'A' }], durationMs: 100000 });
    const t2 = track({ name: 'Song X', artists: [{ name: 'A' }], durationMs: 100000 });
    const t3 = track({ name: 'Song Y', artists: [{ name: 'B' }], durationMs: 200000 });
    const t4 = track({ name: 'Song Y', artists: [{ name: 'B' }], durationMs: 200000 });
    const result = detect([t1, t2, t3, t4]);
    const ids = result.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
