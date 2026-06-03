# Quickstart — Live-Client Verification

**Mission**: `dedup-page-live-client-polish-01KT6ZCR`
**Purpose**: paste-runnable steps that, when executed against the running Spotify desktop client *after* this mission's WPs merge, generate the artefacts NFR-005 and NFR-006 require.

This file is the satisfaction surface for **NFR-005** ("live-client verification at mission DoD") and **NFR-006** ("visual smoke evidence at mission DoD"). It is also the answer to RISK-5 from the prior mission's review (live verification was deferred without record). Run this before invoking `spec-kitty accept`.

---

## 0. Preconditions

1. The full test suite is green (`npm run test:run`) with 100 % line and branch coverage (`npm run test:coverage`).
2. `npm run build` has installed the latest bits into `~/.config/spicetify/CustomApps/spicetify-dedup/`.
3. Spotify desktop is open with Spicetify applied (`spicetify apply` since the last `config-xpui.ini` change).
4. The user's library has at least one dedup-eligible playlist plus some Liked Songs (so the happy-path renders).

If any precondition fails, fix it before continuing — these checks are not optional pieces of NFR-005.

---

## 1. NFR-005 — four-assertion live console transcript

Open Spotify, open DevTools (CDP exposes them on `--remote-debugging-port=9222`; or use Spotify's built-in DevTools via the `xpui` debug feature). Paste each block; capture stdout into `kitty-specs/dedup-page-live-client-polish-01KT6ZCR/live-verification.<DATE>.md`.

### Assertion A: zero host fetches before the user clicks Load (regression of SC-6)

```javascript
// Run BEFORE navigating to the Dedup page.
const callLog = [];
const origGet = Spicetify.Platform.RootlistAPI.getContents.bind(Spicetify.Platform.RootlistAPI);
Spicetify.Platform.RootlistAPI.getContents = (...a) => { callLog.push(['rootlist.getContents', performance.now()]); return origGet(...a); };
const origTracks = Spicetify.Platform.LibraryAPI.getTracks.bind(Spicetify.Platform.LibraryAPI);
Spicetify.Platform.LibraryAPI.getTracks = (...a) => { callLog.push(['library.getTracks', a[0], performance.now()]); return origTracks(...a); };
console.log('[A] Spy installed. callLog=', callLog);
// Now navigate to the Dedup page via the sidebar. Wait ~5 seconds.
// Then:
console.log('[A] After navigation, before click. callLog=', callLog); // EXPECT: []
```

**PASS** iff `callLog` is `[]` after navigating into the Dedup page (and before clicking the Load button).

### Assertion B: clickable Load button + happy-path render (FR-001, FR-003, FR-004, FR-005)

```javascript
// Continuing from A.
// Verify button is clickable:
const btn = document.querySelector('button[aria-label="Load my dedup-able playlists"]');
const r = btn.getBoundingClientRect();
const cx = r.left + r.width / 2;
const cy = r.top + r.height / 2;
const hit = document.elementFromPoint(cx, cy);
console.log('[B] Center hit-target:', hit?.outerHTML?.slice(0, 200));
console.log('[B] Hit is the button or descendant?', hit === btn || btn.contains(hit));
// EXPECT: true
// Now click for real (no DevTools shortcut):
btn.click(); // Or use a real mouse — the assertion is that the test would have passed with a real click.
// Wait for render:
await new Promise(r => setTimeout(r, 2000));
const rows = document.querySelectorAll('.dedup-list li, [class*="dedup-row"]'); // CSS-modules style; selector hash-tolerant
console.log('[B] Rows rendered:', rows.length); // EXPECT: 1 (Liked Songs) + N (eligible playlists)
console.log('[B] callLog after click:', callLog); // EXPECT: one rootlist.getContents + one library.getTracks
```

**PASS** iff (a) the hit-target is the button (or its descendant), (b) row count ≥ 1, (c) `callLog` shows exactly one `rootlist.getContents` and one `library.getTracks` since the click.

### Assertion C: forced-failure render (FR-006, FR-008)

```javascript
// Re-navigate to Dedup to reset (FR-008). Then before clicking Load, force a failure:
Spicetify.Platform.RootlistAPI.getContents = () => Promise.reject(new Error('forced for verification'));
document.querySelector('button[aria-label="Load my dedup-able playlists"]').click();
await new Promise(r => setTimeout(r, 1500));
const alert = document.querySelector('[role="alert"]');
const retryBtn = document.querySelector('button[class*="retry" i], button[aria-label*="retry" i]') || [...document.querySelectorAll('button')].find(b => /retry/i.test(b.textContent || ''));
console.log('[C] Alert visible?', !!alert);
console.log('[C] Retry button visible?', !!retryBtn);
// EXPECT: both true.
```

**PASS** iff the alert and retry affordance both render.

### Assertion D: retry recovery from forced failure

```javascript
// Continuing from C: restore the original loader before clicking Retry.
Spicetify.Platform.RootlistAPI.getContents = origGet;
retryBtn.click();
await new Promise(r => setTimeout(r, 2000));
const rowsAfterRetry = document.querySelectorAll('.dedup-list li, [class*="dedup-row"]');
console.log('[D] Rows after retry:', rowsAfterRetry.length); // EXPECT: ≥ 1
console.log('[D] Alert gone?', !document.querySelector('[role="alert"]')); // EXPECT: true
```

**PASS** iff the loaded list re-appears (≥ 1 row) and the alert is gone.

---

## 2. NFR-006 — five-state visual evidence

Capture a screenshot (or DOM snapshot) for each of the five state views and save under `kitty-specs/dedup-page-live-client-polish-01KT6ZCR/screenshots/`. The point is single-glance distinguishability (SC-2): a reviewer eyeballing the five images must be able to assign each one to its state without reading copy.

| # | State | How to reach it (live) | What to capture |
|---|---|---|---|
| 1 | `idle` | Open the Dedup page from a fresh navigation. | Page with the Load button visible, copy above it. |
| 2 | `loading` | Click Load, capture during the spinner phase (may need to inflict an artificial delay by wrapping `getContents` with a `setTimeout`). | Visible spinner + copy. |
| 3 | `loaded` | Wait for load to complete normally. | The styled row list with Liked Songs pinned first. |
| 4 | `empty` | Temporarily stub the loader to return `playlists:[], likedSongs:{trackCount:0}`. Or use a test-only account. | Empty-state copy, no spinner, no retry button. |
| 5 | `failed` | Use Assertion C's forced failure. | Alert + retry button. |

A separate close-up of the `failed` state's retry button confirms FR-006.

---

## 3. P4 live probe artefact (informational, not gating)

For the mission record:

```javascript
const r = await Spicetify.Platform.RootlistAPI.getContents();
console.log('Observed rootlist types:', [...new Set(r.items.map(i => i.type))]);
console.log('Type counts:', r.items.reduce((m,i)=>(m[i.type]=(m[i.type]||0)+1,m),{}));
```

Capture the output. If the user's library contains zero `'playlist-v2'` nodes (consistent with the 2026-06-03 measurement), note that — FR-010 stands but has zero observable user impact in this library.

---

## 4. Cleanup

Restore any spied methods:

```javascript
Spicetify.Platform.RootlistAPI.getContents = origGet;
Spicetify.Platform.LibraryAPI.getTracks = origTracks;
console.log('Spies removed. callLog history:', callLog);
```

---

## 5. Sign-off

A signed-off NFR-005 / NFR-006 satisfaction looks like a single committed file at `kitty-specs/dedup-page-live-client-polish-01KT6ZCR/live-verification.<YYYY-MM-DD>.md` containing:

- Spotify desktop build (from `Spicetify.Player.data.client.app_version` or similar — the user can confirm by inspecting the About menu).
- Spicetify CLI version.
- The full transcripts of Assertions A–D with their PASS/FAIL annotations.
- File paths of the five state screenshots (relative to the mission directory).
- The P4 type-count output.

This file replaces the per-WP live-probe notes (each WP's probe can live in its WP folder during implementation; the consolidated mission-level artefact is what `spec-kitty accept` reviews against).
