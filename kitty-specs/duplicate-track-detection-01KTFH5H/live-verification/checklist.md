# Live Verification Checklist — Duplicate Track Detection

**Mission**: `duplicate-track-detection-01KTFH5H`
**Purpose**: Manual acceptance verification against a real Spicetify client before the mission can close. This checklist must be executed by a human with access to a Spotify desktop account. Required artefacts: `screenshot-loaded.png` and `notes.md` in this directory.

> **Prior incident note**: live verification was skipped twice in this repo, once shipping a CRITICAL defect. Per memory `spec-kitty-live-verification-required`, a WP reviewer MUST reject the WP if `screenshot-loaded.png` is absent or `notes.md` does not describe an end-to-end run.

---

## Pre-conditions

- [ ] `npm run build-local` completes with zero errors and zero TypeScript errors.
- [ ] `npm run test:run` passes (100% line + branch coverage on all new modules).
- [ ] `spicetify config custom_apps spicetify-dedup` is configured (run once per machine).
- [ ] `spicetify apply` installs the fresh bundle into the local Spotify client.
- [ ] Spotify desktop is open and the user is logged in with their real account.

---

## Scenario 1 — Dedup button visibility (FR-013 / C-005)

1. Navigate to the Dedup page inside Spotify.
2. Click "Load library" to trigger the playlist-list load (existing behavior — regression check).

- [ ] The list of playlists and Liked Songs renders without errors.
- [ ] Each row has a dedup button visible and enabled (not disabled, not hidden).
- [ ] The console shows no uncaught exceptions during the load.

---

## Scenario 2 — Happy path: row with duplicates (AS-2, FR-009)

> **Setup**: If your library has no known duplicates, create a test playlist, search for any song, and add it twice before running this step.

1. Identify a collection (Liked Songs or a playlist) that contains at least one duplicate track.
2. Click its dedup button.

- [ ] The row immediately enters "scanning" state — `ScanningView` is visible with a stage label (e.g. "Enumerating…" or "Enriching…").
- [ ] The scanning state shows quantitative progress (processed / total) when enrichment is underway — not just a spinner.
- [ ] When the scan completes, `DetectionLoadedSummary` renders showing a non-zero group count and a non-zero duplicate-track count.
- [ ] The displayed counts are plausible (sanity-check against your knowledge of the playlist).
- [ ] The dedup button is disabled while the scan is in flight and re-enabled (or replaced by the summary) when complete.
- [ ] **Capture `screenshot-loaded.png`** showing the loaded summary on the duplicate-containing row.

---

## Scenario 3 — No-duplicates path (AS-1, FR-009)

> **Setup**: Identify or create a small playlist with no duplicate tracks.

1. Click the dedup button on a playlist known to have no duplicates.

- [ ] The row transitions through "scanning" without error.
- [ ] When the scan completes, the row shows an explicit "No duplicates found" message (not a blank, not a count of zero groups with no label).
- [ ] *(Optional)* Capture `screenshot-no-duplicates.png`.

---

## Scenario 4 — Re-trigger / atomic replace (AS-10, FR-011)

1. Scan a row to completion (scenario 2 or 3 above).
2. While the row shows the loaded summary, click its dedup button again.

- [ ] The row transitions immediately from "loaded" to "scanning" — the prior summary is not visible mid-transition.
- [ ] The new scan completes and the row shows a fresh result.
- [ ] The prior result is fully replaced; no residual data from the first scan is visible.

---

## Scenario 5 — Parallel rows (AS-11, NFR-007)

1. Click the dedup button on Liked Songs.
2. Within approximately one second, click the dedup button on a second row (any playlist).

- [ ] Both rows show "scanning" state independently — neither row blocks the other.
- [ ] Both rows reach a terminal state (loaded or failed) independently.
- [ ] Neither row's progress or result contaminates the other row.

---

## Scenario 6 — Route-reset clears in-flight scans (AS-9, FR-012)

1. Click the dedup button on any row to start a scan.
2. While the scan is in flight (row shows "scanning"), navigate away from the Dedup page (e.g. click Home in the sidebar).
3. Navigate back to the Dedup page.

- [ ] On return, all rows are in idle state — no row shows "scanning" or a stale prior result.
- [ ] No in-flight network requests are visible in the console after navigation (the enricher's batches should have stopped).
- [ ] No console errors or uncaught exceptions during or after the navigation.

---

## Scenario 7 — Liked Songs row (no crash) (FR-001, AS-11)

1. Click the dedup button on the Liked Songs row specifically (not just a playlist).

- [ ] The row transitions to scanning with no crash.
- [ ] The scan completes (or fails with a visible error) — no silent hang, no null-reference exception in the console.

---

## Scenario 8 — No auto-scan on page load (FR-010, C-004)

1. Navigate away from the Dedup page entirely (e.g. to Home).
2. Navigate back to the Dedup page.

- [ ] No scanning is initiated automatically on page entry.
- [ ] All rows are in idle state until the user explicitly clicks a dedup button.
- [ ] Loading the playlist list (clicking "Load library") does NOT trigger any detection scan.

---

## Scenario 9 — Failure surface (AS-8, optional)

> This scenario is best-effort. It requires triggering a network failure mid-scan, which may not be possible in all environments.

**To attempt**: start a scan, then disable network (e.g. switch to airplane mode or block the `api.spotify.com` domain in a firewall/hosts file), then wait for the scan to hit a request.

- [ ] The row transitions to `DetectionFailedView` with a non-empty, human-readable error label.
- [ ] The error label is discriminable (not a raw exception stack trace).
- [ ] Re-enabling network and re-triggering the scan (scenario 4) succeeds.

---

## Required Artefacts

| File | Required | Description |
|------|----------|-------------|
| `screenshot-loaded.png` | **YES** | Screenshot of the loaded-summary state on a row with duplicates. Must show a non-zero group count. |
| `screenshot-no-duplicates.png` | Optional | Screenshot of "No duplicates found" on a clean playlist. |
| `notes.md` | **YES** | Narrative of the run: which collection was scanned, the duplicate counts displayed, any deviations from expected behavior, and a sign-off that AS-1, AS-2, AS-10, AS-11, and FR-012 were observed. |

---

## Definition of Done

The WP is considered verified when all of the following are true:

- [ ] Scenarios 1–8 completed with all checkboxes ticked.
- [ ] `screenshot-loaded.png` is present and shows a loaded summary with at least one duplicate group.
- [ ] `notes.md` is present and describes the run with a sign-off on AS-1, AS-2, AS-10, AS-11, and FR-012.
- [ ] No regressions in the existing playlist-load flow (scenario 1 pre-conditions).
- [ ] The implementer signs off below.

**Implementer sign-off**: _____________________________ Date: _____________
