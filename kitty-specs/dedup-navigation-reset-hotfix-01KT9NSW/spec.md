# Spec: Dedup Navigation Reset Hotfix

**Mission**: `dedup-navigation-reset-hotfix-01KT9NSW`
**Mission ID**: `01KT9NSWY6YKMB66KGXG04ZZ92`
**Mission type**: `software-dev`
**Target merge branch**: `get_library`
**Prior mission**: `dedup-page-live-client-polish-01KT6ZCR` (merged at `b35bbce` on `get_library`)
**Source brief**: `kitty-specs/dedup-page-live-client-polish-01KT6ZCR/mission-review.md` DEFECT-1 + `live-verification.2026-06-04.md` §C.1
**Created**: 2026-06-04

---

## 1. Overview

The previous mission (`dedup-page-live-client-polish-01KT6ZCR`) shipped a `NavigationProvider` that was *supposed* to reset the playlists store to idle whenever the user navigates away from the Dedup page and back. Every unit test passes (against `FakeNavigation`). The live-verification run on 2026-06-04 confirmed it doesn't work: navigate-away-and-back leaves the page on its prior loaded state.

**Root cause** — a structural mismatch between the unit-test fixture and the production lifecycle:

- **In tests**: the provider mounts while `FakeNavigation.currentPath() === '/home'`; then a synthetic `setPath(DEDUP_PATH)` fires. `wasOnDedup` starts `false`; the post-mount event satisfies the `!wasOnDedup && isOnDedup` reset condition.
- **In production**: Spicetify changes `Platform.History.location.pathname` to `/spicetify-dedup` AND fires its history listeners *before* mounting the custom-app React tree. By the time `NavigationProvider`'s `useEffect` runs, `currentPath()` is already `/spicetify-dedup`, so `wasOnDedup` is initialized to `true`. The inbound navigation event happened in the past; the listener never observes it. The reset condition is permanently unreachable.

Additionally, the live-client diagnostic (a wrap+count probe on `Spicetify.Platform.History.listen`) showed the React tree DOES re-mount on each Dedup navigation — two distinct `SpicetifyNavigation.subscribe` calls captured across one navigate-away/back cycle. This contradicts ADR-0004 §Alternatives.2's claim that the custom-app stays mounted across navigation. The ADR's "stays mounted" claim was the rationale for the listener-based design over a simpler `useEffect` cleanup; the claim is incorrect, so the design choice it justified is also incorrect.

This mission replaces the listener with React lifecycle hooks (reset on mount AND on unmount — belt-and-suspenders), retires the now-unused navigation port and adapter, and bundles three non-blocking polish items from the prior mission review.

## 2. User Scenarios & Testing

### Primary user flow — navigation-aware reset

The user is on the Dedup page and has clicked Load. The page renders the list of dedup-eligible playlists. The user clicks Home (or any other Spotify view), then clicks Dedup again from the sidebar. The page lands on the idle state with the Load button visible. The user can click Load again to perform a fresh load.

The same flow holds from any source state — `loaded`, `loading`, `empty`, `failed`. Returning to Dedup from elsewhere always shows idle.

### Empty / failed / loaded distinguishability flow

The user opens the Dedup page and sees the idle state. The user clicks Load. While the load is in flight the page shows the loading state — visibly different from idle. After load completes the page shows one of:

- **loaded**: the styled row list (covered by the prior mission's FR-003/004/005).
- **empty**: a state visibly distinguishable from loading at a single glance (no need to read the copy).
- **failed**: the alert + retry affordance (already verified PASS).

The empty-state and loading-state visual differentiation is the SC-2 polish bundled into this mission.

### Out-of-app developer flow

A future developer who runs the test suite reads through `test/store/NavigationContext.test.tsx`. Among the cases is one that mounts the provider **with the store already in a non-idle state** and **with `FakeNavigation.currentPath()` already on the dedup path**, and asserts the store resets to idle synchronously on mount — no `setPath` call between mount and assertion. This is the production lifecycle; missing this test was the structural blind spot that allowed FR-008 to ship broken.

### Spicetify theme / topbar-height override flow

A user with a Spicetify build whose topbar height differs from the 110px hardcoded fallback reads the README. They see a line documenting that they can override the offset by setting `--dedup-topbar-offset` in their Spicetify `user.css`. They apply the override and the Load button renders below the topbar in their build.

### Edge cases

- **Cold-start mount on `/spicetify-dedup`**: Spotify boots, user immediately navigates to Dedup, page mounts with the store fresh at `{ kind: 'idle' }`. `reset()` is idempotent from idle (R-1 in the prior mission's `playlists-store.test.ts:328-341`); the mount-time reset is a no-op observable side effect.
- **Cold-start mount on `/` (Home)**: Spotify boots on Home, user has not yet navigated to Dedup. NavigationProvider has not mounted yet. The store is at idle anyway. No reset needed.
- **In-place re-render of the Dedup page** (Spotify keeps the tree mounted across some specific navigation pattern that doesn't trigger an unmount): the `useEffect` does not re-fire because its deps are stable. The mount-time reset already ran when the tree first mounted; on this re-render no reset is needed (the page is already in whatever state it was). This is benign — if Spotify ever changes behavior such that the tree stays mounted, the unmount cleanup never fires, but the page also never gets stale state to reset, so there's no defect window.
- **Spotify changes `History.location.pathname` shape**: the new `useEffect` does NOT read `currentPath()`. The fix removes that dependency entirely. ADR-0004's `host-unavailable` graceful-degradation path is no longer needed.

## 3. Requirements

Requirements are testable, status-tracked, and separated by type. Stable IDs (`FR-###`, `NFR-###`, `C-###`) are referenced from the plan and tasks. Status legend: `Proposed` (in this spec, awaiting plan), `Approved` (plan accepted), `Implemented` (WP merged), `Verified` (live-client check passed).

### 3.1 Functional Requirements (`FR-###`)

| ID | Defect / Item | Requirement | Status |
|----|---------------|-------------|--------|
| FR-001 | DEFECT-1 (FR-008 fix) | `NavigationProvider`'s React effect MUST call the playlists store's `reset()` action synchronously at every mount. Idempotent against the store's existing R-1 invariant (reset from idle is a no-op). | Proposed |
| FR-002 | DEFECT-1 (FR-008 fix) | `NavigationProvider`'s React effect MUST schedule an unmount-time cleanup that calls `reset()`. This guarantees that if the React tree is ever kept mounted across navigation (e.g. a future Spicetify change), the navigate-away path still produces a reset. | Proposed |
| FR-003 | DEFECT-1 (FR-008 fix) | The navigate-away/back round-trip MUST land the user on the idle state from any source state (`idle`, `loading`, `loaded`, `empty`, `failed`). | Proposed |
| FR-004 | Test coverage gap | The Vitest suite MUST include at least one test that mounts `NavigationProvider` with the playlists store pre-loaded into a non-idle state AND with no `setPath` call between mount and assertion, and asserts the store transitions to idle synchronously on mount. This is the production lifecycle simulation; its absence in the prior mission's suite is what allowed DEFECT-1 to ship. | Proposed |
| FR-005 | Port/adapter retirement | The unused production navigation port (`src/ports/navigation.ts`), production adapter (`src/adapters/spicetify-navigation.ts`), test fake (`test/adapters/fake-navigation.ts`), contract test (`test/ports/navigation-port-contract.test.ts`), and the production adapter's focused unit test (`test/adapters/spicetify-navigation.test.ts`) MUST be deleted. `src/app.tsx` MUST no longer construct `SpicetifyNavigation` and MUST no longer pass a `navigation` prop to `NavigationProvider`. | Proposed |
| FR-006 | Port/adapter retirement | `NavigationProvider`'s props interface MUST be updated to no longer accept a `navigation` prop (it carries only `children`). The provider's filename and exported symbol MAY be renamed to reflect that it is no longer a port consumer (a plan-phase decision). | Proposed |
| FR-007 | ADR disposition | ADR-0004 (`.claude/adr/0004-navigation-port.md`) MUST be marked `Status: Superseded by ADR-0005` with a one-paragraph addendum explaining the live-client finding that invalidated its rationale (the §Alternatives.2 "stays-mounted" claim was incorrect; production behavior is re-mount-on-navigate, which makes the React lifecycle approach correct and the port indirection unnecessary). | Proposed |
| FR-008 | ADR disposition | A new ADR-0005 (`.claude/adr/0005-react-lifecycle-reset.md`) MUST be authored documenting the React-lifecycle-based reset decision: `useEffect(() => { reset(); return () => reset(); }, [reset])`. The ADR MUST cite the live-verification artefact's diagnostic evidence (two `SpicetifyNavigation.subscribe` calls across one round-trip, proving re-mount) and the source-code reasoning. | Proposed |
| FR-009 | DRIFT-2 | The README MUST include a sentence in its description of the Dedup page noting that the state views (idle, loading, list, empty, failed) ship with intentional visual styling that distinguishes them at a glance. Placement: same paragraph cluster as the existing WP01 clickable-Load-button note. | Proposed |
| FR-010 | RISK-5 | The README MUST include a sentence documenting that users whose Spotify build has a topbar height different from the default 110px can override the offset by setting `--dedup-topbar-offset` in their Spicetify `user.css` file. | Proposed |
| FR-011 | SC-2 polish | The visual treatment of the loading and empty state views MUST be differentiated such that a third party can tell the two apart at a single glance without reading copy. The differentiation MUST be achievable using static design changes only (no new animations beyond the existing basic spinner, per C-003). Acceptable approaches include but are not limited to: enlarging the spinner, adding a static empty-state icon, adjusting copy weight or placement, or changing the empty-state layout. | Proposed |
| FR-012 | SC-2 polish | The loading state MUST remain visually distinct from the idle state (the prior mission's FR-003 promise). The empty state MUST remain visually distinct from the idle and failed states (the prior mission's FR-003 promise). The new differentiation introduced for FR-011 MUST NOT degrade any of these other pairwise distinctions. | Proposed |

### 3.2 Non-Functional Requirements (`NFR-###`)

Each NFR carries a measurable threshold so it can be verified at the runner or via a recorded artefact.

| ID | Requirement | Measurable threshold | Status |
|----|-------------|----------------------|--------|
| NFR-001 | TDD discipline (DIRECTIVE_034): every requirement closure is driven by a failing test committed first, observed failing in CI or local run, then made green by the fix. | For each of FR-001 through FR-004 and FR-011/FR-012, the failing-test commit precedes the fix commit in `git log` for the corresponding WP. FR-005..FR-010 are non-code or removal-only changes; TDD applies via deletion-of-tests-that-no-longer-make-sense or doc verification. | Proposed |
| NFR-002 | Test coverage (DIRECTIVE_030, charter §Testing): full suite passes with 100% line, branch, function, and statement coverage at the runner. | `npm run test:run -- --coverage` reports 100% across all four; runner exits 0. The coverage gate at `vitest.config.ts` is enforced unchanged. | Proposed |
| NFR-003 | Type-check clean. | `npm run typecheck` (or equivalent `tsc --noEmit`) exits 0 with zero errors. | Proposed |
| NFR-004 | Architecture test green (no new cross-layer imports; hexagonal boundaries preserved). | `test/architecture.test.ts` passes. The retirement of `src/ports/navigation.ts` and `src/adapters/spicetify-navigation.ts` is allowed by the existing rules (the rule table doesn't change). | Proposed |
| NFR-005 | Live-client verification at mission DoD. | A dated `.md` artefact in the mission directory captures a paste-runnable console-snippet checklist that, run against the live Spotify client, prints PASS for the FR-008 navigate-away/back round-trip from every source state (idle, loaded, empty, failed; loading is observed mid-flight via the existing delayed-loader pattern). | Proposed |
| NFR-006 | Visual smoke evidence at mission DoD. | The same dated artefact (or a sibling) captures screenshots for the loading and empty state views after the FR-011 fix lands. The third-party-glance check (SC-2) is annotated PASS or PASS WITH NOTES against those screenshots. | Proposed |
| NFR-007 | README current per user-visible change. | README diff in the merge commit reflects the FR-009 styled-state-views note AND the FR-010 `--dedup-topbar-offset` override documentation. | Proposed |
| NFR-008 | JSDoc on every exported function/type touched. | `npm run typecheck` plus manual review confirms exports added, changed, or kept in this mission carry JSDoc with at least a one-line summary and parameter/return descriptions. Deletion of exports does not require JSDoc (the deletion IS the documentation). | Proposed |
| NFR-009 | Spec fidelity (DIRECTIVE_010): every claim that survives merge in the mission's spec, plan, ADR-0005, and the prior mission's ADR-0004 (now `Superseded`) is honored by the shipped code. | Charter directive DIRECTIVE_010 satisfied per the WP-review and mission-review process. | Proposed |
| NFR-010 | No regression in already-passing behavior from the prior mission. | The following live-verification assertions from `live-verification.2026-06-04.md` continue to PASS after this mission's merge: Assertion A (zero pre-trigger fetches), Assertion B (FR-001 elementFromPoint geometric check), Assertion C.2 (alert+retry render), Assertion D (retry recovery). | Proposed |

### 3.3 Constraints (`C-###`)

| ID | Constraint | Status |
|----|------------|--------|
| C-001 | Mission ships under the existing ADRs as amended by this mission. ADR-0001 (hexagonal architecture), ADR-0002 (Spicetify Platform), ADR-0003 (Zustand) remain in force unchanged. ADR-0004 is superseded by ADR-0005 (in this mission). | Proposed |
| C-002 | TypeScript strict mode remains absolute. File-level SRP per the charter. No silent error swallowing; parsers/transforms throw typed errors on malformed input and ship paired classifier predicates. | Proposed |
| C-003 | Out of scope this mission: per-track enumeration, duplicate detection, library mutation, manual-refresh affordance, design system / theme tokens / dark or light mode, **animations beyond the existing basic spinner**, restyling Spotify's chrome, adopting `Spicetify.URI.fromString` for type classification, generating composite covers from track art, row selection. FR-011's SC-2 fix MUST be achievable using static design changes only — no new motion design. | Proposed |
| C-004 | Merge target is `get_library` for this iteration. No merges to `main` from this mission. The user releases `get_library` to `main` separately when the broader iteration is ready. | Proposed |
| C-005 | No regression in already-passing behavior from the prior mission: zero pre-trigger fetches (SC-6), the prior mission's idle-only `triggerLoad` invariant, clean adapter boundary, geometric Load-button reachability. Enforced by NFR-010. | Proposed |
| C-006 | Risk boundaries from the charter remain in force, even though this mission performs no library mutation: no silent library mutations, no auto-run on Spotify launch, no cross-playlist operations. | Proposed |
| C-007 | ADR-0004 is reversed, not amended in place. The decision documentation history (DIRECTIVE_003) preserves both the original navigation-port decision and its supersession by ADR-0005 — readers of the codebase's ADR history see why the original direction was taken and why it was reversed. | Proposed |

## 4. Success Criteria

Measurable, technology-agnostic outcomes the mission must hit:

| ID | Outcome | Verification |
|----|---------|--------------|
| SC-1 | A user who navigates away from the Dedup page (from any source state — loaded, empty, failed, or even loading) and returns lands on the idle state with the Load button visible. | Live-client check (NFR-005) covering every source-state round-trip plus the production-lifecycle unit test gating FR-004. |
| SC-2 | From a single glance, a third-party reviewer can assign each of the five rendered states (idle, loading, loaded, empty, failed) to its name without reading the copy. | Visual smoke evidence (NFR-006) reviewed against the five rendered states. The bar is "third-party reviewer can do it" — the prior mission's screenshots showed loading↔empty marginal; this mission must close that gap. |
| SC-3 | Codebase has no dead code from the retired navigation-port direction. Greps for `NavigationPort`, `SpicetifyNavigation`, `FakeNavigation`, and `navigation-port-contract` in `src/` and `test/` return zero hits after merge. | Post-merge `grep` over `src/` and `test/` directories. |
| SC-4 | The ADR history at `.claude/adr/` documents both the original navigation-port decision (ADR-0004, marked `Superseded`) and the React-lifecycle decision that replaced it (ADR-0005, marked `Accepted`). A future developer reading the ADR history can reconstruct the chain of reasoning. | Manual review of `.claude/adr/0004-navigation-port.md` (status update + addendum) and `.claude/adr/0005-react-lifecycle-reset.md` (new file). |
| SC-5 | The README reflects every user-visible promise this mission honors: the previously-missed styled-state-views note from the prior mission, and the new `--dedup-topbar-offset` override hook documentation. | Manual review of README diff in the merge commit. |
| SC-6 | The prior mission's verified-PASS behaviors do not regress. | NFR-010 — the four prior-PASS assertions remain PASS after this mission's merge. |

## 5. Key Entities

This mission does not introduce new domain entities. It modifies behaviors of:

- **`NavigationProvider`** (`src/store/NavigationContext.tsx`) — currently a navigation-port consumer; this mission converts it to a pure React-lifecycle reset bridge. Props interface narrows from `{ navigation: NavigationPort; children: ReactNode }` to `{ children: ReactNode }`.
- **`PlaylistsState.reset`** (`src/store/playlists-store.ts`) — unchanged behavior; this mission consumes it from a different call site.
- **`App`** (`src/app.tsx`) — no longer constructs `SpicetifyNavigation`; no longer passes a `navigation` prop to `<NavigationProvider>`.
- **`LoadingView`** (`src/ui/LoadingView.tsx`, `LoadingView.module.scss`) — visual treatment updated for FR-011 if the chosen approach is "enlarge spinner" or similar.
- **`EmptyView`** (`src/ui/EmptyView.tsx`, `EmptyView.module.scss`) — visual treatment updated for FR-011 if the chosen approach is "add static icon / adjust layout".

Files retired (deleted) by this mission:

- `src/ports/navigation.ts`
- `src/adapters/spicetify-navigation.ts`
- `test/adapters/fake-navigation.ts`
- `test/ports/navigation-port-contract.test.ts`
- `test/adapters/spicetify-navigation.test.ts`

Files amended (status / content addition only) by this mission:

- `.claude/adr/0004-navigation-port.md` — status flip to `Superseded`; addendum explaining live-client finding.

Files added by this mission:

- `.claude/adr/0005-react-lifecycle-reset.md` — new ADR for the lifecycle-based decision.

## 6. Assumptions

- The 2026-06-04 live-client diagnostic (wrap-and-count probe on `Spicetify.Platform.History.listen`, captured in `live-verification.2026-06-04.md` §C.1) is representative of current Spicetify behavior: the custom-app React tree re-mounts on each Dedup navigation, NOT staying mounted as ADR-0004 §Alternatives.2 claimed. If a future Spicetify release changes this back to "stays mounted", the unmount cleanup (FR-002) never fires, but the page also never gets stale state because the tree never re-mounts. The defect window remains closed under both regimes.
- Zustand 5's `set({ loadState: ... })` semantics preserve action references (`reset`, `triggerLoad`, `retry`) across state updates. This is required for `useEffect(() => { ... }, [reset])` to not retrigger on every state change. (Verified by the prior mission's tests; not in question.)
- React 19's `useEffect` runs cleanup before next mount when the component remounts. Required for FR-002's unmount-cleanup to execute reliably.
- Spicetify-creator's bundler preserves the React lifecycle behavior of `useEffect` faithfully into the production bundle. (Verified by the prior mission's live-verification observing the effect ran on each mount.)
- The `--dedup-topbar-offset` CSS custom property mechanism in the prior mission's `DedupPage.module.scss:25` works as written. Users CAN override it via Spicetify `user.css`. (Not in question; documenting the existing capability.)

## 7. Out of Scope

- Per-track enumeration via `LibraryAPI.getTracks` / `/v1/tracks` enrichment.
- Duplicate detection algorithm (the `JMPerez/spotify-dedup` port).
- Any library mutation (deletion, add, reorder).
- Manual-refresh affordance from non-failure states.
- Design system, theme tokens, dark/light mode, **animations beyond the existing basic spinner**.
- Restyling or modifying Spotify's chrome (topbar, sidebar, now-playing bar).
- Adopting `Spicetify.URI.fromString` for type classification.
- Generating composite covers from track art.
- Refining the `looksLikeAuthExpired` empirical detector.
- Row selection or context-menu affordances.
- Re-introducing any future in-client navigation port (if a later feature needs it, that's a fresh ADR + mission).
- Re-verifying the prior mission's PASS assertions (Assertion A/B/C.2/D) beyond NFR-010's regression check.

## 8. Dependencies

- Prior mission `dedup-page-live-client-polish-01KT6ZCR` (merged at `b35bbce` on `get_library`). This mission edits and removes artifacts that mission introduced (specifically the navigation port + adapter chain and `NavigationContext.tsx`).
- The existing test infrastructure: Vitest, happy-dom, `@testing-library/react`, the architecture test, the coverage gate. Unchanged.
- The existing CSS modules and `_tokens.module.scss` token aliases. Used by the FR-011 visual differentiation.

## 9. Plan-phase research questions (deferred, not blockers)

The following decisions are deferred to plan-phase research per the source brief and discovery interview:

1. **Provider rename**: should `NavigationProvider` be renamed (and the file relocated) to reflect that it is no longer a port consumer? Candidates: `DedupPageResetProvider`, `RouteResetProvider`, or merge its logic into `app.tsx` and delete the file entirely. The decision is a plan-phase trade-off between clarity and minimum-diff. Not blocking the spec.
2. **FR-011 visual approach**: which specific static-design technique best disambiguates loading from empty? Candidates: (a) enlarge spinner to 64×64; (b) add a static SVG/Unicode icon to the empty state (e.g. an empty-list glyph); (c) shift the empty-state copy weight to bold and add a sub-line; (d) change the empty-state's vertical positioning so it's clearly different from loading's centered single line. Plan-phase picks one (or combines) based on a live-client probe of the current visual gap.
3. **FR-004 test placement and naming**: the new production-lifecycle test belongs in `test/store/NavigationContext.test.tsx` if the provider survives in that file, or in a relocated test file if the provider is renamed (research question 1). Plan-phase decides.

These are flagged in the plan and resolved before the corresponding WPs land. They are **not** `[NEEDS CLARIFICATION]` markers because the user has explicitly deferred them to plan-phase research and accepts the spec without them being pre-decided.

## 10. References

- Source brief: `kitty-specs/dedup-page-live-client-polish-01KT6ZCR/mission-review.md` DEFECT-1
- Live-client diagnostic: `kitty-specs/dedup-page-live-client-polish-01KT6ZCR/live-verification.2026-06-04.md` §C.1
- Prior mission spec: `kitty-specs/dedup-page-live-client-polish-01KT6ZCR/spec.md`
- Prior mission's `NavigationContext.tsx`: `src/store/NavigationContext.tsx`
- ADRs in force: `.claude/adr/0001-hexagonal-load-dedupable-playlists.md`, `.claude/adr/0002-spicetify-platform-apis-over-graphql.md`, `.claude/adr/0003-zustand-for-load-state.md`. ADR-0004 (`.claude/adr/0004-navigation-port.md`) is superseded by ADR-0005 in this mission.
- Charter: `.kittify/charter/charter.md` (DIRECTIVE_001, DIRECTIVE_003, DIRECTIVE_010, DIRECTIVE_030, DIRECTIVE_034, DIRECTIVE_036)
