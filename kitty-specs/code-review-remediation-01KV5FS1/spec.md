# Specification: Code Review Remediation Pass

**Mission**: code-review-remediation-01KV5FS1
**Type**: software-dev
**Target branch**: main
**Created**: 2026-06-15

## Overview

A code review of the duplicate-track detection + removal feature surfaced 14
findings (A–N) grouped into functional/correctness defects, design &
maintainability concerns, and minor style/modelling items. None were caught by
the existing gates because 100% coverage and a green type-check model the
failing boundaries with test doubles or concern design rather than line
execution.

This mission resolves **all 14 findings**. It is a remediation pass over
existing behaviour and structure — it does not add user-facing features and must
not change the duplicate-matching algorithm or the confirm-before-delete safety
model. Every change lands behind the project's existing quality gates (TDD,
100% line/branch coverage, strict TypeScript, hexagonal layering).

### Why this matters

Two findings are scale-correctness defects on exactly the libraries this project
exists to serve:

- A mixed-content collection (a playlist holding a podcast episode) is today
  either **unscannable** (throws and fails the whole scan) or **mis-scanned**
  (an episode parsed and deduped as a track).
- A large but genuinely-progressing removal can blow the 30-second whole-removal
  ceiling and be reported to the user as *"Removal timed out — no tracks were
  removed"* even though earlier batches already deleted tracks at the host — a
  host/UI divergence that fabricates a false outcome at the large-library scale.

The remaining findings degrade correctness of error guidance, leave misleading
messages wired to dead code paths, or accrue maintainability/type-drift hazards.

## User Scenarios & Testing

### Primary scenarios

1. **Mixed-content playlist scan (A).** A user scans a playlist that contains
   podcast episodes alongside tracks. The scan completes successfully; only
   genuine tracks are considered for duplication; episodes are ignored. A retry
   is never required for this reason.

2. **Large library removal past the stall window (B).** A user confirms removal
   of a large duplicate set. The host makes steady progress but total wall-clock
   exceeds the previous whole-removal ceiling. The removal is **not** aborted
   merely for taking long while progressing, and the reported outcome reflects
   the tracks actually removed — never "removed nothing" when deletions occurred.

3. **Token expiry mid-scan (D).** A user's session token expires during a scan.
   The user is shown the auth/sign-in-again guidance, not a generic "try again"
   message.

4. **Internal fault during scan (C).** An unexpected logic fault occurs inside
   the scan pipeline. The user sees an honest internal-error message, not
   *"Spotify rejected the catalog lookup"* (an interaction that no longer occurs
   in the live, inline-enricher pipeline).

5. **Compute failure before removal (F).** Computing the remove-set itself
   throws. The failure outcome does not fabricate a track identity or count from
   a collection URI; the user is told the removal could not be computed without
   being shown a non-existent "1 track".

### Edge cases

- A collection of **only** non-track items (all episodes): scans to an empty
  duplicate result, no failure.
- A non-track item that carries an `artists` array (today mis-parsed): must be
  excluded, never deduped as a track.
- A removal that stalls with **zero** progress (genuine hang): still surfaces as
  a stall, distinct from the progressing-but-slow case.
- Host not ready ("Spotify client not ready") reached through the scan path:
  fails loud with the same dedicated host-unavailable signal as the removal and
  playlists paths — not a generic relabelled error.
- The `catalog-rejected` status suffix: never renders a phantom `(status N)`
  when no status was set.

## Requirements

### Functional Requirements

| ID | Requirement | Finding | Status |
|----|-------------|---------|--------|
| FR-001 | The production enumeration path MUST restrict processed items to genuine tracks (`type === 'track'`) using the existing exported classifier, skipping non-track items (e.g. podcast episodes) rather than parsing or failing on them. | A | Approved |
| FR-002 | A removal that is making genuine host progress MUST NOT be aborted purely for elapsed wall-clock time. Stall detection MUST be evaluated against per-batch progress, so that ongoing progress resets the stall window and only a genuine lack of progress trips it. | B | Approved |
| FR-003 | When a removal ends after partial progress (stall on a later batch, or abort), the reported outcome MUST reflect the tracks actually removed at the host. The UI MUST NOT report "no tracks were removed" when deletions occurred. | B | Approved |
| FR-004 | An unexpected internal fault originating inside the scan pipeline (enumeration/enrichment/matching) MUST surface to the user as an honest internal-error condition with its own reason, distinct from any Spotify/catalog-rejection message. | C | Approved |
| FR-005 | Failure reasons that no live code path can produce (the abandoned Web-API enricher reasons per ADR-0011) MUST be removed from the error taxonomy and from any user-facing message lookup, so the reachable reason set matches the inline-enricher reality. | C | Approved |
| FR-006 | Auth-expiry classification in the enumeration path MUST inspect the field the desktop client actually populates (status under `code`, per the project research notes) so a genuine mid-scan token expiry is classified as the auth-expired reason and the correct sign-in-again guidance is shown. | D | Approved |
| FR-007 | The playlists-loader auth-expiry classification MUST be consistent with the enumerator's corrected heuristic (same field, same outcome) so the same condition produces the same guidance regardless of entry point. | D | Approved |
| FR-008 | Any structured status suffix shown for a catalog/host-rejection message MUST only render when a status value is actually present on the error; no field may be wired to a value its sole reachable producer never sets. | E | Approved |
| FR-009 | On a remove-set compute failure, the synthesised failure outcome MUST NOT fabricate a track identity or count from a collection URI (playlist URI or the liked-songs sentinel). The user-facing count/identity MUST be truthful for this edge case. | F | Approved |

### Non-Functional Requirements

| ID | Requirement | Threshold / Verification | Finding | Status |
|----|-------------|--------------------------|---------|--------|
| NFR-001 | Domain types consumed by UI components MUST have a single canonical definition. | Zero local re-declarations of domain types (`ProgressEvent`, `DetectionResult`, `DuplicateGroup`/`GroupMember`, `DetectionError`, `DetectionErrorReason`) in UI components; all consumed by import from `src/domain/`; verified by static scan. The three `WP01 domain types are defined locally…` blocks are removed. | H | Approved |
| NFR-002 | Host-availability handling MUST be uniform across the three host adapters. | All of the tracks enumerator, removal executor, and playlists loader fail loud with a dedicated host-unavailable signal before touching the host; the enumerator's unsafe cast of a possibly-`undefined` platform is eliminated (no `undefined` hidden from the compiler). | I | Approved |
| NFR-003 | The removal-confirmation orchestration MUST be decomposed to reduce cognitive load while preserving every existing invariant (notably: a compute failure never re-invokes the remove-set computation; the concurrency lock and own-entry guards remain intact). | The single large method is split into named, individually-testable helpers; invariants that today rely on prose comments are enforced structurally where practical; behaviour and 100% coverage unchanged. | J | Approved |
| NFR-004 | Failure provenance crossing the store→outcome-view boundary MUST be carried by a typed discriminator, not a brittle string prefix re-parsed by string-matching in the view. | The `stalled:` / `executor-failed:` string-prefix protocol is replaced by a typed field; no layer derives provenance by `startsWith`. | K | Approved |
| NFR-005 | The architecture/layering test MUST analyse imports structurally rather than by plain-text regex, closing the documented gaps (re-exports, dynamic `import()`, unusually-written type-only imports). | Import-graph/AST-based analysis; new fixtures demonstrate the previously-missed forms are now caught. | L | Approved |
| NFR-006 | View routing MUST NOT be expressed as an inline IIFE inside JSX. | The state→view switch is extracted into a named routing helper; the render tree references the helper. Exhaustiveness preserved. | M | Approved |
| NFR-007 | `raceStallCeiling`'s documented behaviour MUST match its implementation. | Either the documented deadline tie-break is actually wired, or the JSDoc is corrected to describe the real behaviour. No remaining assertion of a guarantee the code does not provide. | G | Approved |
| NFR-008 | The intentional placement of store `reset()` outside the FSM transition tables MUST be documented as an accepted design decision (ADR/comment), so a reader can reason about reachable lifecycle without surprise. No structural change to `reset()`. | N | Approved |

### Constraints

| ID | Constraint | Status |
|----|------------|--------|
| C-001 | All charter quality gates remain absolute on `main`: TDD (failing test first), 100% line/branch coverage at the runner, strict TypeScript, boundary testing for every numeric bound touched (e.g. the per-batch stall window, batch size). | Approved |
| C-002 | The duplicate-matching algorithm (ID equality; name + first-artist + duration-within-tolerance) MUST NOT change in behaviour. | Approved |
| C-003 | The risk-boundary safety model is preserved: no silent library mutations, per-action delete confirmation, bulk (>25) second confirmation, explicit cross-playlist scope, no auto-run on launch. | Approved |
| C-004 | Hexagonal layering and strict file-level SRP are preserved; the domain layer stays pure (no React/Zustand/Spicetify). | Approved |
| C-005 | An ADR is written for each load-bearing design decision: the per-batch stall model + partial-outcome reporting (B), the dead-code removal + error-taxonomy change incl. the new internal-error reason (C/D), and the typed failure-provenance contract (K). Finding N is documented per NFR-008. | Approved |
| C-006 | The public-facing docs/JSDoc are brought current where this pass invalidates them — notably removing the `ports/catalog-enricher.ts` JSDoc describing a `SpicetifyCatalogEnricher` adapter that does not exist. | Approved |

## Success Criteria

| ID | Criterion |
|----|-----------|
| SC-001 | A collection containing podcast/episode items scans to completion and reports only genuine track duplicates — no failure, no episode mis-deduped. |
| SC-002 | A removal that makes genuine host progress beyond the prior 30-second whole-removal window is never reported as "no tracks were removed"; the reported removed-count equals what was deleted at the host. |
| SC-003 | A genuine token expiry mid-scan yields the sign-in-again guidance, not a generic retry message — for both the liked-songs and playlist entry points. |
| SC-004 | An internal logic fault in the scan pipeline surfaces a message that does not reference a catalog/Spotify-rejection interaction. |
| SC-005 | No user-facing removal outcome ever names a non-track (collection URI) as a "track", and no phantom status suffix is shown. |
| SC-006 | Domain types have a single definition; UI components consume them by import, with no drift-capable local duplicates remaining. |
| SC-007 | Reaching the "Spotify client not ready" condition through any of the three host features produces the same dedicated host-unavailable outcome. |
| SC-008 | All charter quality gates remain green after remediation: full test suite passes, 100% line+branch coverage, strict typecheck clean. |

## Key Entities

- **DetectionErrorReason** — the closed failure-mode enum the UI narrows for
  messaging; this pass prunes unreachable members and adds an honest
  internal-error member (FR-004/FR-005).
- **Removal outcome / provenance** — the outcome surfaced after a removal,
  including whether it stalled and how many tracks were actually removed;
  provenance becomes a typed discriminator (NFR-004) and partial progress is
  faithfully represented (FR-003).
- **Host track item / classifier** — the boundary between raw host items and
  `RawTrack`; the classifier (`type === 'track'`) becomes the production gate
  (FR-001).
- **Host adapters** — tracks enumerator, removal executor, playlists loader;
  unified host-availability handling (NFR-002).

## Assumptions

- The production enricher is the inline, pure-local transform (ADR-0011); the
  Web-API enricher and its `GET /v1/tracks?ids=…` adapter are abandoned and not
  returning. Removing their dead reasons/JSDoc is safe.
- Skipping non-track items silently (rather than warning the user) is acceptable
  UX; episodes are simply out of scope for track dedup.
- Per-batch progress is the right granularity for stall detection (a batch
  completing is "progress"); a true hang within a single batch still trips the
  stall window.
- Existing test doubles (hang fake, fake enricher force-modes) may be retained
  or repurposed for coverage even where their original production trigger is
  removed, provided no dead user-facing path remains.

## Out of Scope

- New user-facing features or any change to the duplicate-matching algorithm.
- Re-introducing a Web-API enricher.
- Changing `reset()` semantics (documented as intentional per NFR-008).
- Any change to the confirm-before-delete safety thresholds.

## Traceability (finding → requirement)

| Finding | Requirement(s) |
|---------|----------------|
| A | FR-001 |
| B | FR-002, FR-003, C-005 |
| C | FR-004, FR-005, C-006 |
| D | FR-006, FR-007 |
| E | FR-008 |
| F | FR-009 |
| G | NFR-007 |
| H | NFR-001 |
| I | NFR-002 |
| J | NFR-003 |
| K | NFR-004, C-005 |
| L | NFR-005 |
| M | NFR-006 |
| N | NFR-008, C-005 |
