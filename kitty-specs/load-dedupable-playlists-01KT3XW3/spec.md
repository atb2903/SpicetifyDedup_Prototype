# Feature Specification: Load Dedup-able Playlists

**Mission ID**: `01KT3XW3AWY8W0YJKCE9TYNQKX`
**Mission slug**: `load-dedupable-playlists-01KT3XW3`
**Target branch**: `get_library`
**Created**: 2026-06-02
**Status**: Draft
**Mission type**: software-dev
**Input**: User command — *"load the user's dedup-able playlists"*

---

## Purpose

When a user opens the Dedup page inside their music client, they need to be able to see — on demand — every collection in their library that they are *allowed* to deduplicate. Today the page only renders the placeholder text "Hello World"; nothing about the user's actual library is visible. This iteration establishes the page's data surface: a clearly bounded list of dedup-eligible collections that all later actions (selection, scanning, removal) will operate on.

The page is **idle by default**. Opening the Dedup page issues no host API traffic; the user must activate an explicit load trigger before any fetch is performed. This protects users with large libraries from surprise slow or rate-limited work simply because they clicked the sidebar, and gives the user a predictable, consent-driven entry point into every later iteration of the extension.

This iteration deliberately stops short of selection, scanning, or any library mutation. Its job is to make the eligible set *visible and trustworthy* so subsequent iterations have a stable surface to build on.

---

## Out of Scope

These items are intentionally excluded from this iteration and are documented here so the reviewer can verify the boundary was respected:

- Per-playlist track enumeration or fetching of any individual track's metadata.
- Any selection affordance (checkbox, multi-select, "scan all", per-row action button).
- Triggering a duplicate scan, computing duplicate sets, or removing any tracks.
- Detecting or surfacing changes to the library after initial load (no live refresh).
- Manual refresh of the eligible set after a successful load (no refresh button; to re-load, the user navigates away from the Dedup page and back, returning the page to idle).
- Persisting any portion of the loaded list across sessions.
- Wall-clock budgets for the load itself; the host's library APIs are known to be slow on large libraries, and bounding total fetch time is intentionally not in scope.

---

## User Scenarios & Testing

### Primary user

A user who maintains a personal music library inside a desktop music client and wants to clean up duplicate tracks. They have already installed the Dedup extension and have opened its page from the sidebar.

### Acceptance scenarios

1. **Loads the eligible set on explicit user action.** Given a user with a library containing playlists they own, collaborative playlists they can edit, followed playlists owned by others, and a Liked Songs collection, when they open the Dedup page they see an idle state with a clear load-trigger affordance and no host fetches have been issued; when they activate the trigger, the page eventually lists exactly the playlists they own, the collaborative playlists they can edit, and Liked Songs — and no others.

2. **Liked Songs is unambiguously distinguished and pinned.** Given the eligible set includes the user's Liked Songs collection, when the loaded list renders, then Liked Songs appears as the first row of the list and is visually identifiable as a system collection (distinct from a normal playlist row).

3. **Each entry is identifiable at a glance.** Given a rendered list entry, when the user inspects it, then they can see the collection's name, its owner identity (the user themselves for owned playlists, the playlist owner for collaborative ones, and an unambiguous "Your Library" label for Liked Songs), its current track count, and its cover image (or a clear placeholder when no image exists).

4. **Native library order is preserved.** Given the music client surfaces the user's library in a specific order (e.g. most-recently-added/modified first), when the dedup-eligible list renders, then non-Liked-Songs entries appear in that same order — Liked Songs always first regardless.

5. **Loading state is visible while the user waits.** Given the user has activated the load trigger and the fetch has not yet finished, when they look at the page, then a non-blocking loading indicator is shown and the page does not appear empty or broken — even if the fetch takes a long time on a large library.

6. **Failure state is actionable.** Given the library fetch fails (network error, authentication problem, host API unavailable, unexpected response shape), when the page surfaces the failure, then the user sees an explanation of why loading failed and a retry affordance that re-attempts the load without requiring page navigation.

7. **Empty-but-valid library.** Given a user with no playlists at all and an empty Liked Songs collection, when the user activates the trigger and the fetch completes successfully, then the page shows an empty-state message — not a loading state, not a failure state.

8. **Idle until the user acts.** Given the user opens the Dedup page and does not activate the load trigger, when any amount of time passes, then no host library fetch is issued and the page remains in the idle state.

### Edge cases

- A user whose only dedup-eligible collection is Liked Songs (no playlists of their own, no collaborative-edit access).
- A library with a very large number of eligible playlists (≥500); the loaded list must render every entry correctly, regardless of how long the host APIs take to return.
- An eligible playlist with no cover image; the row must still render with an unambiguous placeholder.
- An eligible playlist with an unusually long name; the row must not break the page layout.
- The host's library API is not ready at the moment the user activates the trigger; the page must wait for readiness or surface a failure — never a silent empty state.
- Authentication expires mid-load; the page must surface this as a failure with retry, not as silent emptiness.
- The user activates the load trigger, then navigates away from the Dedup page before the load completes; returning to the Dedup page must return the user to the idle state (no orphaned loading).

---

## Functional Requirements

| ID      | Requirement                                                                                                                                                                                                  | Status |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| FR-001  | When the user activates the load trigger, the Dedup page MUST enumerate every playlist the user owns and include each in the loaded list.                                                                    | Active |
| FR-002  | When the user activates the load trigger, the Dedup page MUST enumerate every collaborative playlist for which the user has edit rights and include each in the loaded list.                                 | Active |
| FR-003  | The Dedup page MUST include the user's Liked Songs collection in the loaded list and render it as a pinned first row, visually distinct from playlist rows.                                                  | Active |
| FR-004  | The Dedup page MUST exclude any playlist the user neither owns nor has edit rights on (followed playlists, curated playlists, other users' public playlists).                                                | Active |
| FR-005  | Each list entry MUST display the collection's name, owner identity, current track count, and cover image (with a placeholder image when none is available).                                                  | Active |
| FR-006  | Playlist entries MUST be ordered to match the host client's native library order; Liked Songs MUST appear above all playlist entries regardless of native order.                                             | Active |
| FR-007  | While the eligible set is being fetched, the page MUST show a non-blocking loading indicator and MUST NOT render an empty or broken layout.                                                                  | Active |
| FR-008  | If the fetch fails, the page MUST show a human-readable failure explanation and a retry affordance that re-attempts the fetch in place without requiring page navigation.                                    | Active |
| FR-009  | If the eligible set is successfully fetched and contains zero entries (no owned playlists, no editable collaborative playlists, and an empty Liked Songs collection), the page MUST show an empty-state message distinct from the loading and failure states. | Active |
| FR-010  | Opening the Dedup page MUST replace the existing "Hello World" placeholder; the placeholder MUST NOT remain reachable through normal navigation after this iteration ships.                                  | Active |
| FR-011  | On opening the Dedup page, the page MUST display an idle state with an explicit load-trigger affordance; no host fetches related to the eligible set may be issued until the user activates that trigger.    | Active |
| FR-012  | Once the load trigger is activated, the page MUST transition away from the idle state and the trigger affordance MUST cease to be available; the only way to initiate another fetch in this iteration is via the failure-state retry affordance. | Active |

---

## Non-Functional Requirements

| ID       | Requirement                                                                                                                                                                                                                                                                                          | Status |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| NFR-001  | The load procedure MUST be algorithmically efficient: it MUST retrieve only the data needed to populate the eligible set, MUST NOT issue redundant requests for data already resolved during the same load, and MUST batch requests where the host's paged APIs support batching. No wall-clock time budget applies to total fetch duration — host-side latency on large libraries is outside the page's control. | Active |
| NFR-002  | For a library of up to 1,000 dedup-eligible playlists, the page MUST eventually render every entry without crashing the host client, without dropping entries, and without producing an unrecoverable error.                                                                                       | Active |
| NFR-003  | While loading, the host client's UI MUST remain responsive to user input; long-running fetch and transformation work MUST be performed asynchronously and MUST NOT block the host client's main interaction surfaces.                                                                              | Active |
| NFR-004  | When the load fails, the page MUST transition out of the loading state and surface the failure state to the user; the page MUST NOT remain in the loading state once a failure has been detected.                                                                                                  | Active |

---

## Constraints

| ID    | Constraint                                                                                                                                                                                                              | Status |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| C-001 | This iteration is strictly read-only. No library mutation of any kind is permitted.                                                                                                                                     | Active |
| C-002 | Only collection-level metadata may be fetched in this iteration; per-track enumeration is out of scope.                                                                                                                  | Active |
| C-003 | The loaded list MUST NOT expose any selection, scan-trigger, or per-row action affordance. The list is a presentational surface only.                                                                                   | Active |
| C-004 | The eligible set is computed from the user's library as observed at the moment of the user-initiated load. Live updates, polling, or background refresh are out of scope for this iteration.                            | Active |
| C-005 | No portion of the loaded list, nor any derived state, may be persisted across sessions of the host client.                                                                                                              | Active |
| C-006 | No fetch may be issued automatically on Dedup-page mount; the user's explicit activation of the load trigger is the sole entry point into the loading state in this iteration.                                          | Active |

---

## Success Criteria

| ID    | Criterion                                                                                                                                                                                                                                                                                                |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SC-1  | When a user activates the load trigger, the page eventually renders 100% of their dedup-eligible collections — every owned playlist, every collaborative playlist they can edit, and Liked Songs — with no silent truncation, and signals that the load has completed (no permanent loading state on success). |
| SC-2  | 100% of playlists the user neither owns nor can edit are excluded from the rendered list, verifiable by comparing the rendered list against the user's full library.                                                                                                                                    |
| SC-3  | A user can, from a single glance at any list entry, identify the collection by name, see its owner, see its track count, and see its cover image or a placeholder.                                                                                                                                       |
| SC-4  | A user whose library fetch fails sees an explanation of the failure and a working retry affordance; the page never remains in a permanent loading state after a failure has been detected.                                                                                                              |
| SC-5  | A user with no dedup-eligible collections at all sees an empty-state message, never a permanent loading spinner and never a misleading failure message.                                                                                                                                                  |
| SC-6  | Opening the Dedup page issues zero host library fetches until the user activates the load trigger, verifiable by observing host API traffic during page mount.                                                                                                                                          |

---

## Key Entities

- **Dedup-eligible collection.** A single row in the loaded list. Composed of: a stable identifier, a display name, an owner identity, a current track count, an optional cover image reference, and a kind (`playlist` or `liked-songs`). The kind drives presentation (pinning, row styling) and downstream eligibility rules.

- **Owner identity.** The user, the host's "Your Library" pseudo-owner (used for Liked Songs), or another user (for collaborative playlists). Drives the per-row owner label so the user can tell at a glance whether they're looking at one of their own playlists, a shared one, or their saved-tracks collection.

- **Eligibility predicate.** The rule that decides whether a given library collection appears in the loaded list. Concretely: *owned by the user* OR *collaborative AND the user has edit rights* OR *is the Liked Songs collection*. Anything else is excluded.

- **Load state.** The user-visible state of the page at any moment: `idle` (initial; no fetch has been issued and the load-trigger affordance is the only interactive element on the page), `loading`, `loaded`, `empty`, or `failed`. State transitions are observable in the acceptance scenarios above; in this iteration the only exits from `idle` are user activation of the trigger.

---

## Assumptions

Documented so the reviewer can flag any I got wrong before plan/tasks:

- **Library order matches the host client's native order.** The host already presents the user's library in a specific order (commonly most-recently-modified first); the dedup-eligible list inherits that order. If the host's order is unobservable or undefined, alphabetical-by-name is the fallback.
- **Liked Songs is treated as a virtual collection.** It is not a real playlist in the host's data model, but it is presented as a row alongside playlists with the visual distinction of being pinned at the top and labelled with a "Your Library" owner identity.
- **Track count is the host's reported count for the collection.** No recomputation, no reconciliation with track-level data, no caching across loads.
- **Cover image is the host's chosen representative image for the collection.** Playlists with no cover image fall back to a known placeholder; this iteration does not generate composite images from track art.
- **The Dedup page is the only consumer of the loaded list in this iteration.** No other feature reads, persists, or transforms this data yet.
- **"Failure" includes any reason the eligible set cannot be fully determined**, including (but not limited to) network errors, expired authentication, host API unavailability, and unexpected response shapes. All map to the same failure state and retry affordance from the user's point of view.
- **A slow-but-eventually-succeeding load is not a failure.** If the host APIs take a long time but eventually return correctly, the page continues to show the loading state and then renders the list. The user has opted into the wait by activating the trigger.

---

## Dependencies

- **Host music client must be running and the extension must be loaded.** Out of scope: handling the case where the extension is mounted outside the host client.
- **The host client's library APIs must be reachable when the user activates the trigger.** Failures to reach them surface as the failure state per FR-008.

---

## Risks

Surfaced via premortem reasoning so plan/tasks can mitigate them before they bite:

- **Misclassifying eligibility.** If "edit rights on a collaborative playlist" is misread (e.g. all collaborators get listed, including ones the user only follows), the user sees playlists they cannot actually deduplicate, eroding trust in every later action. Mitigation: the eligibility predicate is tested independently of the rendering layer, with fixtures covering each category enumerated in FR-001 through FR-004.
- **Empty state confused with failure.** A user with an empty Liked Songs and no playlists could see a blank page and assume the extension is broken. Mitigation: the empty state (FR-009) is a distinct, explicit screen — not the absence of content.
- **Loading state stuck on a hanging host API.** If the host API never responds and never errors after the user activates the trigger, the page sits in `loading` indefinitely. This is an **accepted tradeoff** against the alternative — partial truncation or a misleading failure — both of which would compromise SC-1 completeness. Mitigation: the explicit-trigger model (FR-011) means the user has consciously opted into the wait; the loading indicator (FR-007) makes ongoing activity visible; the user retains the option to restart the host client or navigate away and back.
- **Silent slowness erodes user trust.** A user with thousands of playlists may sit watching a spinner with no information about progress. Mitigation: future iterations may add progress disclosure (page count, current playlist count); this iteration accepts a single non-blocking indicator and explicitly documents that wall-clock time is unbounded.

---

## Review & Acceptance Checklist Pointer

A separate specification-quality checklist file is created alongside this spec at `checklists/requirements.md`. Validation results from that checklist gate progression to `/spec-kitty.plan`.
