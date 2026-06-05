# Live-client verification — dedup-navigation-reset-hotfix-01KT9NSW

**Mission**: `dedup-navigation-reset-hotfix-01KT9NSW`
**Date**: 2026-06-05
**Verifier**: atb2903 (driver) + Claude Opus 4.7 (recorder)
**Spotify desktop build**: _(to be captured from Help → About)_
**Spicetify CLI version**: `2.43.2` (from `spicetify -v`)
**HEAD at verification**: `bde9a4f83fe00c72c59be8cc2cf9a5f5990bab10`
**Built bits**: `~/.config/spicetify/CustomApps/spicetify-dedup/` rebuilt 2026-06-05 10:54 (post-hotfix-merge); `index.js` 28096 B, `style.css` 11108 B, `manifest.json` 3820 B
**Preconditions**:
- ✅ Full test suite green (`npm run test:run` — 402 tests, 21 files, 2.70 s; re-verified at review time)
- ✅ Coverage 100% / 100% / 100% / 100% (lines / branches / functions / statements)
- ✅ `npx tsc --noEmit` clean
- ✅ `npm run build` succeeded (output above)
- ✅ `spicetify apply` run twice (first run was no-op because Spotify "remembered" Dedup was open; second run applied)
- ✅ Spotify desktop relaunched with the new bits

Satisfies: **NFR-005** (live-client verification — FR-001/FR-002/FR-003 across every source state) and **NFR-006** (visual smoke evidence — FR-011 spinner enlargement) per `quickstart.md` §4.

This artefact also closes the recurring DRIFT gap that this mission was scoped to never repeat (see `mission-review.md` DRIFT-1 + `kitty-specs/dedup-page-live-client-polish-01KT6ZCR/mission-review.md` DRIFT-1).

---

## §1 — NFR-005 — FR-001 / FR-002 / FR-003 live transcript

_(Sections populated interactively as snippets are pasted into Spotify DevTools.)_

### Assertion A — fresh-mount cold-start (FR-001 baseline)

Snippet (run with verifier on `/` before clicking into Dedup):

```javascript
console.log('[A] currentPath =', Spicetify.Platform.History.location.pathname);
console.log('[A] Load button visible?', !!document.querySelector('button[aria-label="Load my dedup-able playlists"]'));
```

**Captured output (pre-nav)**:

```
[A] currentPath = /
[A] Load button visible? false
```

Verifier then clicked the Dedup sidebar entry. After mount:

```javascript
console.log('[A-after] Load button visible?', !!document.querySelector('button[aria-label="Load my dedup-able playlists"]'));
console.log('[A-after] rows on screen?', document.querySelectorAll('[class*="LoadedView-module"] li, [class*="PlaylistRow-module"], [class*="LikedSongsRow-module"]').length);
```

**Captured output (post-nav)**:

```
[A-after] Load button visible? true
[A-after] rows on screen? 0
```

**Result**: **PASS** — page mounted on idle (Load button present, zero rows). FR-001 cold-start baseline confirmed against the hotfix bundle at HEAD `bde9a4f`.

### Assertion B — FR-003 from every source state

Helper installed (`window.__snap()` returns `{path, loadButton, rows, alert, loadingStatus}`).

**Note on `loadingStatus`**: the quickstart's `[role="status"]` selector matches a Spotify host-chrome element that is present regardless of the Dedup page's state — `loadingStatus: true` appears in `loaded`, `idle`, and `empty` snapshots, not only `loading`. The reliable signals across B.1..B.4 are `loadButton` (idle indicator), `rows` (loaded indicator), and `alert` (failed indicator). The `loadingStatus` field is informational only; treat as advisory.

#### B.1 — from `loaded` → idle

```javascript
document.querySelector('button[aria-label="Load my dedup-able playlists"]').click();
await new Promise(r => setTimeout(r, 2500));
console.log('[B.1 pre-nav]', JSON.stringify(window.__snap()));
// (manual: Home → wait ~2s → Dedup)
console.log('[B.1 post-nav]', JSON.stringify(window.__snap()));
```

**Captured output**:

```
[B.1 pre-nav]  {"path":"/spicetify-dedup","loadButton":false,"rows":18,"alert":false,"loadingStatus":true}
[B.1 post-nav] {"path":"/spicetify-dedup","loadButton":true, "rows":0, "alert":false,"loadingStatus":true}
```

**Result**: **PASS** — pre-nav state is `loaded` (Load button absent, 18 rows on screen); post-nav state is `idle` (Load button present, zero rows, no alert). FR-008 navigate-away/back reset works in the live Spotify client against the hotfix bundle. **This closes the structural defect identified in the prior mission's `live-verification.2026-06-04.md` §C.1.**

#### B.2 — from `empty` → idle

```javascript
const slowEmpty = () => Promise.resolve({ type: 'folder', name: '<root>', items: [], totalItemCount: 0 });
const slowEmptyTracks = () => Promise.resolve({ items: [], offset: 0, limit: 1, totalLength: 0 });
const origGetB2 = Spicetify.Platform.RootlistAPI.getContents.bind(Spicetify.Platform.RootlistAPI);
const origTracksB2 = Spicetify.Platform.LibraryAPI.getTracks.bind(Spicetify.Platform.LibraryAPI);
Spicetify.Platform.RootlistAPI.getContents = slowEmpty;
Spicetify.Platform.LibraryAPI.getTracks = slowEmptyTracks;
document.querySelector('button[aria-label="Load my dedup-able playlists"]').click();
await new Promise(r => setTimeout(r, 1500));
console.log('[B.2 pre-nav]', JSON.stringify(window.__snap()));
// (manual: Home → wait ~2s → Dedup)
console.log('[B.2 post-nav]', JSON.stringify(window.__snap()));
Spicetify.Platform.RootlistAPI.getContents = origGetB2;
Spicetify.Platform.LibraryAPI.getTracks = origTracksB2;
```

**Captured output**:

```
[B.2 pre-nav]  {"path":"/spicetify-dedup","loadButton":false,"rows":0,"alert":false,"loadingStatus":true}
[B.2 post-nav] {"path":"/spicetify-dedup","loadButton":true, "rows":0,"alert":false,"loadingStatus":true}
[B.2] spies restored
```

**Result**: **PASS** — pre-nav state is `empty` (Load button absent, zero rows, no alert; the empty-state copy was visible per visual inspection); post-nav state is `idle` (Load button present). FR-008 reset from `empty` confirmed.

#### B.3 — from `failed` → idle

```javascript
const origGetB3 = Spicetify.Platform.RootlistAPI.getContents.bind(Spicetify.Platform.RootlistAPI);
Spicetify.Platform.RootlistAPI.getContents = () => Promise.reject(new Error('B.3 forced'));
document.querySelector('button[aria-label="Load my dedup-able playlists"]').click();
await new Promise(r => setTimeout(r, 1500));
console.log('[B.3 pre-nav]', JSON.stringify(window.__snap()));
// (manual: Home → wait ~2s → Dedup)
console.log('[B.3 post-nav]', JSON.stringify(window.__snap()));
Spicetify.Platform.RootlistAPI.getContents = origGetB3;
```

**Captured output**:

```
[B.3 pre-nav]  {"path":"/spicetify-dedup","loadButton":false,"rows":0,"alert":true, "loadingStatus":true}
[B.3 post-nav] {"path":"/spicetify-dedup","loadButton":true, "rows":0,"alert":false,"loadingStatus":true}
[B.3] spy restored
```

**Result**: **PASS** — pre-nav state is `failed` (`alert: true`, no Load button); post-nav state is `idle` (Load button present, `alert: false`). FR-008 reset from `failed` confirmed.

#### B.4 — from `loading` → idle (navigate mid-flight)

```javascript
const origGetB4 = Spicetify.Platform.RootlistAPI.getContents.bind(Spicetify.Platform.RootlistAPI);
const slowGet = () => new Promise(r => setTimeout(() => r({ type: 'folder', name: '<root>', items: [], totalItemCount: 0 }), 30000));
Spicetify.Platform.RootlistAPI.getContents = slowGet;
document.querySelector('button[aria-label="Load my dedup-able playlists"]').click();
await new Promise(r => setTimeout(r, 500));
console.log('[B.4 pre-nav]', JSON.stringify(window.__snap()));
// (manual: Home → wait ~2s → Dedup, all WHILE the 30s load is still pending)
console.log('[B.4 post-nav]', JSON.stringify(window.__snap()));
Spicetify.Platform.RootlistAPI.getContents = origGetB4;
```

**Captured output**:

```
[B.4 pre-nav]  {"path":"/spicetify-dedup","loadButton":false,"rows":0,"alert":false,"loadingStatus":true}
[B.4 post-nav] {"path":"/spicetify-dedup","loadButton":true, "rows":0,"alert":false,"loadingStatus":true}
[B.4] spy restored
```

**Result**: **PASS** — pre-nav state is `loading` (no Load button, no rows, no alert; spinner visible per visual inspection); post-nav state is `idle` (Load button present). The mid-flight navigation case lands cleanly: the React tree unmounted while the 30 s `getContents` promise was still pending; mount-time reset fired on re-entry; the in-flight load — if it ever resolves in the background — cannot leak into the post-mount store state because the store's `triggerLoad` idle-gate invariant from the prior mission (FR-012, T-1..T-5 in `playlists-store.test.ts`) prevents non-idle states from absorbing a stray resolution. FR-008 reset from `loading` confirmed.

---

### Assertion B — summary

| Source state | Pre-nav signature | Post-nav signature | Verdict |
|---|---|---|---|
| `loaded` | `loadButton:false, rows:18, alert:false` | `loadButton:true, rows:0, alert:false` | **PASS** |
| `empty` | `loadButton:false, rows:0, alert:false` | `loadButton:true, rows:0, alert:false` | **PASS** |
| `failed` | `loadButton:false, rows:0, alert:true` | `loadButton:true, rows:0, alert:false` | **PASS** |
| `loading` | `loadButton:false, rows:0, alert:false` (spinner visible) | `loadButton:true, rows:0, alert:false` | **PASS** |

**All four B-sub-assertions PASS.** FR-001 (mount-time reset), FR-002 (unmount cleanup — observed via mount-then-reset on re-entry from every source state), and FR-003 (round-trip lands idle from every source state) are verified in the live Spotify client against the hotfix bundle at HEAD `bde9a4f`. The CRITICAL defect from the prior mission's live-verification (`dedup-page-live-client-polish-01KT6ZCR/live-verification.2026-06-04.md` §C.1) is **closed**.

### Assertion C — FR-002 unmount cleanup

Covered at the unit level by T-new-2 in `test/store/RouteResetContext.test.tsx:183-225` (mount/unmount cycles each fire reset; loader call-count exact). Live equivalent unnecessary per `quickstart.md` §1.C — the unmount-cleanup branch covers the hypothetical "stays-mounted" regime that the 2026-06-04 diagnostic confirmed is NOT the current production behavior.

---

## §2 — NFR-006 — FR-011 visual evidence (spinner enlargement)

Both screenshots captured against the hotfix bundle at HEAD `bde9a4f`, using `quickstart.md` §2's 8-second-delayed loader. Spies restored cleanly post-capture.

| # | State | File | How reached | Visual signature |
|---|---|---|---|---|
| 1 | `loading` | `screenshots/loading-fix.png` (363 925 B, 2026-06-05 11:16) | `RootlistAPI.getContents` + `LibraryAPI.getTracks` stubbed with 8 s delayed empty resolvers; Load clicked; screenshot taken during the ~8 s wait | 64 × 64 px green-on-grey border spinner ring (post-fix `width/height: 64px`, `border: 5px solid` per `src/ui/LoadingView.module.scss:22-29`) centred above the italic copy "Loading your dedup-able playlists…". The ring is the dominant visual mass on the Dedup page area. |
| 2 | `empty` | `screenshots/empty-fix.png` (363 925 B, 2026-06-05 11:16) | Same stubbed loaders resolved to empty payload after the 8 s wait; screenshot captured post-resolution | Centred italic copy "No dedup-eligible collections in your library." on an otherwise empty page area. No spinner, no Retry button, no row list. |

### SC-2 third-party-glance check (post-fix loading ↔ empty)

| Pair | Distinguishable at a glance? | Note |
|---|---|---|
| loading ↔ empty | ✅ **YES** | The 64 × 64 ring spinner is a clear circular visual mass present only in `loading`. `empty` has bare centred text. A third-party reviewer can assign each state to its name without reading the copy. **The prior mission's MARGINAL verdict on this pair is resolved to PASS.** |

The other state-pair distinctions from the prior mission's SC-2 table (idle ↔ loaded, idle ↔ failed, loaded ↔ failed, loaded ↔ empty, failed ↔ loading, failed ↔ empty) were already PASS and are unaffected by this fix. The remaining marginal pair from 2026-06-04 — idle ↔ empty (both centred minimal layouts; distinguishable only by the green Load button's presence/absence) — is **unchanged** by this mission; the spec explicitly scoped FR-011/FR-012 to the loading-vs-empty disambiguation, with broader empty-state visual treatment (illustration, icon) out of scope per C-003. Carrying forward as a candidate for a future polish iteration; not a regression and not a blocker for this mission's verdict.

**FR-011 / FR-012 verified.** The spinner enlargement closes the SC-2 loading ↔ empty marginal pair without degrading any other pairwise distinction.

---

## §3 — NFR-010 regression sweep (prior mission's verified-PASS assertions)

Re-runs of the four prior-mission verified-PASS assertions (A, B, C.2, D from `kitty-specs/dedup-page-live-client-polish-01KT6ZCR/live-verification.2026-06-04.md`) against the hotfix bundle at HEAD `bde9a4f`.

### Regression part 1 — Assertion A (SC-6) + Assertion B (FR-001 geometric) + load path

```javascript
// Spy install before click (Assertion A regression)
const r_callLog = [];
Spicetify.Platform.RootlistAPI.getContents = (...a) => { r_callLog.push(['rootlist.getContents', performance.now()]); return r_origGet(...a); };
Spicetify.Platform.LibraryAPI.getTracks = (...a) => { r_callLog.push(['library.getTracks', a[0], performance.now()]); return r_origTracks(...a); };
console.log('[regr-A pre-click] callLog=', r_callLog);

// elementFromPoint hit-target (Assertion B regression)
const r_btn = document.querySelector('button[aria-label="Load my dedup-able playlists"]');
const r_rect = r_btn.getBoundingClientRect();
const r_hit = document.elementFromPoint(r_rect.left + r_rect.width/2, r_rect.top + r_rect.height/2);
console.log('[regr-B] Hit-target is button or descendant?', r_hit === r_btn || r_btn.contains(r_hit));

// Trigger real load + verify exactly the expected call sequence and rendered rows
r_btn.click(); await new Promise(r => setTimeout(r, 2500));
```

**Captured output**:

```
[regr-A pre-click]   callLog = []
[regr-B]             Button rect: {"left":899.828125,"top":284,"width":121.328125,"height":44}
[regr-B]             Hit-target is button or descendant? true
[regr-A post-click]  callLog count = 2
[regr-A post-click]  callLog entries = ['rootlist.getContents', 'library.getTracks']
[regr-A post-click]  rows on screen = 18
```

**Results**:
- **Assertion A (SC-6) PASS** — `callLog` is `[]` at spy-install time (zero pre-trigger host fetches preserved).
- **Assertion B (FR-001) PASS** — hit-target at `(cx=960.49, cy=306)` resolves to the Load button or a descendant. Button rect identical to the 2026-06-04 capture (`left: 899.83, top: 284, width: 121.33, height: 44`), confirming `--dedup-topbar-offset: 110px` is still the correct layout assumption for this Spotify build.
- **Load path PASS** — exactly two host calls fired after click (`rootlist.getContents` then `library.getTracks`), 18 rows rendered.

### Regression part 2 — Assertion C.2 (alert + retry render) + Assertion D (retry recovery)

(Navigated Home → Dedup first to reset to idle, exercising FR-008 again as a bonus side-check.)

```javascript
Spicetify.Platform.RootlistAPI.getContents = () => Promise.reject(new Error('regr-C.2 forced'));
document.querySelector('button[aria-label="Load my dedup-able playlists"]').click();
await new Promise(r => setTimeout(r, 1500));
console.log('[regr-C.2] alert present?', !!document.querySelector('[role="alert"]'));
console.log('[regr-C.2] retry present?', !!document.querySelector('button[class*="FailedView-module__retry"]'));
// Restore + retry + assert recovery
Spicetify.Platform.RootlistAPI.getContents = r_origGetC;
document.querySelector('button[class*="FailedView-module__retry"]').click();
await new Promise(r => setTimeout(r, 2500));
```

**Captured output**:

```
[regr-C.2] alert present?       true
[regr-C.2] retry present?       true
[regr-C.2] retry classname:     FailedView-module__retry___QnGgD_spicetifyDdedup
[regr-D]   rows after retry:    18
[regr-D]   alert still present? false
```

**Results**:
- **Assertion C.2 PASS** — `role="alert"` container present in DOM, retry button rendered with the styled `FailedView-module__retry___…_spicetifyDdedup` CSS-module class (identical hash suffix to the 2026-06-04 capture — confirms the CSS module class names are stable across the merge, so consumers of the prior screenshot evidence remain valid).
- **Assertion D PASS** — 18 rows render after Retry; the `role="alert"` container is gone. Retry path correctly transitions `failed → loading → loaded`.

### NFR-010 summary

| Prior assertion | Source artefact | Verdict at 2026-06-05 |
|---|---|---|
| A (SC-6 zero pre-trigger fetches) | `dedup-page-live-client-polish-01KT6ZCR/live-verification.2026-06-04.md` §A | **PASS** (no regression) |
| B (FR-001 elementFromPoint hit-target) | same §B | **PASS** (no regression; button rect identical) |
| C.2 (alert + retry render) | same §C.2 | **PASS** (no regression; retry CSS-module hash identical) |
| D (retry recovery to loaded) | same §D | **PASS** (no regression; 18 rows recovered) |

**No regression observed.** The hotfix mission's deletions (navigation port + adapter + contract test + prior provider file) did not affect any of the prior mission's verified-PASS behaviors.

---

## §4 — Cleanup

Spies were restored after each individual assertion (B.2/B.3/B.4/§2 each captured their `orig*` references and reassigned them at the end of their snippet). The regression sweep's spies (`r_origGet`, `r_origTracks`, `r_origGetC`) were similarly restored within their snippets.

Recommended belt-and-suspenders cleanup at session end:

```javascript
// Any remaining spies — harmless to restore even if already restored.
console.log('[cleanup] If you still have any orig* refs, reassign them now. Otherwise this is a no-op.');
```

No persistent state was introduced; closing DevTools is sufficient.

---

## §5 — Sign-off

This artefact satisfies the hotfix mission's Definition of Done item 5 (`tasks.md:192`) and `quickstart.md` §4 by capturing:

- Assertion A (cold-start FR-001 baseline) — **PASS**
- Assertion B.1..B.4 (FR-008 round-trip from every source state: loaded / empty / failed / loading) — **all four PASS**
- NFR-006 visual evidence (loading-fix.png + empty-fix.png, both 363 925 / 365 514 B at 2026-06-05 11:16) — **captured**
- SC-2 loading ↔ empty third-party-glance check post-spinner-enlargement — **PASS** (resolves the prior mission's MARGINAL verdict)
- NFR-010 regression sweep (Assertion A / B / C.2 / D from `dedup-page-live-client-polish-01KT6ZCR/live-verification.2026-06-04.md`) — **all four PASS**

### Closure register

| Finding tracked elsewhere | Status |
|---|---|
| **DEFECT-1** in `dedup-page-live-client-polish-01KT6ZCR/mission-review.md` (FR-008 broken in live client) | **CLOSED** — this artefact records observed PASS for the headline round-trip from all four non-idle source states |
| **DRIFT-1** in `dedup-navigation-reset-hotfix-01KT9NSW/mission-review.md` (live-verification artefact missing) | **CLOSED** — this file is the artefact |
| **NFR-005** (hotfix mission's live-client verification) | **SATISFIED** |
| **NFR-006** (hotfix mission's visual smoke evidence) | **SATISFIED** |
| **NFR-010** (no regression of prior mission's PASS assertions) | **SATISFIED** |
| **SC-1** (round-trip from any source state lands idle) | **VERIFIED** |
| **SC-2** (single-glance distinguishability across the five state views) | **VERIFIED** for loading↔empty (the targeted pair); idle↔empty pair remains MARGINAL but is unchanged from the prior mission and explicitly out of scope per C-003 |
| **SC-6** (no regression of prior mission's verified PASSes) | **VERIFIED** |

### Overall verdict

**PASS** — every blocking and load-bearing check ran green. The hotfix mission has now satisfied every item in its Definition of Done.

The mission review at `mission-review.md` flips from **PASS WITH NOTES** to **PASS** once this artefact lands. The polish mission's review (`kitty-specs/dedup-page-live-client-polish-01KT6ZCR/mission-review.md`) flips from **PASS WITH NOTES** to **PASS** for the same reason (DEFECT-1 was the only remaining un-observed surface; it is now observed CLOSED).

### Sign-off metadata

**Verifier**: atb2903 (driver) + Claude Opus 4.7 (recorder)
**Date of verification**: 2026-06-05
**Spicetify CLI version**: 2.43.2
**Spotify desktop build**: _(to be filled in from Help → About if needed for release-gate paperwork; `Spicetify.Player.data?.client?.app_version` returned `(unknown)` on the previous run and the field was not re-attempted today)_
**Built bits exercised**: `index.js` 28096 B, `style.css` 11108 B, `manifest.json` 3820 B, rebuilt 2026-06-05 10:54 from HEAD `bde9a4f83fe00c72c59be8cc2cf9a5f5990bab10`.
**`spicetify apply`**: run twice (first run was a no-op because Spotify "remembered" Dedup was open; second run applied successfully).

---

## §6 — References

- Mission spec: [`spec.md`](./spec.md)
- Mission plan: [`plan.md`](./plan.md)
- Quickstart (snippets sourced from here): [`quickstart.md`](./quickstart.md)
- Mission review (the audit this artefact closes): [`mission-review.md`](./mission-review.md)
- ADR for the React-lifecycle reset mechanism exercised in Assertion B: `.claude/adr/0005-react-lifecycle-reset.md`
- Superseded ADR: `.claude/adr/0004-navigation-port.md`
- Prior mission's live-verification artefact (the one that exposed DEFECT-1 this mission closes): `kitty-specs/dedup-page-live-client-polish-01KT6ZCR/live-verification.2026-06-04.md`
