# Mission Spec: Duplicate Track Detection

- **Mission ID**: `01KTFH5HHX2PX4NNT9WZE873B8`
- **Mission slug**: `duplicate-track-detection-01KTFH5H`
- **Mission type**: software-dev
- **Target branch**: `main`
- **Created**: 2026-06-06
- **Source request**: "time for deduplication logic"

## Overview

When a user clicks the dedup button on a collection row in the Dedup page (Liked Songs or any eligible playlist), the system enumerates that collection's tracks, enriches each with the catalog metadata needed for duplicate matching, and produces a typed list of duplicate groups stored against that row. The user sees an at-a-row summary of how many duplicate groups and how many duplicate tracks were found. No mutation, no review UI, no cross-collection matching — just the detection slice, shaped so the next mission can present a review/override/delete experience on top of it.

## User Scenarios & Testing

### Primary user flow
1. User opens the Dedup page inside the Spotify desktop client.
2. User clicks "Load library"; the list of playlists + Liked Songs renders (existing scaffolding).
3. User clicks the dedup button on a specific row.
4. The row enters a "scanning" state; the user can see something is happening.
5. When the scan completes, the row shows a result summary: either a duplicate-group count and total duplicate-track count, or an explicit "No duplicates found" message.
6. The user can re-click the button on the same row to re-scan (replacing the prior result), or click the button on a different row to scan another collection in parallel.

### Acceptance scenarios

| # | Given | When | Then |
|---|-------|------|------|
| AS-1 | A collection with zero duplicate tracks | Detection completes | Row shows "No duplicates found"; result set is empty |
| AS-2 | A collection with N duplicate groups containing M total duplicate-tracks | Detection completes | Row shows group count N and tracks-to-remove count (M minus N keeps); result exposes N typed groups each with a `defaultKeep` marker on the first occurrence |
| AS-3 | A collection containing local-file tracks | Detection runs | Local files are excluded from matching; result includes a `skippedLocalCount` |
| AS-4 | A track is region-relinked and carries a canonical-from URI | Detection runs | The canonical URI is used for ID matching; the relinked and the canonical track are considered the same |
| AS-5 | Two non-relinked tracks share name+first-artist (case-insensitive) and durations differ by exactly 2000 ms | Detection runs | They are classified as duplicates (boundary is inclusive) |
| AS-6 | Two non-relinked tracks share name+first-artist and durations differ by 2001 ms | Detection runs | They are NOT classified as duplicates |
| AS-7 | A rate-limit response is received mid-scan with a server-provided retry hint | The system observes the hint | The system waits exactly the hint duration, then resumes; the row remains in "scanning" state |
| AS-8 | An authentication-token-expiry error occurs mid-scan | The system observes the error | The row transitions to a failed state with a discriminable error; any partial scan output is discarded |
| AS-9 | The user navigates away from the Dedup page mid-scan | They return | The row is back at idle; no stale scanning state, no leaked progress |
| AS-10 | A row already has a completed detection result | The user clicks its dedup button again | The prior result is replaced atomically by the new scan; mid-scan the row reads "scanning", not "loaded" |
| AS-11 | Two rows are scanned simultaneously | Scans run in parallel | Each row's progress and result update independently; neither blocks the other |

### Edge cases
- Empty collection (zero tracks): result is empty, no error, `skippedLocalCount = 0`.
- Catalog enrichment returns null for some IDs (track was removed from catalog): those tracks cannot participate in duration-based matching; they surface as `unenrichedCount` in the result and are otherwise excluded from groups.
- Every track in the collection is a local file: result is empty groups; `skippedLocalCount` equals collection size.
- Single duplicate group of size > 25: detection still returns the group; no spec-level UX divergence (review/delete is OOS).
- Network failure mid-scan: row transitions to failed with a retryable error label; no result emitted.
- A collection with thousands of tracks: scan completes (no premature timeout); progress remains observable; the algorithm and the enrichment loop scale linearly with collection size.

## Requirements

### Functional (FR-###)

| ID | Requirement | Status |
|----|-------------|--------|
| FR-001 | The system MUST enumerate every non-local track in the selected collection. | Approved |
| FR-002 | The system MUST enrich each enumerated track with: canonical name, first-artist name, duration in milliseconds, and (when present) its region-relinked canonical URI — before applying duplicate detection. | Approved |
| FR-003 | The system MUST skip local-file tracks (any URI under `spotify:local:`) from the scan and report a `skippedLocalCount` in the result metadata. | Approved |
| FR-004 | The system MUST classify two tracks within a collection as duplicates when their canonical URIs are identical (using `linked_from.uri` as canonical when present, otherwise the track URI). | Approved |
| FR-005 | The system MUST classify two tracks within a collection as duplicates when their normalized name (case-insensitive, whitespace-trimmed) and first-artist name (case-insensitive, whitespace-trimmed) match AND their durations differ by less than or equal to 2000 ms. | Approved |
| FR-006 | The system MUST group all duplicates of the same underlying track into a single result group; no track appears in more than one group. | Approved |
| FR-007 | Each result group MUST identify exactly one member as the `defaultKeep` candidate; this MUST be the member that appears earliest in the collection's iteration order. | Approved |
| FR-008 | The result MUST be exposed per-collection via observable state — concurrent scans on different collections MUST NOT cross-contaminate. | Approved |
| FR-009 | When detection completes, the originating row MUST display either a count summary (group count + total duplicate-track count) or an explicit "No duplicates found" message. | Approved |
| FR-010 | Detection MUST run only in response to explicit user activation of a row's dedup button. No implicit triggering on page load, route entry, store mutation, or playlist-list load completion. | Approved |
| FR-011 | A re-triggered scan on a row that already has a result MUST replace the prior result atomically with the new one — the row is never observed as showing two simultaneous states. | Approved |
| FR-012 | Navigation away from the Dedup page MUST reset all in-flight scans and their results to idle state (matches existing route-reset behavior). | Approved |
| FR-013 | While a row's scan is in flight, the row's dedup button MUST be disabled (no concurrent re-trigger of the same row). | Approved |

### Non-Functional (NFR-###)

| ID | Requirement | Status |
|----|-------------|--------|
| NFR-001 | The duplicate-detection algorithm MUST be deterministic: given the same input collection (same tracks in the same order), it MUST produce the same groups in the same order. | Approved |
| NFR-002 | The duplicate-detection algorithm MUST be pure — implementable without touching the music client, the network, the DOM, or any global state — so it can be exhaustively unit-tested. | Approved |
| NFR-003 | Boundary cases at the duration tolerance MUST have explicit test coverage at 1999 ms, 2000 ms, and 2001 ms differences (inclusive boundary on 2000). | Approved |
| NFR-004 | On rate-limit responses, the system MUST honor the server-provided retry hint exactly — neither shorter (avoiding bans) nor unbounded longer (avoiding stalls). | Amended — see note |
| NFR-005 | On authentication-token-expiry mid-scan, the partial result MUST be discarded; the user MUST see a discriminable failure state. No partial result may be presented as a complete result. | Approved |
| NFR-006 | Long-running scans MUST surface observable progress to the user: at minimum, a "scanning" status distinguishable from "idle" and "loaded". | Approved |
| NFR-007 | Concurrent scans across distinct rows MUST be independently scheduled — a scan on Liked Songs MUST NOT block a scan on Playlist X. | Approved |
| NFR-008 | The detector MUST fail loud on malformed enrichment payloads (missing required fields: id, name, duration_ms, artists[0].name) by throwing a typed error AND ship a paired classifier predicate so callers can pre-check. | Approved |
| NFR-009 | 100% line and branch coverage on every new module MUST be enforced at the test runner (matches charter). | Approved |
| NFR-010 | Every exported function and type MUST carry JSDoc describing intent, parameters, return shape, and error modes. | Approved |

> **NFR-004 amendment (2026-06-11, post-live-verification — see [ADR-0010](../../.claude/adr/0010-cosmosasync-error-contract-and-429-backoff.md)):** Live verification established that `Spicetify.CosmosAsync.get` resolves HTTP errors as `{ code, error, message, stack }` and exposes **no** response headers, so no server `Retry-After` hint is available to honor. The original "honor the hint exactly" requirement is therefore unsatisfiable via this API. The enricher instead applies **bounded exponential backoff** on 429 (delays `min(1000·2^attempt, 16000)` ms, abort-aware, up to 5 attempts; on exhaustion → `rate-limit-unparseable`). NFR-004's intent — never hammer (avoid bans) and never stall unboundedly — is preserved via the growing-but-capped, attempt-bounded schedule.

### Constraints (C-###)

| ID | Requirement | Status |
|----|-------------|--------|
| C-001 | Mutation is OUT OF SCOPE for this mission. Detection MUST NOT call any delete or remove operation on the user's library. | Approved |
| C-002 | Cross-collection duplicate detection is OUT OF SCOPE. Each scan operates on exactly one collection. | Approved |
| C-003 | Cross-session persistence of results is OUT OF SCOPE. Closing or reloading the Dedup page discards all results. | Approved |
| C-004 | Auto-run on Spotify launch or on page mount is FORBIDDEN. Detection only runs in response to explicit user button activation. | Approved |
| C-005 | The dedup button on a row MUST remain disabled while that row is in a non-loaded state (idle, loading, failed) and while the row's own scan is in flight. | Approved |
| C-006 | All new modules MUST follow strict file-level single-responsibility: one exported behavior per file (cross-project policy). | Approved |
| C-007 | Architectural decisions (where domain code sits vs adapters, the shape of the scan port, how progress is signalled) MUST be captured as ADRs under `.claude/adr/`. | Approved |
| C-008 | A named architectural pattern (hexagonal, layered, etc.) for this mission's modules MUST be declared in the plan before implementation begins (cross-project policy). | Approved |
| C-009 | Failure to provide all required enrichment fields MUST trigger fail-loud behavior at the parser; callers MUST be able to pre-check via a classifier predicate (cross-project policy). | Approved |

## Success Criteria

- **SC-001** | A user with a collection of any size can complete a single end-to-end detection (button click → row summary) without leaving the Dedup page.
- **SC-002** | After detection completes on a collection, the user can answer two questions from the visible UI alone: "How many duplicate groups are in this collection?" and "How many tracks would be removed if I kept one per group?" — without inspecting a console or rerunning.
- **SC-003** | A user who navigated away and returned can re-trigger detection on the same row and receive a fresh result with no state bleeding through from the prior session.
- **SC-004** | The detector's output shape supports the next mission's review UI (per-group display, override of default-keep, batch confirm) without backfilling additional detection-side data.
- **SC-005** | A user whose token expires mid-scan never sees a partial result presented as complete.
- **SC-006** | All charter quality gates are green on the merge candidate: 100% line and branch coverage on new modules; explicit boundary tests at 1999 / 2000 / 2001 ms; JSDoc on every export; ADR for every load-bearing design decision.
- **SC-007** | Two scans running in parallel on different rows both complete with no observable cross-talk in either row's state.

## Key Entities

- **Track snapshot** — The inline data the music client returns from a collection (URI, name, album, first artist), before any catalog enrichment. Required for enumeration. Identified by collection URI + position. Lacks `duration_ms` and `linked_from`.
- **Enriched track** — A track snapshot extended with catalog data: `durationMs`, `canonicalUri` (= `linked_from.uri` when present, else the track URI). Required by the duration-tolerance matching rule. Local files do not become enriched tracks.
- **Duplicate group** — A non-empty ordered collection of enriched tracks that match each other under FR-004 (canonical-URI equality) or FR-005 (name+first-artist + duration tolerance). Carries a `defaultKeep` marker pointing to the earliest member by the collection's iteration order.
- **Detection result** — Per-collection payload: list of duplicate groups; total duplicate-track count; `skippedLocalCount`; `unenrichedCount`; status (`scanning` / `loaded` / `failed`); a timestamp of completion.

## Assumptions

- **A-001** — The playlists-list scaffolding from prior missions is in place: the Dedup page loads a list of playlists + Liked Songs as rows, each row carries a dedup button stub. This mission wires that stub.
- **A-002** — The duplicate-detection algorithm is ported as-is from upstream `JMPerez/spotify-dedup` (`dedup/deduplicator.ts:15-57`). No heuristic divergence (artist count, punctuation normalization, etc.) is in scope.
- **A-003** — The duration tolerance is exactly 2000 ms (inclusive on the boundary). Matches upstream behavior.
- **A-004** — Catalog enrichment uses the music client's catalog endpoint (50 IDs per batch per upstream research); exact batching and rate-limit handling details land in the plan.
- **A-005** — The user always triggers detection from inside the Spotify desktop client; browser/web invocation is not a target.
- **A-006** — Liked Songs and playlists are addressed through the existing loader port abstractions; this mission may extend those ports but does not bypass them.

## Out of Scope

- **OOS-1** — Review UI: per-group display, override of `defaultKeep`, batch confirm/cancel. Next mission.
- **OOS-2** — Mutation / deletion of duplicate tracks. Next mission.
- **OOS-3** — Cross-collection duplicate detection ("this track is in Liked Songs AND in Playlist X").
- **OOS-4** — Cross-session result persistence; caching detection results to disk.
- **OOS-5** — Background or auto-run detection on Spotify launch / page mount.
- **OOS-6** — Dedup of local files via fuzzy metadata heuristics.
- **OOS-7** — Artist-count-aware matching beyond first-artist (matches upstream behavior).
- **OOS-8** — Telemetry, analytics, or external reporting of detection runs.

## Dependencies

- **D-001** — Existing playlists-list scaffolding (per-row dedup button stub, idle/loading/loaded/failed row state model, store-driven view-model transforms, route-reset lifecycle).
- **D-002** — The music client's catalog endpoint must remain reachable from inside the Spicetify custom-app environment.
- **D-003** — The music client's library/playlist enumeration APIs (the same ones used by mission #1's playlist loader) for per-collection track listing.
