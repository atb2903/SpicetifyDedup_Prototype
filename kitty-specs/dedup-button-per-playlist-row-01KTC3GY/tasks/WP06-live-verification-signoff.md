---
work_package_id: WP06
title: Live-client verification + sign-off artefact
dependencies:
- WP05
requirement_refs:
- FR-001
- FR-002
- FR-003
- FR-004
- FR-005
- FR-006
- FR-007
- NFR-001
- NFR-002
- NFR-003
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts for this feature were generated on main. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into main unless the human explicitly redirects the landing branch.
subtasks:
- T025
- T026
- T027
- T028
- T029
- T030
agent: "claude:opus-4.7:implementer:implementer"
shell_pid: "468075"
history:
- date: '2026-06-05'
  note: Drafted by /spec-kitty.tasks.
authoritative_surface: kitty-specs/dedup-button-per-playlist-row-01KTC3GY/
execution_mode: planning_artifact
mission_id: 01KTC3GY1VM87DPV0SEDQS24NE
mission_slug: dedup-button-per-playlist-row-01KTC3GY
owned_files:
- kitty-specs/dedup-button-per-playlist-row-01KTC3GY/live-verification.2026-06-05.md
- kitty-specs/dedup-button-per-playlist-row-01KTC3GY/screenshots/**
priority: P1
tags: []
---

# WP06 — Live-client verification + sign-off artefact

## Objective

Build the extension, drive the quickstart §2 live-client walkthrough end-to-end in the real Spotify desktop client, capture screenshots, and commit a dated sign-off artefact that `spec-kitty accept` reads. This is the mandate from repo memory `spec-kitty-live-verification-required` — skipped twice in this repo, once shipping a critical defect. The mission cannot reach `accepted` without it.

## Context

- **Quickstart**: `kitty-specs/dedup-button-per-playlist-row-01KTC3GY/quickstart.md` §2 (live verification) and §3 (screenshots) and §4 (sign-off file format). All three are normative for this WP.
- **Repo memory**: `spec-kitty-live-verification-required` — DoD-mandated live-verification artefacts must land before any WP reaches `done`. WP06 is the mission's live-verification surface.
- **Risk boundary**: spec FR-007 and C-001 demand the click handler does nothing beyond the `console.log`. Quickstart §2.D verifies host-API spies stay empty across every click. This is the "no silent library mutations" guard in the real client.
- **Spec success criteria covered**: SC-001 (5-row duplicate-name, in §2.A if the user's library has duplicates), SC-002 (empty library, informational in §2.C), SC-003 (keyboard-only in §2.B), plus NFR-001 / NFR-003 visually validated via the screenshots.
- **No source-code changes** in this WP. It is a documentation + evidence artefact only.

## Branch strategy

- Planning/base branch: `main`.
- Merge target: `main`.
- Lane base computed by `finalize-tasks` after WP05 merges. The artefact lives under `kitty-specs/...` and is gitignored only if the `.kittify/` or `.claude/` rule extends to it — it does NOT (the spec/plan/tasks directory IS committed). Verify by running `git check-ignore kitty-specs/dedup-button-per-playlist-row-01KTC3GY/live-verification.2026-06-05.md` before writing — if it's ignored, raise the issue with the user; otherwise commit normally.

## Implementation command

```bash
spec-kitty agent action implement WP06 --agent <name>
```

## Detailed guidance per subtask

### Subtask T025 — Build and deploy

**Purpose**: Make the latest code available inside the running Spotify client.

**Steps**:

1. `npm run build`. Confirm the build succeeded with no errors. If `npm run build` does NOT auto-copy to `~/.config/spicetify/CustomApps/spicetify-dedup/`, run the documented deploy step (consult the `scripts` section of `package.json`).
2. Run `ls -la ~/.config/spicetify/CustomApps/spicetify-dedup/` and confirm the timestamps match the build run.
3. Apply Spicetify: `spicetify apply` (or restart Spotify if `spicetify apply` is not configured for this repo). The desktop client must be running the new bits.
4. Open the Dedup app from the sidebar; click the Load button; confirm the playlist list renders. If a Dedup button is NOT visible on the first row, the deploy did not pick up the new bits — restart Spotify, repeat.

**Validation**:
- [ ] `npm run build` succeeded.
- [ ] Build artefacts are present in the Spicetify CustomApp directory.
- [ ] Spotify desktop renders the new UI (Dedup buttons visible on rows).

### Subtask T026 — Quickstart §2.A — Per-row click logs the correct (name, uri)

**Purpose**: FR-003, FR-004, SC-001 in the live client.

**Steps**:

1. Open DevTools in Spotify (via `--remote-debugging-port=9222` or the in-client surface). Paste the capture snippet from quickstart §2.A:
   ```javascript
   const dedupLines = [];
   const origLog = console.log;
   console.log = (...args) => { if (typeof args[0] === 'string' && args[0].startsWith('[Dedup]')) dedupLines.push(args[0]); return origLog(...args); };
   console.info('[2.A] Capture installed. dedupLines=', dedupLines);
   ```
2. Click in sequence: (a) Liked Songs Dedup button, (b) first playlist row's Dedup button, (c) a middle playlist row's button, (d) the last playlist row's button.
3. Run `console.info('[2.A] Captured lines:', dedupLines);` — copy the full transcript.
4. Annotate the transcript: PASS iff each captured line matches the row clicked, no mix-ups, no extras, no misses. FAIL iff any line is wrong or missing — open a finding inline in the sign-off file.

**Validation**:
- [ ] Transcript captured.
- [ ] PASS/FAIL annotation written per the rule above.
- [ ] Liked Songs line is exactly `[Dedup] clicked: Liked Songs (spotify:collection:tracks)`.

### Subtask T027 — Quickstart §2.B — Keyboard activation (Enter + Space)

**Purpose**: NFR-001, SC-003 in the live client.

**Steps**:

1. Reset capture: `dedupLines.length = 0;`.
2. Tab to the first Dedup button. Confirm `document.activeElement === firstBtn` (use the snippet from quickstart §2.B).
3. Press Enter. Capture the new `dedupLines` entry.
4. Tab to the next Dedup button. Press Space. Capture the next entry.
5. Annotate PASS iff both keyboard activations produce a log line identical to what a mouse click would have produced.

**Validation**:
- [ ] Two captured lines (one Enter, one Space).
- [ ] Both match the focused row's expected `[Dedup] clicked: <name> (<uri>)` format.
- [ ] PASS/FAIL annotation written.

### Subtask T028 — Quickstart §2.D — Host-API spies stay empty

**Purpose**: FR-007, C-001 in the live client. The strongest "no silent library mutations" guard in this mission.

**Steps**:

1. Install the spies from quickstart §2.D:
   ```javascript
   const sideEffects = [];
   const apis = { rootlist: Spicetify.Platform.RootlistAPI, library: Spicetify.Platform.LibraryAPI };
   const origRootlistGet = apis.rootlist.getContents.bind(apis.rootlist);
   apis.rootlist.getContents = (...a) => { sideEffects.push(['rootlist.getContents', performance.now()]); return origRootlistGet(...a); };
   const origLibraryGet = apis.library.getTracks.bind(apis.library);
   apis.library.getTracks = (...a) => { sideEffects.push(['library.getTracks', a[0]]); return origLibraryGet(...a); };
   ```
2. Click each Dedup button once more (Liked Songs + 3 playlist rows is sufficient — minimum 4 clicks).
3. Run `console.info('[2.D] sideEffects after all Dedup clicks:', sideEffects);`. Expect `[]`.
4. Restore originals BEFORE leaving the session:
   ```javascript
   apis.rootlist.getContents = origRootlistGet;
   apis.library.getTracks = origLibraryGet;
   console.log = origLog;
   ```
5. Annotate PASS iff `sideEffects` stayed `[]` across every click. FAIL iff any entry appears — that would be a critical defect; open a finding and STOP.

**Validation**:
- [ ] Spies installed and verified active.
- [ ] All Dedup clicks completed.
- [ ] `sideEffects` is `[]`.
- [ ] Spies restored before session end.
- [ ] PASS annotation written.

### Subtask T029 — Capture screenshots

**Purpose**: Visual evidence for NFR-003 (layout non-regression) and NFR-001 (keyboard focus ring).

**Steps**:

1. Create the directory if missing: `kitty-specs/dedup-button-per-playlist-row-01KTC3GY/screenshots/`.
2. Capture four PNGs per quickstart §3:
   - `01-loaded-list.png` — full Dedup app page showing Liked Songs + ≥3 playlist rows, each with the Dedup button at the trailing edge.
   - `02-row-closeup.png` — zoom on one row showing button position, accessible label (hover tooltip or accessibility inspector view), and spacing relative to count.
   - `03-focus-ring.png` — a Dedup button while focused via Tab. Confirms NFR-001 visible focus treatment.
   - `04-console-transcript.png` — the DevTools console showing the captured `[Dedup] clicked: …` lines from §2.A.
3. Use a screenshot tool that produces lossless PNG (Spectacle, `gnome-screenshot`, `flameshot`, etc. — the project's `.claude/CLAUDE.md` for OS-specific guidance).
4. Confirm filesizes are reasonable (<2 MB each ideally; the repo has no LFS).

**Validation**:
- [ ] Four PNGs at the expected paths.
- [ ] Filenames match the table.
- [ ] Each PNG visually corresponds to its description.

### Subtask T030 — Write the sign-off artefact

**Purpose**: Commit the dated artefact that `spec-kitty accept` reads. Format per quickstart §4.

**Steps**:

1. Create `kitty-specs/dedup-button-per-playlist-row-01KTC3GY/live-verification.<YYYY-MM-DD>.md` using today's date (use `2026-06-05` if completed same day as planning; otherwise the date of the live walkthrough).
2. Top of file: a brief frontmatter or H1 heading naming the mission and date.
3. Sections (per quickstart §4):
   - **Environment**: Spotify desktop build (from `Spicetify.Player.data.client.app_version` or About menu) and Spicetify CLI version (`spicetify -v` output).
   - **Library size at verification time**: one line, e.g. "1 Liked Songs + 27 playlists".
   - **§2.A transcript + annotation**: the captured `dedupLines` content + PASS/FAIL note.
   - **§2.B transcript + annotation**.
   - **§2.C** (informational; the user's library is unlikely to be empty — note "skipped, library non-empty; automated `EmptyView.test.tsx` covers FR-005").
   - **§2.D transcript + annotation**.
   - **Screenshots**: relative paths to the four PNGs (e.g. `screenshots/01-loaded-list.png`).
   - **Overall verdict**: PASS / FAIL with a one-sentence justification.
4. Commit the file inside the lane worktree.

**Files**:
- `kitty-specs/dedup-button-per-playlist-row-01KTC3GY/live-verification.2026-06-05.md` (new, ~80-150 lines depending on transcript length).
- `kitty-specs/dedup-button-per-playlist-row-01KTC3GY/screenshots/01-loaded-list.png`
- `kitty-specs/dedup-button-per-playlist-row-01KTC3GY/screenshots/02-row-closeup.png`
- `kitty-specs/dedup-button-per-playlist-row-01KTC3GY/screenshots/03-focus-ring.png`
- `kitty-specs/dedup-button-per-playlist-row-01KTC3GY/screenshots/04-console-transcript.png`

**Validation**:
- [ ] File exists at the canonical path.
- [ ] All sections from quickstart §4 present.
- [ ] §2.A, §2.B, §2.D each carry PASS or FAIL annotations with captured evidence inline.
- [ ] Screenshot paths resolve.
- [ ] Overall verdict written.

## Definition of Done

- [ ] `npm run build` succeeded and deploy verified.
- [ ] Quickstart §2.A walkthrough completed; transcript PASS.
- [ ] Quickstart §2.B walkthrough completed; transcript PASS.
- [ ] Quickstart §2.D walkthrough completed; `sideEffects` `[]`; spies restored.
- [ ] Four PNGs captured in `screenshots/`.
- [ ] `live-verification.<YYYY-MM-DD>.md` written with all required sections and PASS/FAIL annotations.
- [ ] Overall verdict is PASS.
- [ ] WP committed inside the lane worktree.

## Risks

- **Deploy not picked up**: if the rendered UI looks like the previous build, `npm run build` either didn't run, didn't copy, or Spicetify needs `spicetify apply` + a Spotify restart. Don't proceed with §2 until the new bits are demonstrably active (test by hovering — the Dedup button must exist).
- **Console-spy interference with the app**: the §2.A `console.log` patch replaces the global until restored. If you forget to restore (`console.log = origLog;` at end of §2.D), subsequent debugging in this session may be noisy. The artefact instructions include the restore step explicitly.
- **§2.D shows non-empty `sideEffects`**: if any host-API spy fires during a Dedup click, the implementation has a bug. Do NOT mark PASS. Stop the live verification, open a finding, and route back to the WP that introduced the bug (almost certainly WP02 — the button's onClick).
- **Screenshot privacy**: the user's library names may be personal. The reviewer should accept that the screenshots reveal real playlist names; if anonymisation becomes a requirement, that is a separate spec.
- **Re-runs**: if a re-run is needed (e.g. after a follow-up fix), write a new dated artefact rather than overwriting. The latest dated file is canonical.

## Reviewer guidance

- Open the sign-off file. Confirm all sections are present.
- Cross-reference each transcript with quickstart §2.A–§2.D snippets to confirm the captures match the protocol.
- Open each screenshot. Confirm the Dedup buttons are visible at the trailing edge in `01-loaded-list.png` and that the focus ring is visible in `03-focus-ring.png`.
- Confirm §2.D's `sideEffects` is exactly `[]` — this is the spec's risk boundary in action.
- Confirm the artefact's date is recent.
- Confirm the overall verdict is PASS.

## WHEN DONE

```bash
spec-kitty agent action implement-done WP06 --agent <name> --mission dedup-button-per-playlist-row-01KTC3GY
```

After WP06 completes, the mission is ready for `spec-kitty accept` and `spec-kitty merge`.

## Activity Log

- 2026-06-06T11:25:36Z – claude:opus-4.7:implementer:implementer – shell_pid=468075 – Started implementation via action command
- 2026-06-06T11:41:44Z – claude:opus-4.7:implementer:implementer – shell_pid=468075 – Ready for review: live verification 2026-06-06 PASS (§2.A 3/3 lines correct, §2.B Enter PASS + Space-hijack documented, §2.D sideEffects [] across 3 clicks). 4 screenshots committed. Library: 1 Liked Songs (73020 tracks) + 2 playlists.
