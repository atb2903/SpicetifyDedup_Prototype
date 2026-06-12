# Contract — remove-set + apply-outcome transforms

Pure domain. `src/domain/remove-set.ts`, `src/domain/apply-removal-outcome.ts`.
Serves FR-004, FR-008, FR-009, NFR-004, C-006, A-2, A-5.

## `isRemovableResult(result): result is DetectionResult`

Classifier (NFR-004). True iff `result` structurally matches `DetectionResult` AND every
group satisfies the removal invariants: `members.length >= 2`, `defaultKeepIndex === 0`,
members ordered ascending by `position`. Pure, total, no throw. Callers pre-check before
`computeRemoveSet`.

## `computeRemoveSet(result, target): RemoveSet`

- **Keep-earliest (FR-004 / C-006):** for each group, emit a `TrackRef` for every member
  except index `defaultKeepIndex` (`=== 0`). Order the emitted refs ascending by
  `position` across all groups.
- **TrackRef construction:** `{ uri: member.uri, uid: member.uid }`. For
  `target.kind === 'playlist'`, `member.uid` MUST be a non-empty string — else throw
  `RemovalError('malformed-result', …, { context: { reason: 'playlist-member-missing-uid' } })`.
  For `liked-songs`, `uid` is omitted.
- **Size invariant:** `result.removableTrackCount === Σ(members.length − 1)` over groups
  `=== removeSet.tracks.length`. Assert and throw on mismatch (`malformed-result`).
- **Fail-loud (NFR-004):** throw `RemovalError('malformed-result', …)` when
  `!isRemovableResult(result)`.
- **Boundary / edge tests:**
  - groups = 0 → empty remove-set (caller should not have shown the button, but the
    transform is total: returns `{ tracks: [] }`).
  - a group of exactly 2 → exactly 1 removed (the min duplicate group).
  - a group of N → N−1 removed; kept ref never appears in the set.
  - playlist member missing `uid` → throws.
  - removableTrackCount disagreeing with derived count → throws.

## `applyRemovalOutcome(result, outcome, target): DetectionResult`

In-client refresh (FR-008 / A-2) — no host read, no re-scan (FR-009).

- **Identity:** `trackRefKey(target, ref)` = `ref.uid` for playlists, `ref.uri` for Liked
  Songs. Build a set from `outcome.removed`.
- **Per group:** drop members whose key is in the removed set; **keep** members in
  `outcome.failed` (FR-010 / AS-8). A group whose surviving membership falls below 2
  collapses (removed from `groups`) — it is no longer a duplicate group.
- **Recompute:** `duplicateTrackCount = Σ surviving members`; `removableTrackCount =
  duplicateTrackCount − groups.length`. Preserve `collectionKey`, `completedAt`,
  `skippedLocalCount`, `unenrichedCount`, `scannedTrackCount` (scan-time diagnostics).
- **Validation (A-5 / fail-loud):** if `outcome.removed` references a key not present in
  any group, throw `RemovalError('outcome-mismatch', …)`. (A *stale* live library where
  the host reported a track removed that we still list is the legitimate case this
  catches; the adapter should only report tracks it was asked to remove, which were in
  the result by construction — so a mismatch is a real defect, not normal flow.)
- **Boundary / edge tests:**
  - full success (all removed) → every group collapses → `removableTrackCount === 0`
    (button hides — AS-7).
  - partial → groups with ≥2 survivors remain; `removableTrackCount` reflects survivors.
  - empty outcome (`removed=[] failed=[]`) → result returned structurally unchanged.
  - all-failed → result unchanged in counts; failed copies stay visible.
  - idempotence: applying the same all-success outcome twice — second call has nothing to
    remove (its `removed` keys are absent) → would throw `outcome-mismatch`; the store
    only applies an outcome once, documented as the guard.
