/**
 * Pure duplicate-detection algorithm.
 *
 * Ports the JMPerez/spotify-dedup `dedup/deduplicator.ts:15-57` algorithm to
 * TypeScript as closely as possible (A-002 forbids divergence). The only
 * additions are TypeScript types, `ReadonlyArray` discipline, and JSDoc.
 *
 * The algorithm is intentionally free of any React, Zustand, adapter, store,
 * UI, or Spicetify imports — it is a pure function over domain types.
 *
 * Duplicate rules:
 * 1. **Same canonical URI** (FR-004): two tracks share a `canonicalUri`.
 * 2. **Name + artist + duration** (FR-005): same `composeKey(name, artists[0].name)`
 *    AND `|durationMs − peer.durationMs| ≤ 2000` ms (inclusive boundary at 2000 ms).
 *
 * Chain tolerance: Rule 2 uses the first group member's duration as the
 * reference for every subsequent candidate within that key bucket. This
 * matches the upstream behaviour: a chain of tracks each 1999 ms apart forms
 * one group even if the extremes are >2000 ms apart.
 *
 * Reason tagging:
 * - `'same-canonical-uri'` — every non-first member joined via Rule 1.
 * - `'name-artist-duration'` — at least one non-first member joined via Rule 2.
 *   (Precedence: a mixed group is tagged `'name-artist-duration'`.)
 *
 * Output ordering (NFR-001 determinism):
 * - Groups are ordered by the `position` of their first member, ascending.
 * - Members within a group are ordered by `position` ascending.
 */

import type { EnrichedTrack, DuplicateGroup } from './detection-types';
import { composeKey } from './duplicate-key';

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

/** Mutable builder for a group accumulating during a scan. */
interface GroupBuilder {
  members: EnrichedTrack[];
  /**
   * Whether any non-first member joined via Rule 2 (name+artist+duration).
   * If false at finalisation time, reason is `'same-canonical-uri'`.
   */
  hasRule2Join: boolean;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run the duplicate-detection algorithm over a collection of enriched tracks
 * and return all duplicate groups.
 *
 * The algorithm is a two-pass scan:
 * 1. **Rule 1**: if a track's `canonicalUri` matches an existing group's
 *    canonical URI, add it to that group.
 * 2. **Rule 2**: compute `composeKey(name, artists[0].name)`. Find the first
 *    bucket entry whose duration is within 2000 ms (inclusive). If found,
 *    add the track to that group.
 * 3. Otherwise: start a new singleton group and register it under both
 *    `seenById` and `seenByKey`.
 *
 * Groups with fewer than 2 members are excluded from the result (FR-006).
 * `defaultKeepIndex` is always `0` (FR-007 — earliest by iteration order).
 *
 * @param tracks - Enriched tracks in collection order. May be empty.
 * @returns Duplicate groups ordered by first-member position ascending.
 *   Each group's `members` are ordered by position ascending. Never contains
 *   singletons.
 */
export function detect(tracks: ReadonlyArray<EnrichedTrack>): ReadonlyArray<DuplicateGroup> {
  /** Canonical URI → group builder. */
  const seenById = new Map<string, GroupBuilder>();

  /** Normalised name+artist key → array of { durationMs, group } entries. */
  const seenByKey = new Map<string, Array<{ durationMs: number; group: GroupBuilder }>>();

  for (const track of tracks) {
    // ------------------------------------------------------------------
    // Rule 1: same canonical URI
    // ------------------------------------------------------------------
    const existingById = seenById.get(track.canonicalUri);
    if (existingById !== undefined) {
      existingById.members.push(track);
      // Rule 1 join — hasRule2Join is unchanged (stays false if it was false)
      continue;
    }

    // ------------------------------------------------------------------
    // Rule 2: same name+artist key AND duration within 2000 ms
    // ------------------------------------------------------------------
    const key = composeKey(track.name, track.artists[0].name);
    const bucket = seenByKey.get(key);
    const TOLERANCE_MS = 2000;

    if (bucket !== undefined) {
      // Find the first bucket entry within tolerance
      const match = bucket.find(
        (entry) => Math.abs(entry.durationMs - track.durationMs) <= TOLERANCE_MS,
      );
      if (match !== undefined) {
        match.group.members.push(track);
        match.group.hasRule2Join = true;
        // Register the canonical URI so a later Rule-1 lookup finds this group too
        seenById.set(track.canonicalUri, match.group);
        // Add this track's duration as a new bucket entry so subsequent tracks
        // within 2000 ms of THIS track's duration (but not the first entry's)
        // also join the group. This enables chain matching (e.g. 0→1999→3998).
        bucket.push({ durationMs: track.durationMs, group: match.group });
        continue;
      }
    }

    // ------------------------------------------------------------------
    // No match — start a new singleton group
    // ------------------------------------------------------------------
    const newGroup: GroupBuilder = { members: [track], hasRule2Join: false };
    seenById.set(track.canonicalUri, newGroup);

    if (bucket === undefined) {
      seenByKey.set(key, [{ durationMs: track.durationMs, group: newGroup }]);
    } else {
      bucket.push({ durationMs: track.durationMs, group: newGroup });
    }
  }

  // ------------------------------------------------------------------
  // Finalise: filter singletons, sort members, tag reasons, order groups
  // ------------------------------------------------------------------
  const groups: DuplicateGroup[] = [];

  // Collect unique builders (seenById may hold the same builder multiple times)
  const seen = new Set<GroupBuilder>();
  for (const builder of seenById.values()) {
    seen.add(builder);
  }

  let groupIndex = 0;
  for (const builder of seen) {
    if (builder.members.length < 2) continue;

    // Sort members by position ascending
    const sortedMembers = [...builder.members].sort((a, b) => a.position - b.position);

    groups.push({
      id: `group-${groupIndex++}`,
      reason: builder.hasRule2Join ? 'name-artist-duration' : 'same-canonical-uri',
      members: sortedMembers,
      defaultKeepIndex: 0,
    });
  }

  // Sort groups by first-member position ascending (NFR-001 determinism)
  groups.sort((a, b) => a.members[0].position - b.members[0].position);

  // Re-number ids after sort to match their final output order
  return groups.map((g, i) => ({ ...g, id: `group-${i}` }));
}
