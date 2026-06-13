# Specification: Fix Indefinite Hang on Duplicate Removal

**Mission:** fix-duplicate-removal-hang-01KV0K9E
**Type:** software-dev (bug fix + resilience)
**Created:** 2026-06-13
**Target branch:** main
**Status:** Draft — pending plan

## Overview

After the app identifies duplicate tracks in a playlist, the user clicks **Remove** to
delete the duplicates. Instead of completing, the UI enters a "removing…" state and stays
there **indefinitely**, and the duplicate track is **never actually removed** from the
playlist. The fault reproduces on a minimal **2-song playlist containing a single
duplicate**, which rules out volume, batching, or pagination as the cause — the removal
operation itself fails to complete and the UI has no path out of the in-progress state.

This mission has two parts:

1. **Diagnose and fix the root cause** so that clicking Remove actually deletes the
   identified duplicates and the UI transitions to a correct terminal state (success).
2. **Add resilience** so the removal flow can never again silently hang: failures and
   stalls must surface as a visible error state with a bounded wait and a recovery path,
   rather than an infinite spinner.

## User Scenarios & Testing

### Primary scenario — successful removal (the fix)

1. **Given** a playlist has been scanned and at least one duplicate has been identified,
2. **When** the user clicks **Remove** for that playlist,
3. **Then** the duplicate track(s) are deleted from the playlist,
4. **And** the UI leaves the "removing…" state and shows a clear success outcome,
5. **And** reopening the playlist confirms the duplicates are gone (backend state changed).

### Scenario — minimal reproduction (regression guard)

1. **Given** a 2-song playlist where the two songs are duplicates of each other,
2. **When** the user clicks **Remove**,
3. **Then** exactly one duplicate is removed, leaving one copy,
4. **And** the operation completes in a bounded, observable way (no indefinite spinner).

### Scenario — removal failure surfaces (resilience)

1. **Given** the underlying removal call fails or never resolves,
2. **When** the bounded wait elapses or an error is returned,
3. **Then** the UI exits the "removing…" state and shows an explicit error/failure message,
4. **And** the playlist is left in a known, non-corrupted state (no partial silent loss),
5. **And** the user can retry or dismiss without restarting the client.

### Scenario — no false success

1. **Given** the removal did not actually take effect in the backend,
2. **When** the flow terminates,
3. **Then** the UI does **not** report success — it reports the failure truthfully.

### Edge cases to cover

- Removal call rejects (thrown/rejected promise) — must be caught and surfaced.
- Removal call never settles (hangs) — must be bounded and surfaced.
- A duplicate is a local file (`spotify:local:…`) with no catalog entry.
- A duplicate is a region-relinked track where the playable URI differs from canonical.
- Removing one of two identical copies must leave exactly one (not remove both, not zero).
- Re-clicking Remove while a removal is already in progress must not double-fire.

## Requirements

### Functional Requirements

| ID | Requirement | Status |
|----|-------------|--------|
| FR-001 | The system MUST identify the precise operation that causes the removal flow to hang (the failing/never-settling call and its data path) and document the root cause before the fix lands. | Draft |
| FR-002 | Clicking **Remove** on a playlist with identified duplicates MUST delete those duplicate tracks from the playlist in the live library. | Draft |
| FR-003 | After a successful removal, reopening the affected playlist MUST show the duplicates absent (backend state actually changed, not just local UI). | Draft |
| FR-004 | The removal flow MUST transition out of the "removing…" state to a terminal state (success or failure) for every invocation — it MUST NOT remain in-progress indefinitely. | Draft |
| FR-005 | On a 2-song playlist where the two tracks are duplicates, removal MUST leave exactly one copy (remove exactly one). | Draft |
| FR-006 | When the removal operation fails or does not complete within the bounded wait, the UI MUST present an explicit, human-readable error/failure state distinct from the success state. | Draft |
| FR-007 | The UI MUST NOT report success unless the removal actually took effect. | Draft |
| FR-008 | After a failed or aborted removal, the user MUST be able to retry or dismiss the error without restarting the Spotify client. | Draft |
| FR-009 | While a removal is in progress, the Remove control MUST be guarded so the user cannot re-trigger the same removal concurrently (no double-fire). | Draft |
| FR-010 | Removal MUST honor the charter risk boundary: the per-action confirmation showing exactly what will be removed remains in force; this fix MUST NOT bypass or weaken existing deletion confirmations. | Draft |

### Non-Functional Requirements

| ID | Requirement | Status |
|----|-------------|--------|
| NFR-001 | The removal flow MUST be bounded by an explicit stall ceiling: if the underlying call neither resolves nor rejects, the flow MUST terminate into a failure state rather than waiting unboundedly. The ceiling is a guard against a hung call, not a performance SLA on Spotify's backend. | Draft |
| NFR-002 | Removal outcome handling (success, error, stall) MUST be covered by tests at 100% line/branch coverage per the charter, including the boundary around the stall ceiling (under, at, over). | Draft |
| NFR-003 | The root-cause diagnosis MUST be captured as an ADR under `.claude/adr/` (load-bearing design decision per charter DIRECTIVE_003). | Draft |
| NFR-004 | Error and failure states MUST be surfaced to the user in plain language (no raw exception/stack dumps in the primary UI message). | Draft |

### Constraints

| ID | Constraint | Status |
|----|------------|--------|
| C-001 | The fix operates inside the Spicetify Custom App and MUST use in-client Spicetify Platform APIs for mutation; it MUST NOT route removal through the public `api.spotify.com` Web API (unreachable from the client — returns 429 cold). | Draft |
| C-002 | No silent library mutation: every deletion path remains gated behind the existing per-action confirmation, and bulk-delete (>25) second-confirmation behavior MUST remain intact. | Draft |
| C-003 | TDD is mandatory: a failing test reproducing the hang/never-completing behavior MUST exist and be observed failing before the fix is implemented. | Draft |
| C-004 | Root-cause confirmation requires live evidence: a live-verification session MUST capture the console/network state during the hang to confirm the diagnosed failing call before the fix is accepted. | Draft |
| C-005 | TypeScript strict and file-level SRP per charter; any new module-layout decision declares its architectural pattern. | Draft |

## Success Criteria

| ID | Criterion |
|----|-----------|
| SC-001 | On the minimal 2-song duplicate playlist, clicking Remove deletes exactly one duplicate and the UI reaches a success state every time, with zero indefinite hangs across repeated trials. |
| SC-002 | After removal, reopening the playlist confirms the duplicate is actually gone (verified against backend state, not just local UI). |
| SC-003 | When removal is forced to fail or stall, the UI exits "removing…" into a visible error state 100% of the time and never falsely reports success. |
| SC-004 | The user can recover from a failed removal (retry or dismiss) without restarting the client. |
| SC-005 | The root cause is documented in an ADR, and a regression test reproducing the original hang exists and passes after the fix. |

## Key Entities

- **Duplicate set** — the group of tracks the detection step flagged as duplicates of one
  another within a single playlist; the input to the removal action.
- **Removal operation** — the in-client action that deletes flagged duplicate tracks from a
  playlist via Spicetify Platform APIs; the subject of the fault.
- **Removal outcome** — the terminal result of a removal operation: success, failure (call
  errored), or stall (call did not settle within the bounded wait). Drives the UI's exit
  from the "removing…" state.

## Assumptions

- The fault lives in the removal action path (the call that mutates the playlist and/or its
  result/error handling), not in duplicate detection — detection already surfaces the
  duplicates correctly enough for the user to click Remove. (To be confirmed in research.)
- The "removing…" indicator is driven by an in-progress flag that is set on click but never
  cleared because the underlying promise neither resolves into a handled success nor a
  handled failure. (Hypothesis; confirmed during diagnosis.)
- Removal targets standard playlists via Spicetify's playlist mutation API; Liked Songs /
  saved-tracks removal is not the reported repro and is out of primary scope (the user
  tested only small standard playlists).

## Dependencies

- Spicetify Platform playlist mutation API (in-client removal path).
- The existing duplicate-detection output that feeds the removal action.
- A live Spotify desktop client with Spicetify loaded for live-verification (C-004).

## Out of Scope

- Progress UX (e.g. "X of N removed") for large-playlist removals — deferred to a later
  mission.
- Changes to the duplicate-detection algorithm or matching rules.
- Liked Songs / saved-tracks removal flow (unless diagnosis proves the root cause is shared
  and the fix is identical).
