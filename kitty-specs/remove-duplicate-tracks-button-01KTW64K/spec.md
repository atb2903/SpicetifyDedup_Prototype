# Specification: Remove Duplicate Tracks Button

**Mission**: remove-duplicate-tracks-button-01KTW64K
**Mission type**: software-dev
**Target branch**: main
**Created**: 2026-06-11
**Source request**: "add a button to remove the duplicates"

## Summary

Today the Dedup app can *find* duplicate tracks per collection but cannot *act* on
them: after a user scans a collection (Liked Songs or an individual playlist), the
results are read-only. This feature adds a **per-collection "Remove duplicates"
action** that appears on a row only after that row has been scanned and found to
contain removable duplicates. Triggering it removes the redundant copies from that
one collection — keeping the earliest occurrence of each duplicate group and
removing the later ones — behind a per-action confirmation that names exactly what
will be removed. Removal is strictly scoped to the single collection whose button
was pressed; there is no global "remove everything" action and nothing runs
automatically.

This closes the loop that motivates the whole project: the library exporter/importer
round-trip cannot delete dropped tracks, so de-duplication must mutate the live
library from inside the client. This is the mutation step.

## Actors

- **Library owner (primary user)** — a Spotify user running the Dedup app who has
  scanned one or more collections and wants to delete the duplicate copies that the
  scan surfaced.

## User Scenarios & Testing

### Primary flow — remove duplicates from a scanned collection

1. The user scans a collection (Liked Songs or a playlist) using its existing
   dedup/scan button.
2. The scan completes and the row reaches its loaded state. Because the collection
   contains at least one removable duplicate (`removableTrackCount > 0`), a **"Remove
   duplicates" button appears on that row**.
3. The user clicks **Remove duplicates**.
4. A confirmation appears, naming the collection and stating exactly how many tracks
   will be removed (and that the earliest copy of each duplicate is kept). The user
   confirms.
5. The redundant copies are removed from *that collection only*.
6. The row updates to reflect the removal: removed duplicate groups disappear, the
   removable count drops, and once nothing removable remains the button disappears.
   No new scan is triggered automatically.

### Acceptance scenarios

- **AS-1 — Button gated on removable results.** Given a row that has **not** been
  scanned, or whose scan found **zero** removable duplicates
  (`removableTrackCount === 0`), the Remove-duplicates button is **not shown** for
  that row.
- **AS-2 — Button appears after a productive scan.** Given a row whose completed scan
  reports `removableTrackCount > 0`, the Remove-duplicates button **is shown** on that
  row.
- **AS-3 — Keep-earliest semantics.** Given a duplicate group of N copies, when
  removal runs, the earliest copy by iteration order (`defaultKeepIndex === 0`) is
  **retained** and the other N−1 copies are removed.
- **AS-4 — Single-collection scope.** Given the user removes duplicates from
  Playlist A, no track is removed from Playlist B, from Liked Songs, or from any
  collection other than Playlist A — even if the same track is duplicated elsewhere.
- **AS-5 — First confirmation always required.** Given the user clicks Remove
  duplicates, removal does **not** begin until the user confirms an explicit prompt
  that names the target collection and the exact count to be removed. Dismissing the
  prompt removes nothing.
- **AS-6 — Second confirmation past the bulk threshold.** Given a collection whose
  removable count is **greater than 25**, the user must pass a **second** explicit
  confirmation before removal proceeds. At a removable count of **25 or fewer**, only
  the single confirmation is required.
- **AS-7 — Post-removal state reflects reality.** Given a successful removal, the
  acted row shows the duplicate groups gone and the removable count reduced to what
  remains (zero on full success); the button disappears when nothing removable is
  left. No automatic re-scan occurs.
- **AS-8 — Partial failure is surfaced, not swallowed.** Given removal where some
  tracks fail to delete (e.g. a transient error), the row reports that some removals
  did not complete and leaves the still-present duplicates visible, rather than
  silently showing success.
- **AS-9 — No auto-run.** Given the app launches or a route changes, no removal is
  ever initiated without a deliberate button press and confirmation.

### Edge cases

- **Local files** (`spotify:local:…`) are excluded upstream during detection and are
  never duplicate-group members, so they are never removal candidates.
- A collection scanned, then removed-from, then scanned again should reflect the
  reduced set on the second scan (no stale duplicates reappear).
- A removal that affects every duplicate group in a collection leaves the row in a
  "no removable duplicates" state with the button hidden.
- Concurrency: the Remove-duplicates button for a collection that is mid-removal must
  not allow a second overlapping removal of the same collection.
- If the collection's scan results are stale relative to the live library (a copy was
  already deleted elsewhere), removal of an already-absent track is treated as a
  no-op for that track, not a hard failure of the whole batch.

## Requirements

### Functional Requirements

| ID | Requirement | Status |
|----|-------------|--------|
| FR-001 | The system SHALL render a "Remove duplicates" action on a collection row only when that row is in a completed/loaded scan state AND its result reports `removableTrackCount > 0`. | Draft |
| FR-002 | The system SHALL NOT render the Remove-duplicates action for any row that is unscanned, mid-scan, failed, or whose result reports `removableTrackCount === 0`. | Draft |
| FR-003 | Each collection's Remove-duplicates action SHALL remove duplicate copies from **only that collection** (the playlist whose row it sits on, or Liked Songs), never from any other collection. | Draft |
| FR-004 | For each duplicate group, the system SHALL retain the earliest member (`defaultKeepIndex === 0`, lowest iteration position) and remove the remaining members; the count removed per collection SHALL equal `removableTrackCount`. | Draft |
| FR-005 | The system SHALL require an explicit per-action confirmation before any removal, and that confirmation SHALL state the target collection's name and the exact number of tracks to be removed. | Draft |
| FR-006 | When a collection's removable count exceeds 25, the system SHALL require a second explicit confirmation in addition to FR-005 before removal proceeds. | Draft |
| FR-007 | If the user dismisses or cancels any required confirmation, the system SHALL remove nothing and leave the collection's results unchanged. | Draft |
| FR-008 | After a successful removal, the system SHALL update the acted row's displayed results so removed duplicate groups no longer appear and the removable count reflects what remains, hiding the action once nothing removable is left. | Draft |
| FR-009 | The system SHALL NOT automatically trigger a new scan as a result of a removal; refreshing scan data requires a deliberate user scan. | Draft |
| FR-010 | When a removal completes with one or more individual track removals failing, the system SHALL report to the user that the removal partially failed and SHALL keep the tracks that were not removed visible in the results. | Draft |
| FR-011 | The system SHALL NOT initiate any removal automatically on app launch, route change, or scan completion; every removal SHALL originate from a deliberate button press followed by the required confirmation(s). | Draft |
| FR-012 | While a collection's removal is in progress, the system SHALL prevent a second overlapping removal of that same collection. | Draft |

### Non-Functional Requirements

| ID | Requirement | Status |
|----|-------------|--------|
| NFR-001 | The Remove-duplicates action and its confirmation SHALL be operable and labeled such that the target collection and removal count are unambiguous to the user before confirming (no removal triggered by a single accidental activation). | Draft |
| NFR-002 | Removal of a collection's duplicates SHALL complete or report failure without requiring the user to keep the confirmation dialog focused; progress/outcome SHALL be communicated for collections of any size the scan can produce. | Draft |
| NFR-003 | The feature SHALL preserve the project's quality gates: TypeScript strict, strict file-level SRP, and 100% line/branch coverage at the test runner, including boundary tests at the bulk-confirmation threshold (24, 25, 26 removable tracks). | Draft |
| NFR-004 | Removal logic that transforms scan results into a remove-set SHALL fail loud on malformed input (throw a typed error) and ship a paired classifier predicate so callers can pre-check, consistent with the charter's input-validation policy. | Draft |

### Constraints

| ID | Constraint | Status |
|----|------------|--------|
| C-001 | No silent library mutation: every deletion is gated by the FR-005 confirmation; bulk deletions over 25 require the FR-006 second confirmation. (Charter risk boundary.) | Active |
| C-002 | No auto-run on Spotify launch or any non-deliberate trigger. (Charter risk boundary.) | Active |
| C-003 | Removal scope is a single collection per action; there is no global/bulk-across-collections removal in this mission. | Active |
| C-004 | Local files (`spotify:local:…`) are out of scope for removal because detection already excludes them; this mission does not change that exclusion. | Active |
| C-005 | The feature operates entirely inside the Spicetify client against the live library; it does not introduce any path through the public Web API gateway known to fail for large libraries. | Active |
| C-006 | The keep-policy is fixed (keep earliest); per-group user override of which copy survives is out of scope for this mission. | Active |

## Success Criteria

- **SC-1** — A user can remove every redundant duplicate copy from a scanned
  collection in a single confirmed action, and the kept track for each group is the
  earliest copy.
- **SC-2** — After removal, the collection contains exactly one copy of each
  previously-duplicated track and the row reflects zero removable duplicates (on full
  success), with no duplicates reappearing on a fresh scan.
- **SC-3** — No track is ever removed from a collection the user did not act on.
- **SC-4** — No removal ever occurs without the user passing the required
  confirmation(s); removals above the bulk threshold always require two confirmations.
- **SC-5** — When some removals fail, the user is told the removal was partial and can
  see which duplicates remain.
- **SC-6** — No removal is ever initiated automatically.

## Key Entities

- **Collection** — a scannable, removable unit: Liked Songs (key `'liked-songs'`) or a
  single playlist (key = playlist URI). Removal is always scoped to one Collection.
- **Duplicate group** — a finalized set (≥2 members) of tracks judged duplicates,
  ordered by iteration position, with the earliest member designated to keep.
- **Remove-set** — the tracks selected for deletion from a collection: every duplicate
  group member except the kept (earliest) one; its size equals the collection's
  `removableTrackCount`.
- **Removal outcome** — the per-collection result of a removal attempt: which tracks
  were removed, which failed, and the resulting updated view of the collection's
  remaining duplicates.

## Assumptions

- **A-1** — Liked Songs receives the same per-row Remove-duplicates action as
  playlists (it shares the loaded-result flow). If the user later wants playlists-only,
  the gating in FR-001 still applies per row.
- **A-2** — Post-removal results are updated from the already-known scan data minus the
  removed tracks (an in-client update), not by re-fetching; this honors the project's
  explicit-fetch-trigger rule (no scan without a deliberate user action).
- **A-3** — The existing detection result fields (`groups`, `defaultKeepIndex`,
  `removableTrackCount`, `collectionKey`) are sufficient inputs to compute the
  remove-set; no new catalog enrichment is required.
- **A-4** — "Duplicates" for removal means within-collection duplicates, exactly as the
  current scan defines them per collection.
- **A-5** — Removing a track that is already absent from the live library (stale scan)
  is a no-op for that track, not a batch-failing error.

## Out of Scope

- A global "remove duplicates across all collections" button.
- Letting the user choose which copy of a duplicate group to keep (override of
  keep-earliest).
- Re-introducing or removing local files.
- Any change to how duplicates are detected, scanned, or scored.
- Automatic background removal or scheduled de-duplication.

## Dependencies

- The existing per-collection detection pipeline and loaded-state results
  (`DetectionResult` with `groups`, `defaultKeepIndex`, `removableTrackCount`).
- The existing per-row UI (Liked Songs row and playlist rows) and their loaded-state
  rendering.
- The in-client library mutation capability for removing tracks from Liked Songs and
  from playlists (to be detailed during plan).
