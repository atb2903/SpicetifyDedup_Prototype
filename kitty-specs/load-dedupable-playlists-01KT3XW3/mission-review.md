# Mission Review Report: load-dedupable-playlists-01KT3XW3

**Reviewer**: Claude (post-merge mission review skill)
**Date**: 2026-06-03
**Mission**: `load-dedupable-playlists-01KT3XW3` — Load Dedup-able Playlists
**Baseline commit**: `c3affed` (prior `main` merge-base — Hello World iteration)
**Squash merge of mission**: `1a1e1ae`
**HEAD at review**: `1a1e1ae54ba8a1953a6e53b2e14f244deb1adb3c`
**WPs reviewed**: WP01..WP09

## Mission identity and status

- All 9 WPs have settled: WP01 done; WP02–WP09 approved.
- Mission was accepted (`accept_commit: 490b193`) at 2026-06-03T13:53:48 and squash-merged to `get_library` at `1a1e1ae`.
- Workspace at HEAD: full suite **358 / 358 passing**, **100 % coverage** on statements (214/214), branches (185/185), functions (51/51), lines (189/189). `tsc --noEmit` clean. Architecture import-graph test green.
- WP01 has `force_count=1` (a routine `approved → done` promotion override on the shared lane). WP02 and WP03 carry `force_count=2`, but inspection of `status.events.jsonl` shows both forces were procedural (a workflow revert on WP02, a false-claim release on WP03) and not content disagreements. No rejection cycles; no arbiter overrides.

## Coverage map

The squash merge touches 48 files: 20 new source files under `src/`, 14 new test files under `test/`, plus 2 fixtures, the architecture test, `app.tsx`/`app.test.tsx` rewrites, README, package.json, package-lock.json, tsconfig.json, and vitest.config.ts. Every file claimed by a WP's `owned_files` produces a diff in this set; no claimed file is missing from the diff. The hexagonal layout from `plan.md` materialises file-for-file under `src/{domain,ports,adapters,store,ui,types}`.

---

## FR Coverage Matrix

| ID | Description (brief) | WP Owner | Test File(s) | Adequacy | Finding |
|----|---------------------|----------|--------------|----------|---------|
| FR-001 | Enumerate owned playlists | WP03/WP06 | `test/domain/eligibility.test.ts` truth-table case `owned=true`; `test/store/playlists-store.test.ts` happy-path | ADEQUATE | — |
| FR-002 | Enumerate collaborative+edit playlists | WP03/WP06 | `eligibility.test.ts` truth table `collab=true canEdit=true`; store integration | ADEQUATE | — |
| FR-003 | Liked Songs pinned + visually distinct | WP03/WP08 | `view-models.test.ts` pinning, `LikedSongsRow.test.tsx` distinct copy & class | ADEQUATE | — |
| FR-004 | Exclude non-eligible playlists | WP03 | `eligibility.test.ts` rows for owned=false/collab=false and collab=true/canEdit=false | ADEQUATE | — |
| FR-005 | Each entry shows name/owner/count/cover (placeholder when none) | WP08 | `PlaylistRow.test.tsx` exercises name, owner labels, track-count pluralisation, placeholder when `imageUrl===null` | PARTIAL | [RISK-1] — only synthetic `https://…` URLs tested; the live rootlist fixture proves real playlists carry `spotify:mosaic:…` URIs that browsers cannot render as `<img src>` |
| FR-006 | Native order preserved; Liked Songs first | WP03 | `ordering.test.ts`, `view-models.test.ts`, `LoadedView.test.tsx` ordering | ADEQUATE | — |
| FR-007 | Non-blocking loading indicator | WP07 | `LoadingView.test.tsx` (role=status, accessible name) | ADEQUATE | — |
| FR-008 | Failure explanation + retry | WP02/WP07 | `FailedView.test.tsx` parametrised over all 10 reasons; store retry test | ADEQUATE | — |
| FR-009 | Empty state distinct | WP06/WP07 | `playlists-store.test.ts` empty-iff (no eligible AND likedSongs empty); `EmptyView.test.tsx` distinct copy | ADEQUATE | — |
| FR-010 | Hello World replaced and not reachable | WP09 | `test/app.test.tsx` mounts DedupPage; repo grep confirms no `Hello World` strings remain in `src/`/`test/` | ADEQUATE | — |
| FR-011 | Idle by default; no fetch before trigger | WP06/WP07/WP09 | `playlists-store.test.ts` "does not call the loader before triggerLoad" (SC-6); `IdleView.test.tsx` SC-6 case; `app.test.tsx` smoke | ADEQUATE | — |
| FR-012 | Trigger ceases after activation; only retry re-fires | WP09 | `DedupPage.test.tsx` routes by `kind` (IdleView only when `idle`); store-level: `retry` is gated on `kind==='failed'` | PARTIAL | [RISK-4] — `triggerLoad` itself is **not** gated on `kind==='idle'`; FR-012's invariant is enforced only by the page router, not the store |
| NFR-001 | Algorithmic efficiency; no redundant calls; batch where supported | WP04/WP05 | `playlists-loader-contract.test.ts` counts `callCount`; adapter test asserts only one `getContents()` and one `getTracks({limit:1})` per `load()` | ADEQUATE | — |
| NFR-002 | Up to 1 000 playlists without crash/drop | WP02 | `load-state.test.ts` boundary cases items.length=1, 2, 1000, 1001 (FSM); `LoadedView.test.tsx` 1001-row rendering | ADEQUATE for the FSM and renderer; UNVERIFIED in production (no live-client run at scale) |
| NFR-003 | Host UI remains responsive during load | WP06/WP07 | No direct test. The store wraps `loader.load()` in an `await`; click handler is fire-and-forget (`void triggerLoad()`); CPU work is the synchronous `walkItems` recursion in the adapter | PARTIAL | walkItems is synchronous over the entire rootlist; cost is bounded at the NFR-002 ceiling (~1 000 items, trivial per-item work) so the gap is academic at the documented bound, but no test asserts the property |
| NFR-004 | Failure exits loading state | WP02 | `load-state.test.ts` `loading + load-failed → failed` | ADEQUATE | — |
| SC-1 | 100 % of dedup-eligible collections rendered, no silent truncation | WP04/WP05 | Contract test, store test; no truncation in the FSM | PARTIAL | [DRIFT-1] — adapter only handles `type === 'playlist'`; data-model §3 also names `'playlist-v2'`; mismatched node types are silently dropped by `walkItems` |
| SC-2 | 100 % of non-eligible playlists excluded | WP03 | `eligibility.test.ts` truth-table all 8 rows; store test confirms `PL_FOLLOWED` not in result | ADEQUATE | — |
| SC-3 | Name + owner + count + cover/placeholder at a glance | WP08 | `PlaylistRow.test.tsx`, `LikedSongsRow.test.tsx` | PARTIAL | [RISK-1] same as FR-005 |
| SC-4 | Failure surfaces explanation + retry; never stuck loading | WP02/WP07 | `FailedView.test.tsx`, `playlists-store.test.ts` retry cycle | ADEQUATE | — |
| SC-5 | Zero-collections case shows empty state | WP06/WP07 | `playlists-store.test.ts` empty-state path; `EmptyView.test.tsx` | ADEQUATE | — |
| SC-6 | Zero host fetches before trigger | WP06/WP07/WP09 | `playlists-store.test.ts` `callCount==0` before trigger; `IdleView.test.tsx` same; `app.test.tsx` smoke does not call into stubbed `Spicetify.Platform.*` | ADEQUATE | — |

**Legend**: ADEQUATE = test constrains the required behavior; PARTIAL = test exists but the production model is unmodelled in the fixture, or the invariant is enforced elsewhere; MISSING = no test found; FALSE_POSITIVE = test passes even if implementation is deleted.

---

## Drift Findings

### DRIFT-1: Adapter does not handle the `playlist-v2` URI type that the data model explicitly names

**Type**: SPECIFICATION-FIDELITY DRIFT (DIRECTIVE_010)
**Severity**: MEDIUM
**Spec reference**: `data-model.md` §3 — *"`Spicetify.URI.fromString(uri).type === 'playlist'` or `'playlist-v2'`; otherwise drop the item silently (it isn't a playlist row at all)."*
**Evidence**:
- `src/adapters/spicetify-playlists-loader.ts:141` — `if (type === 'playlist') { out.push(this.toRawCollection(node)); continue; }`. The only positive branch checks `'playlist'`.
- `walkItems` line 145 comment: *"Unknown node types (separators, future kinds) are silently skipped."* A `playlist-v2` node lands in this branch.
- `test/adapters/spicetify-playlists-loader.test.ts:34` — `type HostPlaylist = Record<string, unknown> & { type: 'playlist' }`. No test fixture uses `type: 'playlist-v2'`.
- The captured fixture `test/adapters/fixtures/rootlist-response.sample.json` shows only `type: 'playlist'` instances; the test surface mirrors the fixture and cannot detect drift.

**Analysis**: The WP05 review approval acknowledged the deviation from the `Spicetify.URI.fromString` validation path documented in §3 (it chose the rootlist node's `type` field instead, as the "authoritative host signal") but did not surface the matching `'playlist-v2'` branch. The data model's intent is that **both** `playlist` and `playlist-v2` URI types are valid playlist rows. The implementation honours one; rootlist nodes typed as `playlist-v2` (whether already present in some user libraries or rolled out later) are silently dropped via the "unknown node" path. The silent drop turns a host-side migration into an undetectable SC-1 violation ("100 % of dedup-eligible collections rendered, no silent truncation").

This is the textbook "fixture-shaped tests pass; production behaviour silently truncates" failure mode the mission review skill calls out.

---

## Risk Findings

### RISK-1: `spotify:mosaic:` cover URIs are passed unfiltered to `<img src>`, producing broken images for typical user-owned playlists

**Type**: ERROR-PATH / SILENT FAILURE / SC-3 VIOLATION
**Severity**: HIGH
**Location**: `src/adapters/spicetify-playlists-loader.ts:232-238` (`firstImageUrl`); `src/ui/PlaylistRow.tsx:57-68` (`Cover`)
**Trigger condition**: Any playlist whose `images[0].url` in the host response is a `spotify:mosaic:…` URI rather than an `https://…` URL. The captured live fixture demonstrates this is the dominant case for user-owned playlists (`"current batch"`, `"new releases"`, and the nested-folder playlist all carry `spotify:mosaic:…` URLs; only the Spotify-curated DJ playlist has an `https://lexicon-assets.spotifycdn.com/…` URL).

**Analysis**:
- `firstImageUrl` performs only an "is a non-empty string" check and returns the value verbatim.
- The adapter's own JSDoc (line 30–32) **explicitly anticipates** the `spotify:mosaic:` shape: *"May be a `spotify:mosaic:` URI rather than an https URL; the domain accepts any non-empty string."* The adapter is correct per its contract — but the UI never received the matching guidance.
- `PlaylistRow`'s `Cover` only falls back to the placeholder when `imageUrl === null`. A `spotify:mosaic:` string is non-null, so it bypasses the placeholder branch and is handed to `<img src=…>`. The browser cannot resolve a `spotify:` URI in an `<img>` element; the user sees a broken-image glyph.
- **Why the unit tests miss it**: `test/ui/PlaylistRow.test.tsx:24,57,68,75` exclusively uses `https://…` URLs and `null`. No test exercises the production-realistic `spotify:mosaic:…` payload. The tests pass but constrain a different model than the one the adapter produces.
- **Spec impact**: FR-005 requires *"cover image (with a placeholder image when none is available)"*; SC-3 requires *"see its cover image or a placeholder"*. In the dominant case for user-owned playlists, neither obtains.
- **Mitigation surface** is small: either the adapter normalises `spotify:mosaic:` (and `spotify:image:`) values to `null` at the boundary so the existing placeholder branch fires, or the UI's `Cover` distinguishes URL-shaped values from `spotify:` URIs.

---

### RISK-2: "Navigate away mid-load → return to idle" edge case is not implemented

**Type**: BOUNDARY-CONDITION / SPEC-EDGE-CASE GAP
**Severity**: MEDIUM
**Location**: `src/app.tsx:18` (`const productionStore = createPlaylistsStore(new SpicetifyPlaylistsLoader())`); no unmount/cleanup logic anywhere in `src/`.
**Trigger condition**: User clicks Load, navigates away from the Dedup page mid-fetch, then returns.

**Analysis**:
- Spec edge case (line 69): *"The user activates the load trigger, then navigates away from the Dedup page before the load completes; returning to the Dedup page must return the user to the idle state (no orphaned loading)."*
- The production store is a module-scope singleton created at first import. It outlives any unmount of `<App />` because ES module evaluation is one-shot. Whatever state the user left behind (`loading`, `loaded`, `failed`, `empty`) persists into the next mount.
- No `useEffect` cleanup, no `componentWillUnmount`, no store-reset action exists. Repo grep for `navigate`, `unmount`, or `reset` against `src/` returns nothing.
- This was not addressed by any WP; it is not flagged in `tasks.md` or the per-WP DoDs as deferred. It is documented only in `spec.md` as an edge case under Acceptance Scenarios.
- **Spec impact**: silent violation of the documented edge case. The user does not see broken UI, but the "idle by default on return" promise is not kept.
- **Note**: depending on how Spicetify mounts custom apps (full unmount vs. CSS hide), this may or may not be visible. Live verification was deferred.

---

### RISK-3: `triggerLoad` issues a host call from any state — only `retry` is state-gated

**Type**: DEFENSE-IN-DEPTH / FR-012 INVARIANT
**Severity**: LOW
**Location**: `src/store/playlists-store.ts:110-113`
**Evidence**:
- `triggerLoad` calls `transition(get().loadState, { type: 'trigger' })` then unconditionally awaits `runLoad()`. The FSM ignores `trigger` from non-`idle` states, but the loader is called regardless.
- `retry` (line 114–119) is explicitly gated: `if (before.kind !== 'failed') return;`.
- `test/store/playlists-store.test.ts:240-280` covers `retry from idle/loaded/empty` no-ops but has no symmetric test for `triggerLoad` from non-`idle`.

**Analysis**: Today, the only caller of `triggerLoad` is `IdleView`, which is rendered only when `loadState.kind === 'idle'` by `DedupPage`. FR-012 (*"Once the load trigger is activated, the page MUST transition away from the idle state and the trigger affordance MUST cease to be available; the only way to initiate another fetch in this iteration is via the failure-state retry affordance"*) is therefore satisfied **as long as the UI gating holds**. A future contributor exposing a "Reload" button without re-checking the FSM would silently break the invariant — the store would happily issue a fresh `loader.load()`. Gating `triggerLoad` on `kind === 'idle'` (symmetric with `retry`'s gate) would make the FSM enforce FR-012 by construction.

---

### RISK-4: `looksLikeAuthExpired` is empirical pattern-matching that may not fire on real host signals

**Type**: ERROR-PATH FRAGILITY
**Severity**: LOW
**Location**: `src/adapters/spicetify-playlists-loader.ts:272-299`
**Evidence**:
- The function checks `status === 401`, `'401' in message`, and `('token' && ('expired' || 'invalid'))` in message.
- JSDoc explicitly admits: *"This branch may be unreachable in practice if the client refreshes tokens before the call surfaces. The contract suite stubs an error shaped to satisfy this predicate so the branch is unit-test-covered regardless."*
- WP05 review approval acknowledged: *"the empirical detector may need refinement once a real auth-expiry signal is observed in the live client."*

**Analysis**: The branch is covered by stubbed tests but the predicate was authored without a real auth-expired payload to model against. If the actual signal differs (e.g., a custom error class with a code property), all auth-expired rejections will be classified as `rootlist-fetch-failed` instead. The `FailedView` lookup still has a clear message, so the user is not stranded — but the more-specific "your session expired, sign in again" copy is unreachable. This is a known-soft area, documented as deferred. Worth a follow-up task to capture a real signal.

---

### RISK-5: Mission DoD's live-client verification (WP09 T038) was deferred at WP09 review and merged without artefact confirmation

**Type**: PROCESS GAP / UNVERIFIED RELEASE CRITERION
**Severity**: MEDIUM
**Location**: WP09 approval event 2026-06-03T12:19:14 — *"Live verification deferred to user/reviewer per WP risks section — four-assertion DevTools script must run before mission accept/merge."*; mission `accept_commit: 490b193` at 2026-06-03T13:53:48.
**Evidence**: `tasks.md` §"Definition of Done (mission-level)" lists *"Live verification in a running Spotify client (see WP09 T038)"*. No artefact in the mission directory records the four assertions (zero pre-trigger fetches in DevTools Network, happy path, failure path, retry) running against a live client. Mission acceptance recorded only `accepted_by: alex`, `acceptance_mode: pr`; no live-verification evidence captured.

**Analysis**: The mission was accepted ~94 minutes after WP09's `for_review` review approval. The reviewer flagged the deferral explicitly; the acceptor (the user) did not document satisfying it. Several other findings here (RISK-1 broken mosaic covers, RISK-2 navigate-away, DRIFT-1 playlist-v2) are exactly the class of finding the live verification was supposed to catch. The deferral is the most consequential process gap of this mission.

---

## Silent Failure Candidates

| Location | Condition | Silent result | Spec impact |
|----------|-----------|---------------|-------------|
| `src/adapters/spicetify-playlists-loader.ts:124-147` (`walkItems`) | Rootlist node has `type` other than `'folder'` or `'playlist'` | Item is dropped without throwing | SC-1 (no silent truncation): a `playlist-v2` would be dropped — see [DRIFT-1] |
| `src/adapters/spicetify-playlists-loader.ts:232-238` (`firstImageUrl`) | `images[0].url` is a non-`https` string (e.g. `spotify:mosaic:`) | Returned verbatim | FR-005 / SC-3: passed through to `<img src>`, browser fails to render — see [RISK-1] |
| `src/store/playlists-store.ts:110-113` (`triggerLoad`) | Called from a non-`idle` state | FSM ignores the action, but `runLoad()` still hits the loader | FR-012: the invariant is upheld only by UI gating, not by the store; see [RISK-3] |
| `src/ui/FailedView.tsx:50` | `loadState.kind !== 'failed'` | Component renders `null` | Defensive against router bugs; benign |
| `src/ui/LoadedView.tsx:32` | `loadState.kind !== 'loaded'` | Component renders `null` | Defensive; benign |

---

## Security Notes

The mission is a read-only browser-context extension running inside the Spotify desktop client. There is no CLI input, no file I/O, no subprocess execution, no SQL, no direct HTTP. The full attack surface is the `globalThis.Spicetify` object the host injects.

| Finding | Location | Risk class | Recommendation |
|---------|----------|------------|----------------|
| **Read-only invariant explicitly verified** | `test/ports/playlists-loader-contract.test.ts` (mutation API stubs assert zero calls); WP05 review approval also calls this out | NONE | — |
| **Host availability checks before access** | `src/adapters/spicetify-playlists-loader.ts:53-82` — `requirePlatform` validates `Spicetify`, `Platform`, `RootlistAPI`, `LibraryAPI` before use | NONE | — |
| **No credential handling** | adapter has no `token`/`secret`/`password` references; the host owns auth | NONE | — |
| **No XSS risk from list data** | `PlaylistRow` and `LikedSongsRow` only emit text via JSX children — no `dangerouslySetInnerHTML`; raw values flow through React's escaping | NONE | — |
| **Image src is data-controlled but not user-controlled** | `<img src={row.imageUrl}>` — the source is the host's response, not user input. The `spotify:mosaic:` URI does not run code; browsers reject the protocol for `<img>`. | NONE | — |
| **No subprocess/shell** | repo grep confirms no `child_process`, `exec`, `spawn`, `shell` in `src/` | NONE | — |

Security score: **clean for this mission's scope**. The dedup write paths (per spec roadmap) will introduce the meaningful attack surface; this iteration does not.

---

## Final Verdict

**PASS WITH NOTES**

### Verdict rationale

All 12 FRs are implemented, the FSM is exhaustively tested, the hexagonal architecture is enforced by an import-graph test, and the production adapter — modulo two surfacing issues — correctly normalises host shapes behind the port. 358 tests pass with 100 % coverage on all axes and `tsc --noEmit` is clean. No locked decision (D-1 hexagonal / D-2 Platform APIs / D-3 Zustand) was violated; no Non-Goal was invaded. The deferred live-client verification (RISK-5), however, is structural and is the root cause of three of the four substantive findings — DRIFT-1 (`playlist-v2` silently dropped), RISK-1 (`spotify:mosaic:` broken images), and RISK-2 (navigate-away edge case) would have been visible the first time the page met a real library.

I am rendering **PASS WITH NOTES** (rather than FAIL) on a narrow read: this mission was scoped as the *foundation* for later iterations, the merge target is the feature branch `get_library` (not `main`), all 358 tests pass, and every issue surfaced has a small, well-located fix. **If the user intends to surface this iteration to end-users before patching RISK-1 and DRIFT-1, that read does not hold and the verdict should be re-stated as FAIL** — every user-owned playlist with a default mosaic cover renders a broken image, and any rootlist node typed `playlist-v2` disappears without a trace.

### Blocking findings (must address before the next iteration ships to users)

- **RISK-1** — `spotify:mosaic:` URIs reach `<img src>`. Adapter or UI must convert them to the placeholder branch.
- **DRIFT-1** — adapter must accept rootlist nodes with `type === 'playlist-v2'`, or the data model must be amended to declare only `'playlist'` is supported (with a recorded rationale for the divergence).

### Non-blocking notes (worth a follow-up task)

- **RISK-2** — implement a navigate-away reset (e.g. `useEffect` in `DedupPage` to call a store `reset` action on unmount when state is `loading`).
- **RISK-3** — gate `triggerLoad` on `kind === 'idle'` to make FR-012 self-enforcing in the store.
- **RISK-4** — capture a real auth-expired signal and refine `looksLikeAuthExpired` once a live sample is available.
- **RISK-5 / process** — record the four-assertion live verification (Network panel observation of zero pre-trigger fetches, happy path, forced-failure path, retry) in the mission directory before claiming the mission DoD is met.

### Open items

- The `playlists-store.ts` store file does not export a `reset` action; both RISK-2 and a future "Refresh" feature need one. Consider adding it as part of the RISK-2 fix.
- The `walkItems` recursion is synchronous over the full rootlist. At the documented NFR-002 ceiling of 1 000 playlists, this is not a problem, but if a later iteration extends the bound, the implementation should yield to the event loop between batches.
