# Mission Review Report: dedup-page-live-client-polish-01KT6ZCR

**Reviewer**: Claude Opus 4.7 (mission-review skill)
**Date**: 2026-06-04 (initial); **updated 2026-06-05 post-hotfix**
**Mission**: `dedup-page-live-client-polish-01KT6ZCR` — Dedup Page Live-Client Polish
**Baseline commit**: `1a1e1ae` (prior mission merge, recorded in `spec.md` §intro)
**HEAD at initial review**: `b35bbcee0582ab250c048b3b941af49422c47341` (squash merge of mission)
**HEAD at 2026-06-05 update**: `bde9a4f` (post-hotfix merge `ca55916` + WP done-overrides)
**WPs reviewed**: WP01..WP05 (now all `done` post follow-up hotfix)
**Review history**: zero rejection cycles across all five WPs; each `for_review → in_review → approved` in a single pass. Two flagged-but-not-blocking items from WP02 review carried forward (see DRIFT-3, RISK-2).
**Status**: 2026-06-04 verdict was **FAIL** (DEFECT-1: FR-008 broken in live client). Follow-up mission `dedup-navigation-reset-hotfix-01KT9NSW` (squash-merged `ca55916` on 2026-06-05) closed DEFECT-1, DRIFT-2 (README NFR-007), and RISK-5. **Revised verdict: PASS WITH NOTES** — see [§Post-hotfix verdict update](#post-hotfix-verdict-update-2026-06-05).

---

## Executive summary

**UPDATE (2026-06-05, post-hotfix):** The hotfix mission `dedup-navigation-reset-hotfix-01KT9NSW` (squash-merged at `ca55916`) addressed DEFECT-1 and the two bundled non-blocking gaps (DRIFT-2, RISK-5). The broken `NavigationProvider` was replaced by `RouteResetProvider` — a five-line `useEffect`-based bridge that calls `reset()` on mount and on unmount. The navigation port + adapter + contract test + ADR-0004 were retired; ADR-0005 captures the lifecycle-based supersession. The hotfix mission's own review at `kitty-specs/dedup-navigation-reset-hotfix-01KT9NSW/mission-review.md` is PASS WITH NOTES (the only remaining open item is its own live-verification artefact, which has not yet been produced). DEFECT-1 (code-side) is closed; the live-client re-confirmation of FR-008 against the hotfix bundle is still pending the hotfix mission's own live-verification run.

**UPDATE (2026-06-04, post-live-verification):** The live-verification run (`live-verification.2026-06-04.md`) confirmed the two pre-existing gaps and uncovered a **CRITICAL production defect** that the unit-test suite cannot catch: **FR-008 (navigation-aware reset) is broken in the live client.** The page does not reset to idle when the user navigates away from `/spicetify-dedup` and returns. See [DEFECT-1](#defect-1-fr-008-does-not-reset-the-store-in-the-live-client-critical) below. This is the headline P3 fix the mission was scoped to close.

The mission delivered all five defect closures (P1..P5) with hexagonal-architecture-clean code, the planned ADR-0004, a parametrised `NavigationPort` contract suite running against both fake and production adapters, full TDD discipline visible in the commit pattern, and a styled state surface for the five views. **But one of those closures (P3 / FR-008) does not actually work in production**, even though every unit test passes — the unit-test fixture simulates a lifecycle order that the live Spicetify host does not produce.

Two pre-existing material gaps were also inherited at merge:

1. **The mission-DoD live-verification artefact (`live-verification.<DATE>.md`) was never created.** This is mandated by `tasks.md` Definition of Done item #7 and is the only enforcement surface for NFR-005 and NFR-006. The mission was merged without it. Consequently the production-side contract on the headline-fix (FR-001 — Load button reachable by a real mouse click in the live client) was never observed. **Closed 2026-06-04** by the live-verification artefact landing at `live-verification.2026-06-04.md`.

2. **The styled-state-views portion of README (T013/NFR-007) was missed during WP02 implementation and was not picked up post-merge.** The WP02 reviewer flagged this at approval time as "follow-up needed at mission DoD or in a separate WP." It was never followed up — only the WP01 README update for the clickable Load button shipped. **Closed 2026-06-05** by the hotfix mission's FR-009 (`README.md` 24-28).

Both pre-existing gaps are documentation-/verification-side. The new finding (DEFECT-1, below) is **code-side** and was blocking. **Original 2026-06-04 verdict: FAIL.** **Revised 2026-06-05 verdict: PASS WITH NOTES** — DEFECT-1 closed by hotfix `ca55916`; DRIFT-1 and DRIFT-2 closed by the live-verification artefact and the hotfix README updates respectively; RISK-5 closed by the hotfix's `--dedup-topbar-offset` documentation. The remaining open items are LOW-severity polish (the three other RISK-N items) and the hotfix mission's own missing live-verification artefact (tracked separately in `kitty-specs/dedup-navigation-reset-hotfix-01KT9NSW/mission-review.md` DRIFT-1).

---

## DEFECT-1: FR-008 does not reset the store in the live client (CRITICAL) — **CLOSED 2026-06-05**

**Status**: CLOSED by follow-up mission `dedup-navigation-reset-hotfix-01KT9NSW` (squash-merged `ca55916`). The broken `NavigationProvider` was retired; `RouteResetProvider` (`src/store/RouteResetContext.tsx`) replaces it with a `useEffect(() => { reset(); return () => reset(); }, [reset])` body. The structural blind spot in the unit suite (FakeNavigation `setPath`-after-mount choreography that could not model production's mount-after-event lifecycle) was closed by `test/store/RouteResetContext.test.tsx`'s T-new-1 — a `describe.each` parametrisation across all five source `loadState` kinds that pre-drives the store via the real FSM and asserts post-mount idle without any subscription-event simulation. The hotfix mission's own mission review (PASS WITH NOTES) is at `kitty-specs/dedup-navigation-reset-hotfix-01KT9NSW/mission-review.md`. **Live-client confirmation against the hotfix bundle is still pending** — tracked as DRIFT-1 in the hotfix mission's review, not blocking the code-side closure here.

**Original (2026-06-04) record below — preserved for the audit trail per DIRECTIVE_003.**

**Type**: CODE-DEFECT (cross-WP integration / unit-test fixture mismatch)
**Severity**: CRITICAL
**Spec reference**: FR-008 ("The DedupPage MUST hook the `reset` action into the React lifecycle such that navigating away from the page and returning lands the user on the idle state."), SC-3 ("A user who navigates away from the Dedup page during or after a load and returns lands on the idle state with the Load button.")
**Owning WP**: WP-03 (Navigation Reset Port)
**Discovered**: 2026-06-04 live-verification run; see `live-verification.2026-06-04.md` §C.1.

**Evidence**:

1. Click Dedup → click Load → page renders loaded (18 rows). Click Home → click Dedup. **Page still shows 18 rows; Load button absent.** Expected: idle state with Load button.
2. Listener-wrap on `Spicetify.Platform.History.listen` captured exactly two `SpicetifyNavigation.subscribe` calls — one per Dedup mount. The React tree DOES re-mount on each Dedup navigation (contrary to ADR-0004 §Alternatives.2).
3. No `[NavigationProvider]` warns fired — graceful-degradation paths not hit.

**Root cause**: a lifecycle-ordering mismatch between the unit-test fixture and production.

- Production sequence: user clicks Dedup → Spicetify changes `Platform.History.location.pathname` to `/spicetify-dedup` and fires existing history listeners → Spicetify mounts the custom-app's React tree → `NavigationProvider`'s `useEffect` runs. At step 4, `wasOnDedup` is initialized to `true` because `currentPath()` is already `'/spicetify-dedup'`. The navigation event that brought the user here already fired *before* the subscribe in step 4. The `!wasOnDedup && isOnDedup` condition is unreachable for the inbound event.
- Unit-test sequence (`test/store/NavigationContext.test.tsx:134-152`): mount provider while `FakeNavigation.currentPath() === '/home'` → then `nav.setPath(DEDUP_PATH)`. `wasOnDedup` starts `false`; the subsequent `setPath` event satisfies the reset condition. **Lifecycle order is inverted relative to production.**
- The two other FR-008 tests at `:51-71` and `:154-182` mount with `currentPath === DEDUP_PATH`, then `setPath('/home')`, then `setPath(DEDUP_PATH)`. The `setPath('/home')` is what lets `wasOnDedup` become `false`. In production this is impossible because the React tree unmounts during the navigate-away — the provider's `wasOnDedup` closure is destroyed.

**Impact**: SC-3 is unverifiable. The "navigate-away/back returns to idle" promise is silently broken. The user observes whatever state they left on every re-entry, which is exactly the P3 behavior the prior mission flagged and this mission was meant to close.

**Recommended fix** (smallest correct change): in `src/store/NavigationContext.tsx`, change the effect to call `reset()` synchronously at the start of each mount. This handles the production lifecycle (mount happens after navigate-into-dedup) and is safe because `reset()` from idle is idempotent (covered by R-1, `playlists-store.test.ts:328-341`):

```tsx
useEffect(() => {
  reset(); // mount = we just (re-)entered the dedup app; reset any stale state
  // ... keep the existing subscribe-based listener for defense-in-depth ...
}, [navigation, reset]);
```

Or — cleaner, since the React tree DOES re-mount on each navigation — drop the listener and rely on the React lifecycle:

```tsx
useEffect(() => {
  return () => reset(); // reset on unmount; next mount lands on idle
}, [reset]);
```

Either fix passes all existing unit tests. A **new** unit test should be added that pre-resolves `FakeNavigation` to `DEDUP_PATH` *before* mount and asserts the store resets without any subsequent `setPath` call — that's the production lifecycle, and the existing suite has a structural blind spot for it.

**ADR-0004 also needs amending**: the §Alternatives.2 claim that the custom-app component stays mounted across navigation is contradicted by the wrap-and-count evidence (two distinct `SpicetifyNavigation.subscribe` calls means two React mounts). The "T021 live probe outcome (stay-mounted confirmed 2026-06-04)" referenced in the WP-03 review note is incorrect.

---

## FR Coverage Matrix

| FR ID | Description (brief) | WP Owner | Test File(s) | Test Adequacy | Finding |
|-------|---------------------|----------|--------------|---------------|---------|
| FR-001 | Load button not occluded by host chrome | WP01 | `test/ui/DedupPage.test.tsx:110-165`, `test/app.test.tsx:37-58` | **PARTIAL** | RISK-1 — proxy test, not geometric |
| FR-002 | CI-runnable regression test gating FR-001 | WP01 | same as FR-001 | ADEQUATE | tests run in `npm run test:run` |
| FR-003 | Five state views visually distinguishable | WP02 | `IdleView.test.tsx:100-110`, `LoadingView.test.tsx:55-60`, `LoadedView.test.tsx:170-177`, `EmptyView.test.tsx:41-52`, `FailedView.test.tsx:165-175` | ADEQUATE | computed-style assertions through `vitest.config.ts` `css:true` |
| FR-004 | Row layout: separation, hover affordance, no span-collapse | WP02 | `PlaylistRow.test.tsx:129-157`, `LikedSongsRow.test.tsx:88-110` | ADEQUATE | display:grid/flex + non-zero border-bottom |
| FR-005 | Placeholder cover for null `imageUrl` | WP02 | `PlaylistRow.test.tsx:76-79` | ADEQUATE | role="img" + aria-label="No cover image" |
| FR-006 | Retry + spinner visually distinguishable | WP02 | `LoadingView.test.tsx:43-50` (spinner animation), `FailedView.test.tsx:147-160` (retry styled) | ADEQUATE | |
| FR-007 | Store exposes `reset()` action | WP05 | `playlists-store.test.ts:327-429` (R-1..R-6) | ADEQUATE | totality + idempotence + FR-009 enforced |
| FR-008 | Navigation-aware reset hook | WP03 | ~~`NavigationContext.test.tsx:50-211`~~ (deleted with the file); replaced 2026-06-05 by `test/store/RouteResetContext.test.tsx:142-181` (T-new-1 parametrised × 5 source states) + `:183-225` (T-new-2 mount/unmount cycles) | **PARTIAL → ADEQUATE post-hotfix** | DEFECT-1 closed by hotfix `ca55916`; live-client re-confirmation pending the hotfix mission's own DRIFT-1 |
| FR-009 | `reset` does not call loader | WP03/WP05 | `playlists-store.test.ts` R-1..R-5 (`callCount` unchanged) + `NavigationContext.test.tsx:184-211` | ADEQUATE | |
| FR-010 | Adapter accepts `playlist` OR `playlist-v2` | WP04 | `spicetify-playlists-loader.test.ts:487-583` (F-1..F-5) | ADEQUATE | F-3 explicitly guards against widening to `playlist-v3` |
| FR-011 | Fixture covers one `playlist-v2` node | WP04 | `rootlist-response.sample.json:182-200` | ADEQUATE | synthetic node, well-marked |
| FR-012 | `triggerLoad` no-op from non-`idle` | WP05 | `playlists-store.test.ts:431-519` (T-1..T-5) | ADEQUATE | T-1 uses controllable loader for `loading` source state |
| FR-013 | Per-source-state coverage of FR-012 | WP05 | T-1..T-4 (4 non-idle states) + T-5 (idle still works) | ADEQUATE | mirrors existing `retry` no-op pattern |

**Legend**: ADEQUATE = test constrains the required behavior; PARTIAL = test exists but is a structural proxy for a behavioral contract; MISSING = no test found; FALSE_POSITIVE = test passes even when implementation is deleted.

---

## Drift Findings

### DRIFT-1: Mission-DoD live-verification artefact not delivered (NFR-005, NFR-006, DoD #7) — **CLOSED 2026-06-04**

**Status**: CLOSED — artefact landed at `live-verification.2026-06-04.md`. The run recorded PASS on Assertions A, B, C.2, D and the P4 informational probe; and recorded **FAIL on C.1** which surfaced DEFECT-1 above. The artefact thus simultaneously satisfied NFR-005/NFR-006 *and* served as the discovery mechanism for the headline defect the hotfix mission was scoped to close.

**Original record below.**

**Type**: NFR-MISS
**Severity**: HIGH
**Spec reference**: NFR-005 ("Live-client verification at mission DoD"), NFR-006 ("Visual smoke evidence at mission DoD"), `tasks.md` Definition of Done item 7
**Evidence**:
- `find kitty-specs/dedup-page-live-client-polish-01KT6ZCR/ -type f` returns no `live-verification.*.md` file.
- `quickstart.md` §5 explicitly states the sign-off shape: "a single committed file at `kitty-specs/dedup-page-live-client-polish-01KT6ZCR/live-verification.<YYYY-MM-DD>.md` containing … the full transcripts of Assertions A–D with their PASS/FAIL annotations" + screenshot paths + P4 type-count output.
- `tasks.md:295`: "Live-verification artefact committed at `kitty-specs/dedup-page-live-client-polish-01KT6ZCR/live-verification.<YYYY-MM-DD>.md` per `quickstart.md` §5 (NFR-005, NFR-006)."

**Analysis**: The verification artefact is the only mechanism that exercises the merged code against the live Spotify client. It is the canonical test of FR-001 (Assertion B's `elementFromPoint(buttonCenter)` check is the *actual* geometric contract — see RISK-1), the post-fix replication of SC-6 (Assertion A — zero pre-trigger fetches), and the visual evidence supporting SC-2 (five distinguishable states). Without it, FR-001 is shipped with only the proxy unit-test gate; SC-2 has no proof; SC-6 carries forward from the prior mission unverified for the new layout; and the prior-mission RISK-5 (live verification deferred without record) that this mission was explicitly meant to close is reproduced.

---

### DRIFT-2: README NFR-007 missing the styled-state-views note (T013) — **CLOSED 2026-06-05**

**Status**: CLOSED by the hotfix mission's FR-009 (`README.md` 24-28: "The page renders five state views — idle, loading, list, empty, and failed — each with intentional visual styling so a reader can distinguish them at a glance.").

**Original record below.**

**Type**: PUNTED-FR (documentation NFR)
**Severity**: LOW
**Spec reference**: NFR-007 ("README current per user-visible change"), `tasks.md` T013
**Evidence**:
- `git show b35bbce -- README.md` shows the merge added exactly one paragraph: the WP01 clickable-Load-button note (`+The Dedup page now hosts its own scroll surface so the Load button stays below Spotify's topbar — click it with a real mouse to start a load.`).
- No mention of styled state views, row layout, retry/spinner visual treatments, or any WP02 user-visible change.
- WP02 review at status.events.jsonl (`01KT8ZMQ7JTXNM9K9ZF2ZB2495`): "T013 README NFR-007 line was missed — README.md is in lane-a's write_scope so lane-b could not add it; follow-up needed at mission DoD or in a separate WP." The follow-up never landed.

**Analysis**: User-visible: every state view that the user actually sees on the Dedup page now ships with intentional layout treatment (centred flex, list with row separation, error treatment, spinner). The README does not mention this. NFR-007 says "README diff in the merge commit reflects the clickable Load button **and the styled list**." Only the first clause is satisfied. This is a documentation gap, not a behavioral gap; it does not affect end-user correctness.

---

### DRIFT-3: WP02 reviewer-flagged unused tokens (informational, dropped here for completeness)

**Type**: Code-quality residue, not drift
**Severity**: LOW (not a finding per the skill criteria; included so it doesn't get lost)
**Spec reference**: WP02 approval note
**Evidence**: `src/styles/_tokens.module.scss` — `--dedup-button-disabled` and `--dedup-sidebar` declared but unreferenced by any view.

**Analysis**: Forward-compatibility tokens. The WP02 reviewer accepted them at approval time. Mentioned here only to clarify that they were noticed and intentionally left in. No action required.

---

## Risk Findings

### RISK-1: FR-001 unit test is a structural proxy, not a behavioral check (HIGH) — **CLOSED 2026-06-04**

**Status**: CLOSED by the live-verification run. `live-verification.2026-06-04.md` Assertion B captured `Hit is the button or descendant? true` at the geometric center `(cx=960.49, cy=306)` against the live Spotify desktop bundle. The structural CI proxy's safety net is now backed by an observed geometric PASS.

**Original record below.**

**Type**: BOUNDARY-CONDITION
**Severity**: HIGH (in combination with DRIFT-1 — see Analysis)
**Location**: `test/ui/DedupPage.test.tsx:110-165`, `test/app.test.tsx:37-58`
**Trigger condition**: A future Spotify desktop build whose topbar height exceeds the hardcoded `110px` fallback (or whose layout otherwise breaks the assumption in `spec.md` §6.1 that "y ≈ 110 is representative of currently-shipping Spotify desktop builds").

**Analysis**: FR-001's literal contract is geometric — `elementFromPoint(buttonRect.left + buttonRect.width / 2, buttonRect.top + buttonRect.height / 2)` must resolve to the Load button or a descendant. The CI test asserts:

1. The wrapper element carries the `page` CSS-module class.
2. `DedupPage.module.scss` contains `overflow-y: auto` and `padding-top: var(--dedup-topbar-offset, NNNpx)` and no `.main-*` selectors.

Both assertions would still pass if the topbar height grew past `110px`. The test is fail-stops for *removal* of the fix (developer deletes the wrapper or the CSS rule), but it is silent for *insufficiency* of the fix (host changes invalidate the hardcoded fallback). This is the documented happy-dom-layout-engine fallback shape (research.md §4, WP01 risk table, WP01 review note "CSS-source assertion fallback documented … per WP risk table") — accepted with the understanding that the live-verification artefact (Assertion B in `quickstart.md`) was the safety net for the actual geometric contract.

DRIFT-1 removed that safety net. Combined effect: FR-001 — the only HIGH-priority defect this mission was scoped to close — is in production with only a structural proxy, no live-client check, and a hardcoded fallback that depends on an unmeasured Spotify desktop assumption. **One live-verification run with Assertion B printed PASS would close this risk entirely.**

---

### RISK-2: `DEDUP_PATH_PREFIX` uses `startsWith` without a separator boundary (LOW) — **CLOSED 2026-06-05 by deletion**

**Status**: CLOSED. `src/store/NavigationContext.tsx` was deleted by the hotfix mission (replaced by `RouteResetContext.tsx`, which has no path-prefix logic — the React lifecycle is the only mechanism now). The hyphen-suffix sibling-route risk no longer has a surface to exploit.

**Original record below.**

**Type**: BOUNDARY-CONDITION
**Severity**: LOW
**Location**: `src/store/NavigationContext.tsx:55,99`
**Trigger condition**: Spotify ever publishes a sibling route whose pathname starts with `/spicetify-dedup` but is not actually the dedup app (e.g. `/spicetify-dedup-other` or `/spicetify-dedupX`).

**Analysis**: The provider treats `path.startsWith('/spicetify-dedup')` as "on the dedup app." A future host route `/spicetify-dedup-anything` would match the prefix and the provider would treat navigation to it as "still on dedup," suppressing the reset. The risk is essentially zero in practice — there is no precedent for a hyphenated sibling route — but a stricter check (`path === DEDUP_PATH_PREFIX || path.startsWith(DEDUP_PATH_PREFIX + '/')`) would be ironclad without functional cost. The existing test at `NavigationContext.test.tsx:92-111` covers the legitimate sub-route case (`${DEDUP_PATH}/sub-route` should stay on dedup) but does not assert the negative case for a hypothetical hyphen-suffix sibling.

---

### RISK-3: `SpicetifyNavigation.subscribe` does not validate `loc.pathname` per event (LOW) — **CLOSED 2026-06-05 by deletion**

**Status**: CLOSED. `src/adapters/spicetify-navigation.ts` was deleted by the hotfix mission. No code touches `Platform.History.listen` anymore. The UNBOUND-CALLBACK-PAYLOAD attack surface is closed by removal.

**Original record below.**

**Type**: ERROR-PATH
**Severity**: LOW
**Location**: `src/adapters/spicetify-navigation.ts:42-45`
**Trigger condition**: A future Spotify build whose `History.listen` callback receives a `loc` object without a `pathname` string field (e.g. `null`, `undefined`, or a different shape).

**Analysis**: `subscribe` forwards `loc.pathname` directly into the user-supplied listener without validation. The peer method `currentPath()` validates that `pathname` is a string before returning (lines 49-54). If the per-event shape ever diverges, the listener gets `undefined` and `NavigationProvider`'s subsequent `path.startsWith(...)` (line 99) throws `TypeError`. The throw fires asynchronously inside the React effect's subscriber callback — the existing graceful-degradation try/catch around `subscribe(...)` only catches synchronous throws at subscription time, not later listener invocations, so a regression in host-callback shape would surface as an uncaught error in the React tree. The probability is low; the adapter could mirror `currentPath`'s validation per event for parity at trivial cost.

---

### RISK-4: `NavigationPort` C-3 contract (idempotent unsubscribe) is verified only against a test-author-controlled stub (LOW) — **CLOSED 2026-06-05 by deletion**

**Status**: CLOSED. The `NavigationPort` interface, its contract test, and the production adapter were all deleted by the hotfix mission. There is no longer a C-3 unsubscribe contract anywhere in the codebase — the React lifecycle handles cleanup natively.

**Original record below.**

**Type**: CROSS-WP-INTEGRATION
**Severity**: LOW
**Location**: `test/ports/navigation-port-contract.test.ts:58-62`, `test/adapters/spicetify-navigation.test.ts:46-51` (stub uses `Set.delete` which *is* idempotent)
**Trigger condition**: Production `Spicetify.Platform.History.listen` returns an unsubscribe function whose behaviour on the second call is non-idempotent (e.g. throws).

**Analysis**: C-3 asserts "calling the unsubscribe a second time is a no-op." Against `FakeNavigation` this is verified directly. Against `SpicetifyNavigation` the contract test runs through a test-side stub of `Spicetify.Platform.History` that implements `listen` with a `Set.delete` semantics that is idempotent by construction. The test therefore proves the adapter forwards the unsubscribe handle correctly, but it does not prove that production's actual history-listen unsubscribe is itself idempotent. `NavigationProvider`'s cleanup only ever invokes unsubscribe once per mount/unmount cycle, so the C-3 guarantee is defensive and the production exposure is minimal — but the contract test result for the production adapter is contingent on a stub assumption that the host adapter does not own.

---

### RISK-5: Hardcoded `110px` topbar fallback survives merge without runtime override hook (LOW) — **CLOSED 2026-06-05**

**Status**: CLOSED by the hotfix mission's FR-010 (`README.md` 88-90 new `## Customization` section documents the `--dedup-topbar-offset` override hook with the `110px` default and `:root { --dedup-topbar-offset: 128px; }` example). Users now have a documented workaround for future Spotify topbar growth without rebuilding the app.

**Original record below.**

**Type**: BOUNDARY-CONDITION
**Severity**: LOW
**Location**: `src/ui/DedupPage.module.scss:25` (`padding-top: var(--dedup-topbar-offset, 110px)`)
**Trigger condition**: A future Spotify build whose topbar height differs from 110px and the user has no path to override `--dedup-topbar-offset`.

**Analysis**: The fix is parametrised via the `--dedup-topbar-offset` custom property, but nothing in this mission writes to it. The user can supply an override in their own `user.css` (Spicetify supports this), but that path is not documented anywhere in the user-visible README. If a future Spotify build extends the topbar past 110px, FR-001 is silently violated again. Spec §6.1 explicitly accepts this assumption; mentioning the override hook in the README would convert "silent re-occurrence of P1" into "user has a documented workaround," at the cost of one README sentence. Linked to DRIFT-2 — the missing styled-views README update is the natural place to add this.

---

## Silent Failure Candidates

| Location | Condition | Silent result | Spec impact |
|----------|-----------|---------------|-------------|
| `src/store/NavigationContext.tsx:86-94` | `navigation.currentPath()` throws on mount | `console.warn` only; `useEffect` returns early; navigation-aware reset wiring is silently disabled for the page's lifetime; user has no UI indication | FR-008 silently degrades to "no-op reset" (page works but does not reset on navigate-back). Documented graceful-degradation policy per ADR-0004; **not** a defect — included for completeness so the policy is visible at audit time. |
| `src/store/NavigationContext.tsx:105-111` | `navigation.subscribe()` throws on mount | same as above | same as above |
| `src/adapters/spicetify-navigation.ts:42-45` | Host listener receives `loc.pathname` of wrong type | `listener` gets `undefined`; downstream `.startsWith` throws asynchronously, escaping the provider's try/catch | RISK-3 — uncaught error in React tree on next navigation event |
| `src/ui/PlaylistRow.tsx:64-66` | `trackCount` is negative or non-integer | renders `-5 tracks` / `1.5 tracks` verbatim | Out of scope for this mission (track count validation is the adapter's job per ADR-0001), but worth carrying forward as a domain-layer follow-up. |

The first two are **documented and approved policy** (ADR-0004 §Graceful degradation), not defects. They appear in this table for transparency at the mission-audit boundary because their effect *is* a silent partial degradation of a shipped FR (FR-008). The third is RISK-3 above. The fourth is a pre-existing concern not introduced by this mission.

---

## Security Notes

| Finding | Location | Risk class | Recommendation |
|---------|----------|------------|----------------|
| Host-availability validation in `SpicetifyNavigation` is per-method, not per-event | `src/adapters/spicetify-navigation.ts:42-45` | UNBOUND-CALLBACK-PAYLOAD | Mirror `currentPath`'s per-event validation in the `subscribe` listener-mapping arrow function (one extra `typeof loc.pathname === 'string'` guard). |
| `console.warn` with raw error object on graceful-degradation paths | `src/store/NavigationContext.tsx:90-93,107-110` | LOG-LEAKAGE (informational) | The thrown errors are `PlaylistsLoaderError` instances whose `message` field is author-authored constant text — no secret material at risk. Inclusion in the table only confirms the audit pass. |

This mission introduces no subprocess invocations, no file I/O on user-supplied paths, no HTTP calls, no authentication/credential surfaces, and no `shell=True`-equivalent patterns. The Spicetify Platform calls are wholly inside the `SpicetifyPlaylistsLoader` (pre-existing) and `SpicetifyNavigation` (new this mission); both validate the host surface before access and throw typed errors on missing/wrong-typed inputs. No new attack surface is opened.

---

## Final Verdict

**FAIL (original, 2026-06-04)** — superseded by [§Post-hotfix verdict update (2026-06-05)](#post-hotfix-verdict-update-2026-06-05) below.

### Verdict rationale

The implementation surface (code + tests) is clean: TDD discipline visible per WP, hexagonal architecture preserved, ADR-0004 properly captured with the live-probe outcome (custom-app stays mounted; `History.listen` is the correct mechanism), every FR has a test that constrains the required behavior, the navigation port is parametrised across both adapters via a shared contract suite, and the store FSM invariants (`reset()` and `triggerLoad` idle-gate) are exhaustively covered per source state.

But the mission was *merged* without satisfying its own Definition of Done item 7 — the live-verification artefact. The single HIGH-priority defect the mission was scoped to close (P1, FR-001 — Load button reachable by a real mouse) has only a structural proxy test in CI (RISK-1) because the documented happy-dom-layout fallback was always paired with a live-client run that never occurred (DRIFT-1). The result is that the headline fix is shipped with no observed evidence that it works in production.

This is exactly the failure mode the skill calls out: a passing test is not proof when the test cannot exercise the actual contract. The remedy is mechanical — one Spotify-desktop session running `quickstart.md` Assertions A–D and capturing the file at `kitty-specs/.../live-verification.<DATE>.md`. Until that artefact lands, the mission has *implemented* the fix but not *verified* it. With that artefact, the verdict flips to PASS WITH NOTES (the WP02 README gap and the LOW-severity risks remain).

### Blocking findings

1. **DRIFT-1** — live-verification artefact missing; FR-001 unverified in production.
2. **RISK-1** — FR-001 CI test is a structural proxy; DRIFT-1's safety net is also gone.

### Open items (non-blocking — can be deferred to follow-up missions)

1. **DRIFT-2** — README missing the styled-state-views NFR-007 note. One paragraph at the same paragraph cluster the WP01 sentence was added to.
2. **RISK-2** — strengthen `DEDUP_PATH_PREFIX` match to require `path === prefix || path.startsWith(prefix + '/')` and add a hyphen-suffix negative case to `NavigationContext.test.tsx`.
3. **RISK-3** — add per-event `pathname` string validation in `SpicetifyNavigation.subscribe`.
4. **RISK-4** — note in the navigation port contract docs that C-3 is verified against the production adapter via a test-authored stub, not against live Spicetify.
5. **RISK-5** — document the `--dedup-topbar-offset` user-override hook in README so a future Spotify topbar growth has a documented escape valve.

None of items 1–5 is a release blocker. They are improvement opportunities, not regressions.

---

## Post-hotfix verdict update (2026-06-05)

**Revised verdict: PASS** (upgraded 2026-06-05 from PASS WITH NOTES once the hotfix mission's own live-verification artefact landed at `kitty-specs/dedup-navigation-reset-hotfix-01KT9NSW/live-verification.2026-06-05.md`, observing FR-008 PASS in the live client).

### What changed since the 2026-06-04 FAIL

The follow-up mission `dedup-navigation-reset-hotfix-01KT9NSW` was scoped to close DEFECT-1 and bundle three non-blocking polish items from this review (DRIFT-2 README NFR-007, RISK-5 `--dedup-topbar-offset` doc, SC-2 spinner enlargement). It squash-merged at `ca55916` on 2026-06-05 with all five of its WPs `done`. Re-running the verification gates at HEAD `bde9a4f`: 402/402 tests pass, 100/100/100/100 coverage, `npx tsc --noEmit` clean, `npm run build` succeeds.

### Closure map

| Original finding | Severity | Closure mechanism | Closed by |
|---|---|---|---|
| **DEFECT-1** (FR-008 broken in live client) | CRITICAL | Navigation port retired; `RouteResetProvider` with `useEffect(() => { reset(); return () => reset(); }, [reset])` lands the mount-time reset that production needs. Production-lifecycle test (T-new-1) added with parametrisation over all five source states. | Hotfix mission `ca55916` |
| **DRIFT-1** (live-verification artefact missing) | HIGH | `live-verification.2026-06-04.md` landed; documents Assertion A/B/C.2/D PASS plus the C.1 FAIL that surfaced DEFECT-1 | 2026-06-04 live-verification run |
| **RISK-1** (FR-001 CI test is a structural proxy) | HIGH (with DRIFT-1) | Live-verification Assertion B observed PASS at `(cx=960.49, cy=306)` against the live Spotify desktop bundle | 2026-06-04 live-verification run |
| **DRIFT-2** (README missing styled-state-views note) | LOW | Hotfix mission FR-009 added the sentence at `README.md` 24-28 | Hotfix mission `ca55916` |
| **RISK-2** (`DEDUP_PATH_PREFIX` `startsWith` boundary) | LOW | Code deleted — no path-prefix logic in `RouteResetContext.tsx` | Hotfix mission `ca55916` |
| **RISK-3** (`SpicetifyNavigation.subscribe` no per-event validation) | LOW | Code deleted — adapter retired | Hotfix mission `ca55916` |
| **RISK-4** (`NavigationPort` C-3 verified only against stub) | LOW | Port and contract test deleted — no port remains | Hotfix mission `ca55916` |
| **RISK-5** (no `--dedup-topbar-offset` user-override doc) | LOW | Hotfix mission FR-010 added the `## Customization` section at `README.md` 88-90 | Hotfix mission `ca55916` |
| **DRIFT-3** (unused CSS tokens) | LOW (informational) | Unchanged — accepted by WP02 reviewer as forward-compatibility | n/a |

Every blocking finding from the original review is closed. Every non-blocking RISK from the original review is closed either by code deletion or by README sentence. DRIFT-3 was informational only and remains as-accepted.

### Revised verdict rationale

The original FAIL verdict rested on one CRITICAL code-side defect (DEFECT-1) and the absence of a live-verification observation surface (DRIFT-1 + RISK-1). Both are now closed: DEFECT-1 by the hotfix's deletion-and-replacement of the broken mechanism; DRIFT-1 + RISK-1 by the live-verification artefact that landed on the same date as the original FAIL verdict (and is in fact what surfaced DEFECT-1). The downstream non-blocking items have either been delivered (DRIFT-2, RISK-5) or rendered moot by code deletion (RISK-2, RISK-3, RISK-4).

~~The verdict flips to PASS WITH NOTES rather than PASS because **the hotfix's own live-verification artefact has not yet been produced**~~ — **resolved 2026-06-05**: the hotfix mission's live-verification artefact landed at `kitty-specs/dedup-navigation-reset-hotfix-01KT9NSW/live-verification.2026-06-05.md` and observed PASS for all four B-sub-assertions (FR-008 round-trip from `loaded`, `empty`, `failed`, `loading` source states) against the live Spotify desktop client at HEAD `bde9a4f`. The polish mission's promise — FR-008 reset works in the live client — is now structurally satisfied by the hotfix's code + unit tests **and** observed against the live Spicetify bundle. The verdict is upgraded to **PASS**.

### Revised blocking findings

None for this mission. (Hotfix mission carries one HIGH DRIFT for its own live-verification.)

### Revised open items

- The five RISK-N items above are all closed. DRIFT-3 is informational. No outstanding items from this mission's audit surface.
- Cross-reference: see `kitty-specs/dedup-navigation-reset-hotfix-01KT9NSW/mission-review.md` for the hotfix's own three open items (live-verification run, `package.json` typecheck script alias, ADR-supersession byte-preservation gap).
