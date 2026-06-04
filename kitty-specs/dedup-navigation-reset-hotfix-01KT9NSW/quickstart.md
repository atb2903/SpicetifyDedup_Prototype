# Quickstart — Live-Client Verification

**Mission**: `dedup-navigation-reset-hotfix-01KT9NSW`
**Purpose**: paste-runnable steps that, when executed against the running Spotify desktop client *after* this mission's WPs merge, generate the artefacts NFR-005 and NFR-006 require.

This file is the satisfaction surface for **NFR-005** (live-client verification — FR-001/FR-002/FR-003 across every source state) and **NFR-006** (visual smoke evidence — the FR-011 spinner enlargement). It is also the closure artefact for the FR-008 defect from the prior mission. Run this before invoking `spec-kitty accept`.

---

## 0. Preconditions

1. Full test suite green: `npm run test:run` exits 0.
2. Coverage 100/100/100/100: `npm run test:coverage` reports 100% lines/branches/functions/statements; runner exits 0.
3. `npm run typecheck` exits 0.
4. `npm run build` has pushed the latest bits to `~/.config/spicetify/CustomApps/spicetify-dedup/`.
5. `spicetify apply` has been run since the last build.
6. Spotify desktop is open with Spicetify applied; the user's library has at least one dedup-eligible playlist plus some Liked Songs.

If any precondition fails, fix it before continuing.

---

## 1. NFR-005 — FR-001/FR-002/FR-003 live transcript

Open Spotify; open DevTools. **Clear the Console filter input** (set it empty). Confirm "Info" is checked in the Default levels dropdown. Then run each block in order.

### A — fresh-mount cold-start (FR-001 baseline)

```javascript
// Run BEFORE clicking into Dedup.
console.log('[A] currentPath =', Spicetify.Platform.History.location.pathname);
console.log('[A] Load button visible?', !!document.querySelector('button[aria-label="Load my dedup-able playlists"]'));
```

Then click into Dedup from the sidebar. After the page renders, paste:

```javascript
console.log('[A-after] Load button visible?', !!document.querySelector('button[aria-label="Load my dedup-able playlists"]'));
console.log('[A-after] rows on screen?', document.querySelectorAll('[class*="LoadedView-module"] li, [class*="PlaylistRow-module"], [class*="LikedSongsRow-module"]').length);
```

**PASS** iff `[A-after] Load button visible? true` and `rows on screen? 0` — page mounted on idle.

### B — FR-003 from every source state

For each source state, drive the page into that state, navigate Home, navigate back to Dedup, and assert the page is on idle.

```javascript
// Helper: capture state snapshot.
window.__snap = () => ({
  path: Spicetify.Platform.History.location.pathname,
  loadButton: !!document.querySelector('button[aria-label="Load my dedup-able playlists"]'),
  rows: document.querySelectorAll('[class*="LoadedView-module"] li, [class*="PlaylistRow-module"], [class*="LikedSongsRow-module"]').length,
  alert: !!document.querySelector('[role="alert"]'),
  loadingStatus: !!document.querySelector('[role="status"]'),
});
console.log('[B-helper] window.__snap installed');
```

#### B.1 — from `loaded`

```javascript
document.querySelector('button[aria-label="Load my dedup-able playlists"]').click();
await new Promise(r => setTimeout(r, 2500));
console.log('[B.1 pre-nav]', window.__snap());
// Now click Home in the sidebar, wait ~2s, click Dedup. Then run:
//   console.log('[B.1 post-nav]', window.__snap());
// PASS iff post-nav.loadButton === true && post-nav.rows === 0.
```

#### B.2 — from `empty`

```javascript
const slowEmpty = () => Promise.resolve({ type: 'folder', name: '<root>', items: [], totalItemCount: 0 });
const slowEmptyTracks = () => Promise.resolve({ items: [], offset: 0, limit: 1, totalLength: 0 });
const origGetB2 = Spicetify.Platform.RootlistAPI.getContents.bind(Spicetify.Platform.RootlistAPI);
const origTracksB2 = Spicetify.Platform.LibraryAPI.getTracks.bind(Spicetify.Platform.LibraryAPI);
Spicetify.Platform.RootlistAPI.getContents = slowEmpty;
Spicetify.Platform.LibraryAPI.getTracks = slowEmptyTracks;
// Restore navigation: navigate Home, then Dedup, to land on a fresh idle.
// (The previous post-nav landed idle per B.1; if not, this whole test is invalidated.)
document.querySelector('button[aria-label="Load my dedup-able playlists"]').click();
await new Promise(r => setTimeout(r, 1500));
console.log('[B.2 pre-nav]', window.__snap());  // expect empty: rows=0, no alert, no loading status, no Load button
// Click Home, wait, click Dedup. Then:
//   console.log('[B.2 post-nav]', window.__snap());
// PASS iff post-nav.loadButton === true && post-nav.rows === 0.
Spicetify.Platform.RootlistAPI.getContents = origGetB2;
Spicetify.Platform.LibraryAPI.getTracks = origTracksB2;
```

#### B.3 — from `failed`

```javascript
const origGetB3 = Spicetify.Platform.RootlistAPI.getContents.bind(Spicetify.Platform.RootlistAPI);
Spicetify.Platform.RootlistAPI.getContents = () => Promise.reject(new Error('B.3 forced'));
// Pre-state: idle. Click Load.
document.querySelector('button[aria-label="Load my dedup-able playlists"]').click();
await new Promise(r => setTimeout(r, 1500));
console.log('[B.3 pre-nav]', window.__snap());  // expect failed: alert=true, loadButton=false
// Click Home, wait, click Dedup. Then:
//   console.log('[B.3 post-nav]', window.__snap());
// PASS iff post-nav.loadButton === true && post-nav.alert === false.
Spicetify.Platform.RootlistAPI.getContents = origGetB3;
```

#### B.4 — from `loading`

```javascript
const origGetB4 = Spicetify.Platform.RootlistAPI.getContents.bind(Spicetify.Platform.RootlistAPI);
const slowGet = () => new Promise(r => setTimeout(() => r({ type: 'folder', name: '<root>', items: [], totalItemCount: 0 }), 30000));
Spicetify.Platform.RootlistAPI.getContents = slowGet;  // 30s delay — long enough to navigate-away mid-load
// Click Load to enter loading state.
document.querySelector('button[aria-label="Load my dedup-able playlists"]').click();
await new Promise(r => setTimeout(r, 500));
console.log('[B.4 pre-nav]', window.__snap());  // expect loading: loadingStatus=true
// Navigate Home WHILE LOADING IS STILL IN FLIGHT. Then Dedup. Then:
//   console.log('[B.4 post-nav]', window.__snap());
// PASS iff post-nav.loadButton === true && post-nav.loadingStatus === false.
// (The in-flight load may still resolve; verify it does NOT leak into the post-mount store state.)
Spicetify.Platform.RootlistAPI.getContents = origGetB4;
```

### C — FR-002 unmount cleanup (defense-in-depth)

This case verifies the unmount cleanup runs even if the React tree were to stay mounted across navigation (a hypothetical that's not the actual production behavior, but FR-002 covers it for future-proofing). It's tested at the unit level (T-new-2 in the test contract); a live equivalent is unnecessary. **Skip this section in the live transcript** — note "covered by unit test T-new-2 in `test/store/RouteResetContext.test.tsx`" in the artefact.

---

## 2. NFR-006 — FR-011 visual evidence (spinner enlargement)

Capture two screenshots (loading + empty) post-fix and save under `kitty-specs/dedup-navigation-reset-hotfix-01KT9NSW/screenshots/`.

### Loading screenshot

```javascript
const origGetVis1 = Spicetify.Platform.RootlistAPI.getContents.bind(Spicetify.Platform.RootlistAPI);
const slowVis = () => new Promise(r => setTimeout(() => r({ type: 'folder', name: '<root>', items: [], totalItemCount: 0 }), 8000));
const slowVisT = () => new Promise(r => setTimeout(() => r({ items: [], offset: 0, limit: 1, totalLength: 0 }), 8000));
Spicetify.Platform.RootlistAPI.getContents = slowVis;
Spicetify.Platform.LibraryAPI.getTracks = slowVisT;
// Land on idle first (navigate Home → Dedup if not already).
// Then click Load. During the 8s wait, screenshot the loading state.
// Save as kitty-specs/.../screenshots/loading-fix.png.
document.querySelector('button[aria-label="Load my dedup-able playlists"]').click();
// (manual: take screenshot during the wait)
await new Promise(r => setTimeout(r, 8500));
// Loader resolved to empty. Screenshot empty state.
// Save as kitty-specs/.../screenshots/empty-fix.png.
Spicetify.Platform.RootlistAPI.getContents = origGetVis1;
```

### SC-2 third-party-glance check (post-fix)

Compare `loading-fix.png` vs `empty-fix.png` side-by-side. The 64×64 spinner above the loading copy MUST be the dominant visual mass and read as clearly distinct from the bare-text empty state. Annotate the live-verification artefact with PASS or FAIL.

For full SC-2 record (all five states), also capture screenshots of idle, loaded, and failed states. They're unchanged from the prior mission's screenshots (`kitty-specs/dedup-page-live-client-polish-01KT6ZCR/screenshots/`); a fresh capture in this mission's screenshots dir is sufficient to confirm no regression.

---

## 3. Cleanup

Restore any spied methods at the end of the session:

```javascript
// Replace with actual references if the spies above were assigned to different names.
Spicetify.Platform.RootlistAPI.getContents = origGetB2 ?? origGetB3 ?? origGetB4 ?? origGetVis1 ?? Spicetify.Platform.RootlistAPI.getContents;
Spicetify.Platform.LibraryAPI.getTracks = origTracksB2 ?? origTracksB4 ?? origTracksVis1 ?? Spicetify.Platform.LibraryAPI.getTracks;
console.log('[cleanup] spies restored');
```

---

## 4. Sign-off

A signed-off NFR-005 / NFR-006 satisfaction looks like a single committed file at `kitty-specs/dedup-navigation-reset-hotfix-01KT9NSW/live-verification.<YYYY-MM-DD>.md` containing:

- Spotify desktop build (from Help → About).
- Spicetify CLI version (`spicetify -v`).
- HEAD SHA at verification time (`git rev-parse HEAD`).
- The full transcripts of B.1, B.2, B.3, B.4 (the four source-state round-trips) with PASS/FAIL annotations.
- Note about C: "FR-002 unmount cleanup verified at unit level via T-new-2 in `test/store/RouteResetContext.test.tsx`; live verification not applicable (the unmount cleanup case is the hypothetical 'stays-mounted' regime, which the current production behavior does not exhibit)."
- File paths of `loading-fix.png` and `empty-fix.png`, plus SC-2 third-party-glance PASS or FAIL annotation.
- Confirmation that the four prior-mission verified-PASS assertions (A, B, C.2, D from `live-verification.2026-06-04.md`) still PASS post-merge — short re-run summary or "no regression observed during full test sweep".

This artefact is what `spec-kitty accept` reviews against and what the next mission review will treat as the closure of DEFECT-1.

---

## 5. References

- `kitty-specs/dedup-page-live-client-polish-01KT6ZCR/live-verification.2026-06-04.md` (the failing-verification artefact this mission resolves)
- `kitty-specs/dedup-page-live-client-polish-01KT6ZCR/mission-review.md` DEFECT-1 (the root-cause analysis)
- `kitty-specs/dedup-page-live-client-polish-01KT6ZCR/quickstart.md` (the prior mission's quickstart, for shape reference)
- `kitty-specs/dedup-navigation-reset-hotfix-01KT9NSW/contracts/route-reset-provider.md` (the unit-test contract; T-new-2 is the unit equivalent of §C above)
