/**
 * Pure transform: `DetectionResult + RemovalTarget → RemoveSet`, plus the
 * total classifier that gates it.
 *
 * This module carries the keep-earliest removal decision (FR-004 / C-006): for
 * every duplicate group it emits a `TrackRef` for each member *except* the
 * earliest (index `defaultKeepIndex`, always 0). It is a pure function over
 * domain types — no React, Zustand, adapters, ports, or Spicetify
 * (ADR-0001 / test/architecture.test.ts). It never reads the host.
 *
 * Fail-loud (NFR-004): the input is trusted-by-construction (the detector
 * guarantees the invariants) but re-validated anyway. Rather than emit a wrong
 * remove-set, malformed input throws `RemovalError('malformed-result', …)` with
 * a structured `context.reason`. The total classifier `isRemovableResult` lets
 * callers pre-check without a try/catch.
 *
 * Ordering decision: the detector (`duplicate-detector.ts`) finalizes groups
 * ascending by first-member `position` and sorts each group's `members`
 * ascending by `position`. `position` is `RawTrack.position` — a zero-based,
 * collection-unique iteration index — so members are *strictly* ascending. This
 * transform therefore trusts the detector's order: it iterates groups then
 * members in their existing order and the emitted refs come out ascending by
 * `position` without a re-sort. `isRemovableResult` re-asserts strict ascent
 * (`>`), so any input violating that order is rejected before we rely on it.
 *
 * Contract: `contracts/remove-set-transform.md`. Type placement: data-model.md §3.
 */

import type { DetectionResult } from './detection-types';
import type { RemovalTarget, TrackRef, RemoveSet } from './removal-types';
import { RemovalError } from './removal-errors';

/** True iff `v` is a finite-or-not number primitive (excludes `null`). */
function isNumber(v: unknown): v is number {
  return typeof v === 'number';
}

/** True iff `v` is a non-null, non-array object. */
function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Classify one candidate group: array of ≥2 members, `defaultKeepIndex === 0`,
 * and members strictly ascending by `position`. Pure, total, no throw.
 */
function isRemovableGroup(g: unknown): boolean {
  if (!isObject(g)) return false;
  if (g.defaultKeepIndex !== 0) return false;
  const members = g.members;
  if (!Array.isArray(members)) return false;
  if (members.length < 2) return false;
  let prevPosition = -Infinity;
  for (const m of members) {
    if (!isObject(m)) return false;
    if (!isNumber(m.position)) return false;
    // Strictly ascending: positions are collection-unique, so equal or
    // descending positions signal a malformed (non-detector) input.
    if (!(m.position > prevPosition)) return false;
    prevPosition = m.position;
  }
  return true;
}

/**
 * Total classifier (NFR-004): returns `true` iff `result` is a well-formed
 * `DetectionResult` from which a remove-set can be safely computed. Never
 * throws — callers pre-check before `computeRemoveSet`.
 *
 * Truth conditions: a non-null object with `collectionKey: string`, a `groups`
 * array, and numeric `duplicateTrackCount`, `removableTrackCount`,
 * `skippedLocalCount`, `unenrichedCount`, `scannedTrackCount`, `completedAt`;
 * and every group passes {@link isRemovableGroup}. An empty `groups` array is
 * valid (a zero-removable result is well-formed) and yields an empty set.
 *
 * @param result - Any value.
 * @returns `true` if `result` is a removable `DetectionResult`.
 */
export function isRemovableResult(result: unknown): result is DetectionResult {
  if (!isObject(result)) return false;
  if (typeof result.collectionKey !== 'string') return false;
  if (!Array.isArray(result.groups)) return false;
  if (!isNumber(result.duplicateTrackCount)) return false;
  if (!isNumber(result.removableTrackCount)) return false;
  if (!isNumber(result.skippedLocalCount)) return false;
  if (!isNumber(result.unenrichedCount)) return false;
  if (!isNumber(result.scannedTrackCount)) return false;
  if (!isNumber(result.completedAt)) return false;
  for (const g of result.groups) {
    if (!isRemovableGroup(g)) return false;
  }
  return true;
}

/**
 * Compute the ordered set of `TrackRef`s to delete from one collection
 * (FR-004 / C-006): for each group, every member except index 0 (keep the
 * earliest copy). Refs come out ascending by original `position` (trusting the
 * detector's order — see module JSDoc).
 *
 * Playlist `uid` enforcement: for a `playlist` target every *emitted* member
 * must carry a non-empty-string `uid` (the kept index-0 member is exempt —
 * it is never emitted). Liked-songs refs omit `uid` entirely (a track appears
 * at most once, so `uri` is the key).
 *
 * Size invariant: `result.removableTrackCount` must equal the derived count
 * `Σ(members.length − 1)` which equals `tracks.length`; a mismatch throws.
 *
 * @param result - The detection result to derive removals from.
 * @param target - The collection being removed from (selects `uid` handling).
 * @returns A `RemoveSet` echoing `collectionKey` with the ordered refs.
 * @throws RemovalError `'malformed-result'` with `context.reason`:
 *   `'not-removable-result'` when `!isRemovableResult(result)`;
 *   `'playlist-member-missing-uid'` when a playlist member lacks a `uid`;
 *   `'size-mismatch'` (with `expected`/`actual`) when the count disagrees.
 */
export function computeRemoveSet(
  result: DetectionResult,
  target: RemovalTarget,
): RemoveSet {
  if (!isRemovableResult(result)) {
    throw new RemovalError(
      'malformed-result',
      'computeRemoveSet received a result that is not a removable DetectionResult',
      { context: { reason: 'not-removable-result' } },
    );
  }

  const tracks: TrackRef[] = [];
  for (const grp of result.groups) {
    // Keep index 0 (earliest); emit every later member.
    for (let i = 1; i < grp.members.length; i++) {
      const member = grp.members[i];
      if (target.kind === 'playlist') {
        if (typeof member.uid !== 'string' || member.uid.length === 0) {
          throw new RemovalError(
            'malformed-result',
            'playlist removal requires a uid on every removed member',
            { context: { reason: 'playlist-member-missing-uid', uri: member.uri } },
          );
        }
        tracks.push({ uri: member.uri, uid: member.uid });
      } else {
        // liked-songs: address by uri alone; never copy uid.
        tracks.push({ uri: member.uri });
      }
    }
  }

  // Size invariant: removableTrackCount must equal the derived/emitted count.
  if (result.removableTrackCount !== tracks.length) {
    throw new RemovalError(
      'malformed-result',
      'computeRemoveSet size invariant violated: removableTrackCount disagrees with derived count',
      {
        context: {
          reason: 'size-mismatch',
          expected: result.removableTrackCount,
          actual: tracks.length,
        },
      },
    );
  }

  return { collectionKey: result.collectionKey, tracks };
}
