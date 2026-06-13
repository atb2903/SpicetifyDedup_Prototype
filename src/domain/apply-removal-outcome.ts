/**
 * Pure transform: the in-client refresh after a removal (FR-008 / A-2).
 *
 * `applyRemovalOutcome` produces an updated `DetectionResult` reflecting a
 * removal's outcome WITHOUT touching the host: successfully-removed copies are
 * dropped from their groups, groups that fall below 2 members collapse (no
 * longer duplicates), failed copies stay visible (FR-010 / AS-8), and the
 * convenience counts are recomputed. It never re-fetches or re-scans (FR-009).
 *
 * Pure function over domain types — no React, Zustand, adapters, ports, or
 * Spicetify (ADR-0001 / test/architecture.test.ts). No input mutation: a fresh
 * `DetectionResult` is returned and the source is left untouched.
 *
 * Identity keying (`trackRefKey`): a playlist addresses occurrences by `uid`
 * (a repeated URI's copies are distinct), Liked Songs by `uri` (a track appears
 * at most once). Outcome refs are matched to group members by this key.
 *
 * Fail-loud (A-5 / NFR-004): the adapter only reports tracks it was asked to
 * remove — every one of which was in `result` by construction. A removed key
 * that matches no surviving member is therefore a real defect (e.g. a stale
 * double-apply), so we throw `RemovalError('outcome-mismatch', …)` rather than
 * silently dropping it. (This is the documented reason the store applies each
 * outcome exactly once — cross-ref WP05/T018.)
 *
 * Contract: `contracts/remove-set-transform.md`. Type placement: data-model.md §3.
 */

import type { DetectionResult, DuplicateGroup } from './detection-types';
import type { RemovalTarget, RemovalOutcome, TrackRef } from './removal-types';
import { RemovalError } from './removal-errors';

/**
 * Identity key for matching an outcome ref to a group member.
 *
 * Playlist → `uid` (the specific occurrence); Liked Songs → `uri`. A playlist
 * ref without a non-empty `uid` is a defect — it cannot address a single
 * occurrence — so it throws rather than producing an ambiguous key.
 *
 * @param target - The collection the removal targeted.
 * @param ref - The track reference to key.
 * @returns The identity string used to match against group members.
 * @throws RemovalError `'malformed-result'` (`context.reason ===
 *   'playlist-ref-missing-uid'`) when a playlist ref lacks a usable `uid`.
 */
export function trackRefKey(target: RemovalTarget, ref: TrackRef): string {
  if (target.kind === 'playlist') {
    if (typeof ref.uid !== 'string' || ref.uid.length === 0) {
      throw new RemovalError(
        'malformed-result',
        'playlist track reference is missing a uid',
        { context: { reason: 'playlist-ref-missing-uid', uri: ref.uri } },
      );
    }
    return ref.uid;
  }
  return ref.uri;
}

/**
 * Refresh a `DetectionResult` from a `RemovalOutcome` without re-scanning
 * (FR-008 / FR-009 / A-2).
 *
 * Drops every member whose identity key is in `outcome.removed`; keeps members
 * (including those in `outcome.failed`, which were not removed); collapses any
 * group left with fewer than 2 members; and recomputes `duplicateTrackCount`
 * (`Σ surviving members`) and `removableTrackCount`
 * (`duplicateTrackCount − survivingGroups.length`). Scan-time diagnostics
 * (`collectionKey`, `completedAt`, `skippedLocalCount`, `unenrichedCount`,
 * `scannedTrackCount`) and member `position`s are preserved unchanged — they
 * describe the scan, not the current set.
 *
 * @param result - The detection result to refresh.
 * @param outcome - The host's partition of removed vs. failed tracks.
 * @param target - The collection the removal targeted (selects key function).
 * @returns A fresh `DetectionResult` with removed copies dropped and counts
 *   recomputed.
 * @throws RemovalError `'outcome-mismatch'` (`context.key`) when a removed key
 *   matches no member of any group.
 */
export function applyRemovalOutcome(
  result: DetectionResult,
  outcome: RemovalOutcome,
  target: RemovalTarget,
): DetectionResult {
  const removedKeys = new Set<string>(
    outcome.removed.map((r) => trackRefKey(target, r)),
  );

  // Track which removed keys actually matched a member, to fail loud on any
  // that did not (a stale / double-applied outcome — A-5).
  const matchedKeys = new Set<string>();

  const survivingGroups: DuplicateGroup[] = [];
  for (const grp of result.groups) {
    const survivors = grp.members.filter((member) => {
      const key = trackRefKey(target, { uri: member.uri, uid: member.uid });
      if (removedKeys.has(key)) {
        matchedKeys.add(key);
        return false; // removed → drop
      }
      return true; // kept (incl. failed copies)
    });
    // A group below 2 members is no longer a duplicate group → collapse.
    if (survivors.length >= 2) {
      survivingGroups.push({ ...grp, members: survivors });
    }
  }

  // Fail loud on any removed key that matched no member.
  for (const key of removedKeys) {
    if (!matchedKeys.has(key)) {
      throw new RemovalError(
        'outcome-mismatch',
        'removal outcome references a track not present in the detection result',
        { context: { key } },
      );
    }
  }

  const duplicateTrackCount = survivingGroups.reduce(
    (sum, g) => sum + g.members.length,
    0,
  );

  return {
    collectionKey: result.collectionKey,
    completedAt: result.completedAt,
    groups: survivingGroups,
    duplicateTrackCount,
    removableTrackCount: duplicateTrackCount - survivingGroups.length,
    skippedLocalCount: result.skippedLocalCount,
    unenrichedCount: result.unenrichedCount,
    scannedTrackCount: result.scannedTrackCount,
  };
}
