# Quickstart — Dedup Button Per Playlist Row

**Mission**: `dedup-button-per-playlist-row-01KTC3GY`
**Purpose**: paste-runnable verification steps that demonstrate every FR, NFR, SC, and C from the spec. Two surfaces: (1) automated Vitest suite, (2) live-client console + screenshot smoke after the WPs merge into `main`.

This file is the satisfaction surface reviewers walk through before invoking `spec-kitty accept`. The repo memory `spec-kitty-live-verification-required` mandates that the live-client section be exercised before any WP reaches `done`; do not skip §2.

---

## 0. Preconditions

1. Branch contract: current branch `main`, planning/base `main`, merge target `main`.
2. `npm install` succeeded since the last `package.json` change (a devDependency on `@testing-library/user-event` may or may not have been added in WP1 — see research §5).
3. `npm run test:run` is green.
4. `npm run test:coverage` reports **100 % line / 100 % branch** on `src/ui/DedupButton.tsx`, `src/ui/dedup-click-log.ts`, and the modified `PlaylistRow.tsx`, `LikedSongsRow.tsx` ranges. NFR-004 / SC-004 fail loud if either drops.
5. `npm run build` has installed the latest bits into `~/.config/spicetify/CustomApps/spicetify-dedup/`.
6. Spotify desktop is open with Spicetify applied. The user's library has at least one dedup-eligible playlist (so the loaded list has both a Liked Songs row and at least one playlist row).

If any precondition fails, fix it before continuing — these checks are not optional.

---

## 1. Automated verification (Vitest)

Run the full suite:

```bash
npm run test:run
```

Expected: 100 % pass. Key new/changed test files:

| File | New / Modified | Covers |
|---|---|---|
| `test/ui/dedup-click-log.test.ts` | NEW | FR-003, C-001, C-006 |
| `test/ui/DedupButton.test.tsx` | NEW | FR-001, FR-002, FR-004, FR-007, NFR-001, NFR-002, SC-003, C-002, C-003, C-006 |
| `test/ui/PlaylistRow.test.tsx` | MODIFIED | FR-001, NFR-002, NFR-003 on playlist rows |
| `test/ui/LikedSongsRow.test.tsx` | MODIFIED | FR-001, NFR-002 on the pinned row, plus the hardcoded URI literal |
| `test/ui/LoadedView.test.tsx` | MODIFIED | FR-002, FR-005, FR-006, SC-001, SC-002, C-005 (list-length boundary) |

Then run coverage:

```bash
npm run test:coverage
```

Expected: thresholds in `vitest.config.ts` enforce 100 % line/branch on the new files. CI fails if either drops (NFR-004, SC-004).

If a WP added `@testing-library/user-event`, also verify:

```bash
grep -E '"@testing-library/user-event"' package.json
# must appear under "devDependencies", NEVER under "dependencies" (C-002)
```

---

## 2. Live-client verification (mandatory before `spec-kitty accept`)

Capture stdout into `kitty-specs/dedup-button-per-playlist-row-01KTC3GY/live-verification.<YYYY-MM-DD>.md`.

### 2.A — Per-row click logs the correct (name, uri) pair (FR-003, FR-004, SC-001)

Open the Spotify desktop client → navigate to the Dedup custom app from the sidebar → click the page's existing **Load** button to render the playlist list. Open DevTools (Spotify's remote-debugging port on `--remote-debugging-port=9222`, or use the in-client DevTools surface).

In the console:

```javascript
// Capture every [Dedup] line emitted while we click rows.
const dedupLines = [];
const origLog = console.log;
console.log = (...args) => { if (typeof args[0] === 'string' && args[0].startsWith('[Dedup]')) dedupLines.push(args[0]); return origLog(...args); };
console.info('[2.A] Capture installed. dedupLines=', dedupLines);
```

Now, **with the mouse**, click the Dedup button on:
1. The pinned Liked Songs row.
2. The first playlist row.
3. A middle playlist row.
4. The last playlist row.

Then:

```javascript
console.info('[2.A] Captured lines:');
dedupLines.forEach((l, i) => console.info(`  ${i + 1}. ${l}`));
// EXPECT exactly 4 lines, in click order:
//   1. [Dedup] clicked: Liked Songs (spotify:collection:tracks)
//   2. [Dedup] clicked: <first playlist name> (<first playlist uri>)
//   3. [Dedup] clicked: <middle playlist name> (<middle playlist uri>)
//   4. [Dedup] clicked: <last playlist name> (<last playlist uri>)
```

**PASS** iff each line matches the row clicked, with no mix-ups, no extra lines, no missing lines.

### 2.B — Keyboard activation (NFR-001, SC-003)

```javascript
// Reset the capture.
dedupLines.length = 0;
// Tab to the first Dedup button.
const firstBtn = document.querySelectorAll('button[aria-label^="Dedup "]')[0];
firstBtn.focus();
console.info('[2.B] activeElement is first dedup button?', document.activeElement === firstBtn);
// EXPECT: true.
```

Now, **with the keyboard**:
1. Press Enter on the focused button. Capture the new `dedupLines` entry.
2. Tab to the next Dedup button. Press Space. Capture the new entry.

```javascript
console.info('[2.B] After Enter + Space:', dedupLines);
// EXPECT exactly 2 new lines, each matching the focused row.
```

**PASS** iff both keyboard activations produce a log line identical to what a mouse click would have produced.

### 2.C — Empty library produces no buttons and no logs (FR-005, SC-002)

This step is informational unless you can temporarily simulate an empty library. If your library has eligible playlists, skip — the automated `EmptyView.test.tsx` covers it. Otherwise:

```javascript
// Reset the capture.
dedupLines.length = 0;
// Stub the loader to yield zero eligible playlists (the host-side patch belongs to a future mission; for this verification, ensure no Dedup buttons exist in the DOM in the empty state):
const dedupButtons = document.querySelectorAll('button[aria-label^="Dedup "]');
console.info('[2.C] dedup buttons in empty state:', dedupButtons.length); // EXPECT: 0
console.info('[2.C] dedupLines after any clicking attempt:', dedupLines); // EXPECT: []
```

**PASS** iff button count is 0 and the captured array stays empty.

### 2.D — No side effects beyond the log (FR-007, C-001)

While the capture from §2.A is still installed, also spy on host APIs:

```javascript
const sideEffects = [];
const apis = {
  rootlist: Spicetify.Platform.RootlistAPI,
  library: Spicetify.Platform.LibraryAPI,
};
const origRootlistGet = apis.rootlist.getContents.bind(apis.rootlist);
apis.rootlist.getContents = (...a) => { sideEffects.push(['rootlist.getContents', performance.now()]); return origRootlistGet(...a); };
const origLibraryGet = apis.library.getTracks.bind(apis.library);
apis.library.getTracks = (...a) => { sideEffects.push(['library.getTracks', a[0]]); return origLibraryGet(...a); };
console.info('[2.D] Spies installed.');
```

Now click each Dedup button once more.

```javascript
console.info('[2.D] sideEffects after all Dedup clicks:', sideEffects);
// EXPECT: [] (zero entries). The click handler must not invoke any host API.
```

**PASS** iff `sideEffects` stays `[]` across every Dedup click. Restore the originals before leaving the session:

```javascript
apis.rootlist.getContents = origRootlistGet;
apis.library.getTracks = origLibraryGet;
console.log = origLog;
```

---

## 3. Visual evidence (screenshots)

Save under `kitty-specs/dedup-button-per-playlist-row-01KTC3GY/screenshots/`:

| # | View | What to capture |
|---|---|---|
| 1 | `loaded` list with buttons visible | Full page showing the Liked Songs row + ≥3 playlist rows, each with the Dedup button at the trailing edge. Confirms NFR-003 (no truncation of name/owner/count). |
| 2 | Single row close-up | Zoom on one row to show the button position, accessible label hint (hover tooltip or accessibility inspector), and surrounding spacing. |
| 3 | Keyboard focus ring | A Dedup button while focused via Tab — confirms NFR-001 reachability and the visible focus treatment. |
| 4 | DevTools console showing the captured `[Dedup] clicked: …` lines | The transcript from §2.A. |

---

## 4. Sign-off file format

A signed-off live-verification artefact is a single committed file at
`kitty-specs/dedup-button-per-playlist-row-01KTC3GY/live-verification.<YYYY-MM-DD>.md` containing:

- Spotify desktop build (from `Spicetify.Player.data.client.app_version` or the About menu).
- Spicetify CLI version (`spicetify -v`).
- Full transcripts of §2.A–§2.D with PASS/FAIL annotations.
- File paths of the four screenshots (relative to the mission directory).
- A one-line note confirming the user library size at verification time (e.g. "1 Liked Songs + 27 playlists").

This file is what `spec-kitty accept` reviews against. Do not skip — per repo memory, live-verification has been skipped twice in this repo, once shipping a critical defect.

---

## 5. Charter directive crosswalk

| Section | Charter element satisfied |
|---|---|
| §1 (Vitest 100 % coverage gate) | DIRECTIVE_030 (test+typecheck quality gate); NFR-004; SC-004 |
| §1 (test names cite FR/NFR/SC IDs) | DIRECTIVE_010 (specification fidelity) |
| §2 (live-client transcript before accept) | repo memory `spec-kitty-live-verification-required`; risk boundary "no silent library mutations" (FR-007) |
| §2.D (host-API spies stay empty) | risk boundary "no silent library mutations"; C-001 |
| §3 (screenshots) | DIRECTIVE_036 (black-box) — visual evidence accompanies DOM-level tests |
| §4 (committed sign-off file) | DIRECTIVE_003 (decision + outcome documentation) |
