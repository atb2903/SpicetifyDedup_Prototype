# Spec: Dedup Page Live-Client Polish

**Mission**: `dedup-page-live-client-polish-01KT6ZCR`
**Mission ID**: `01KT6ZCR2FHBG8FBB61HA41QC3`
**Mission type**: `software-dev`
**Target merge branch**: `get_library`
**Prior mission**: `load-dedupable-playlists-01KT3XW3` (merged at `1a1e1ae` on `get_library`)
**Source brief**: `.claude/load-dedupable-playlists-followup-brief.md`
**Source evidence**: prior mission's `mission-review.md` + 2026-06-03 live-client DevTools transcript
**Created**: 2026-06-03

---

## 1. Overview

The previous mission (`load-dedupable-playlists-01KT3XW3`) shipped a working data path: adapter, store, FSM, and list view all render correct results against a real user library. Post-merge live verification on 2026-06-03 confirmed the happy-path render and zero pre-trigger fetches, but surfaced **five defects** that make the page unusable from the live Spotify client:

- **P1 (HIGH)** — Spotify's `<header class="main-topBar-container">` overlays the Dedup page's first interactive surface. A real mouse click on the Load button hits the topbar; the button is reachable only via DevTools (`btn.click()`).
- **P2 (MEDIUM)** — None of the dedup component classes (`dedup-idle`, `dedup-row`, `dedup-failed`, etc.) have CSS. Every state view ships in browser-default styling; rows collapse adjacent inline spans into a single visual word.
- **P3 (MEDIUM)** — The production store is a module-scope singleton with no `reset` action. Navigating away from the Dedup page mid-load and returning lands the user on the state they left, violating the prior spec's edge case promise.
- **P4 (LOW)** — `data-model.md` §3 declares `'playlist'` and `'playlist-v2'` both valid rootlist types; the adapter at `src/adapters/spicetify-playlists-loader.ts:141` matches only `'playlist'`. Drift between spec and code.
- **P5 (LOW)** — `triggerLoad` is not gated on the `idle` FSM state; today's UI only renders it from idle, but the FSM does not enforce the invariant defensively.

This mission closes all five defects under TDD with the existing hexagonal architecture, Spicetify Platform, and Zustand decisions (ADR-0001, ADR-0002, ADR-0003). No new user capability lands. The dedup algorithm itself remains out of scope.

## 2. User Scenarios & Testing

### Primary user flow

A user opens the Dedup page from Spotify's sidebar. The page renders an idle state with copy explaining that loading is opt-in and a single Load button. The user clicks the button with a real mouse; the page transitions to a loading state with a visible spinner. After a successful load the page shows a styled list of every dedup-eligible playlist (plus Liked Songs) the user owns, with rows that are visually separated and legible. From a single glance the user can tell which state — idle, loading, list, empty, failed — the page is in, without reading any copy.

### Navigate-away / return flow

The user has loaded their dedup-able playlists and sees the list. They navigate to another Spotify view (e.g. their Home page or a different playlist), then click back into Dedup from the sidebar. The page shows the idle state with the Load button, ready for a fresh load. The same holds if the user navigates away while loading is in progress: returning does not show an orphaned loading spinner; it shows idle.

### Failure / retry flow

The user clicks Load. The host load operation fails (network error, auth expired, permission denied). The Failed state renders with a clearly distinguishable visual treatment (visibly an error, not a normal outcome) and a Retry affordance. The user clicks Retry; the page transitions back to loading, attempts another load, and either succeeds (list rendered) or returns to Failed.

### Empty-library flow

The user clicks Load. The user owns no dedup-eligible playlists. The page shows the Empty state with copy distinguishable from the Failed state — it reads as a normal outcome, not an error.

### Edge cases

- **Mouse click vs. programmatic click**. The Load button must accept a real mouse-driven click — `dispatchEvent(MouseEvent)` from outside React, or a synthetic React click via `Spicetify.Platform.History`-style routing, are both insufficient if `elementFromPoint(buttonCenter)` resolves to anything other than the button or its descendants.
- **Rootlist `type: 'playlist-v2'` nodes**. The current adapter silently skips them. A user whose rootlist contains such nodes sees fewer rows than expected. The 2026-06-03 user library had zero such nodes, so this defect has zero observed user impact today, but the spec-vs-code drift exists.
- **Re-entry after load** (P3). Module-scope singleton means store state persists across React unmount/remount of the page. The user observes whatever state they left.
- **`spotify:mosaic:` cover URIs**. Render natively in Spotify's webview. The 2026-06-03 measurement was `mosaic: 2, brokenMosaic: 0`. **Prior mission's RISK-1 is debunked and explicitly out of scope.**

## 3. Requirements

Requirements are testable, status-tracked, and separated by type. Stable IDs (`FR-###`, `NFR-###`, `C-###`) are referenced from the plan and tasks. Status legend: `Proposed` (in this spec, awaiting plan), `Approved` (plan accepted), `Implemented` (WP merged), `Verified` (live-client check passed).

### 3.1 Functional Requirements (`FR-###`)

| ID | Defect | Requirement | Status |
|----|--------|-------------|--------|
| FR-001 | P1 | The DedupPage layout MUST place the Load button such that `elementFromPoint(buttonRect.left + buttonRect.width / 2, buttonRect.top + buttonRect.height / 2)` resolves to the Load button element or one of its descendants — not to any element belonging to Spotify's host chrome (e.g. `.main-topBar-container`). | Proposed |
| FR-002 | P1 | The fix MUST be exercised by an automated regression test runnable in CI (either a live-DOM check or a happy-dom mount with a faux topbar overlay) that fails if the Load button center is occluded by an ancestor or sibling element. | Proposed |
| FR-003 | P2 | Each of the five state views (idle, loading, list, empty, failed) MUST render with styling that visually distinguishes it from the other four. A user MUST be able to identify which state is showing from a single glance without reading the copy. | Proposed |
| FR-004 | P2 | List rows MUST render with row separation, hover affordance (without selection — C-003 still applies), and typography that does NOT collapse adjacent inline spans (cover/name/owner/count) into a single visual word. | Proposed |
| FR-005 | P2 | Rows whose `imageUrl` is `null` MUST render a placeholder cover visual. (Mosaic and direct-URL covers continue to render natively per the debunked RISK-1 finding.) | Proposed |
| FR-006 | P2 | The Failed state's Retry affordance MUST be visually distinguishable as an actionable control. The Loading state's spinner MUST be visually present and recognizable as a spinner. | Proposed |
| FR-007 | P3 | The store MUST expose a `reset` action that returns FSM state to `{ kind: 'idle' }` from any state. | Proposed |
| FR-008 | P3 | The DedupPage MUST hook the `reset` action into the React lifecycle such that navigating away from the page and returning lands the user on the idle state. The specific hook (mount-time reset, unmount cleanup, visibility-change, or route-aware effect) is a plan-phase decision pending live probing of how Spicetify mounts/unmounts custom apps. | Proposed |
| FR-009 | P3 | The `reset` action MUST NOT trigger `loader.load()` directly or transitively. | Proposed |
| FR-010 | P4 | The Spicetify playlists adapter MUST emit a `RawCollection` for rootlist nodes whose URI type is either `'playlist'` or `'playlist-v2'`. Other types (e.g. `'folder'` walked recursively, `'show'`, `'episode'`) remain silently skipped per the existing contract. | Proposed |
| FR-011 | P4 | An adapter fixture (or in-test override) MUST cover at least one rootlist node whose type is `'playlist-v2'` so the regression is captured by the test suite. | Proposed |
| FR-012 | P5 | `triggerLoad` MUST be a documented no-op when invoked from any FSM state other than `idle`. From non-idle states it MUST NOT change FSM state and MUST NOT call `loader.load()`. | Proposed |
| FR-013 | P5 | The `triggerLoad` no-op MUST be covered by a test for each non-`idle` source state (mirroring the existing `retry` no-op tests). | Proposed |

### 3.2 Non-Functional Requirements (`NFR-###`)

Each NFR carries a measurable threshold so it can be verified at the runner or via a recorded artefact.

| ID | Requirement | Measurable threshold | Status |
|----|-------------|----------------------|--------|
| NFR-001 | TDD discipline (DIRECTIVE_034): every defect closure is driven by a failing test committed first, observed failing in CI or local run, then made green by the fix. | For each of FR-001 through FR-013, the failing-test commit precedes the fix commit in `git log` for the corresponding WP. | Proposed |
| NFR-002 | Test coverage (DIRECTIVE_030, charter §Testing): full suite passes with 100% line and 100% branch coverage. | `npm run test:run -- --coverage` reports `lines: 100%` and `branches: 100%`; runner exits 0. | Proposed |
| NFR-003 | Type-check clean. | `npm run typecheck` (or `tsc --noEmit`) exits 0 with zero errors. | Proposed |
| NFR-004 | Architecture test green (no new cross-layer imports, hexagonal boundaries preserved). | Architecture test in the suite passes; no UI layer imports adapter internals, no adapter imports UI, no store imports either. | Proposed |
| NFR-005 | Live-client verification at mission DoD. | A dated `.md` artefact in the mission directory captures a paste-runnable console-snippet checklist that, run against the live Spotify client, prints PASS for all four assertions: (a) zero host fetches before user clicks Load, (b) happy-path render against the real library, (c) forced-failure render, (d) retry recovery from a forced failure. | Proposed |
| NFR-006 | Visual smoke evidence at mission DoD. | The same dated artefact (or a sibling) captures screenshot or console-snippet evidence for each of the five rendered states (idle, loading, list, empty, failed). | Proposed |
| NFR-007 | README current per user-visible change. | README diff in the merge commit reflects the clickable Load button and the styled list. | Proposed |
| NFR-008 | JSDoc on every exported function/type touched. | `npm run typecheck` and any docs lint pass; manual review confirms exports added or changed in this mission carry JSDoc with at least a one-line summary and parameter/return descriptions. | Proposed |
| NFR-009 | Click reachability assertion is automated, not manual. | The regression test gating FR-001 runs in `npm run test:run` (no out-of-band human step). | Proposed |
| NFR-010 | Spec fidelity (DIRECTIVE_010): every claim that survives merge in `data-model.md`, `spec.md`, or `plan.md` is honored by the shipped code. | Either the adapter accepts both `'playlist'` and `'playlist-v2'` (FR-010 path), or `data-model.md` §3 is amended in this mission's plan to narrow the contract — not both half-done. | Proposed |

### 3.3 Constraints (`C-###`)

| ID | Constraint | Status |
|----|------------|--------|
| C-001 | Mission ships under the existing ADRs (ADR-0001 hexagonal architecture, ADR-0002 Spicetify Platform, ADR-0003 Zustand). No new ADRs unless plan-phase research surfaces a fresh load-bearing decision — the styling-home choice (P2) is the only candidate and earns ADR-0004 only if it crystallizes during plan. | Proposed |
| C-002 | TypeScript strict mode remains absolute. File-level SRP per the charter. No silent error swallowing — parsers/transforms throw typed errors on malformed input and ship paired classifier predicates. | Proposed |
| C-003 | Out of scope this mission: per-track enumeration, duplicate detection, library mutation, manual-refresh affordance, design system / theme tokens / dark or light mode, animations beyond a basic spinner, restyling Spotify's chrome, adopting `Spicetify.URI.fromString` for type classification, generating composite covers from track art, row selection. | Proposed |
| C-004 | Merge target is `get_library` for this iteration. No merges to `main` from this mission. The user releases `get_library` to `main` separately when the broader iteration is ready. | Proposed |
| C-005 | No regression in already-passing behavior: zero host fetches before the user clicks Load (the prior mission's SC-6), idle is the only state from which `triggerLoad` does anything (the strengthened version of the prior FR-012), and the `getDuplicatesContext` boundary stays clean. | Proposed |
| C-006 | Risk boundaries from the charter remain in force, even though this mission does not perform deletions: no silent library mutations are introduced, no auto-run on Spotify launch, no cross-playlist operations. (Belt-and-suspenders — this mission does not add such operations, but the constraint stays declared.) | Proposed |

## 4. Success Criteria

Measurable, technology-agnostic outcomes the mission must hit:

| ID | Outcome | Verification |
|----|---------|--------------|
| SC-1 | A user opening the Dedup page can click the Load button with a real mouse and trigger a load on the first attempt. | Live-client check (NFR-005) plus automated regression test (FR-002 / NFR-009). |
| SC-2 | From a single glance, a user can identify which of the five page states (idle, loading, list, empty, failed) is showing without reading the copy. | Visual smoke evidence (NFR-006) reviewed against the five rendered states. |
| SC-3 | A user who navigates away from the Dedup page during or after a load and returns lands on the idle state with the Load button. | Unit test for mount → trigger → unmount → re-mount returning `kind === 'idle'`; live-client check during NFR-005 run. |
| SC-4 | A user whose rootlist contains `'playlist-v2'`-typed nodes sees those nodes counted in the rendered list (if otherwise eligible per the existing `isOwnedBySelf` filter). | Fixture test (FR-011) plus the resolution of NFR-010. |
| SC-5 | No code path can dispatch `loader.load()` while the FSM is in a non-idle state. | Test coverage for each non-`idle` source state (FR-013) plus the existing `retry` no-op tests. |
| SC-6 | The page surface continues to look and behave like a native part of the Spotify client (not a bare browser page) under the existing `getDuplicatesContext` extension scaffold. | Visual smoke evidence (NFR-006) reviewed against the hosted client; no host chrome regressions reported. |

## 5. Key Entities

This mission does not introduce new domain entities. It operates on the entities already established by the prior mission:

- **`RawCollection`** — adapter-emitted normalized playlist record (`{ uri, name, ownerUri, imageUrl, trackCount, kind }`). FR-010 expands the set of rootlist URI types that produce a `RawCollection` from `{'playlist'}` to `{'playlist', 'playlist-v2'}`.
- **`DedupablePlaylistsState`** — Zustand store FSM (`idle | loading | list | empty | failed`). FR-007 adds a `reset` action; FR-012 narrows `triggerLoad`'s precondition to `kind === 'idle'`.
- **`DedupPage`** — the React root rendered into Spotify's custom-app slot. FR-001/FR-002 reshape its layout. FR-008 wires the `reset` lifecycle hook.

The five view components (`IdleView`, `LoadingView`, `ListView`, `EmptyView`, `FailedView`) and `RowView` already exist; this mission attaches stylesheets to them, not new components.

## 6. Assumptions

- The 2026-06-03 measurement of the topbar's vertical footprint (`y ≈ 110`) is representative of currently-shipping Spotify desktop builds. If a different supported Spotify build extends the topbar further, the layout fix must still satisfy FR-001 — the fix's *mechanism* (scrollable container vs. sticky-header offset vs. slot rendering) is a plan-phase decision, but FR-001's assertion holds across builds.
- Spicetify's custom-app mount/unmount lifecycle is probable but not yet measured. FR-008 explicitly defers the hook choice (mount-time, unmount-cleanup, visibility-change, route-aware) to plan-phase research.
- The existing test runner (Vitest + happy-dom + @testing-library/react) can host the regression test gating FR-001. If happy-dom's `elementFromPoint` implementation cannot simulate a faux topbar overlay with fidelity, the plan substitutes an alternate assertion shape (e.g. computed-style overlap check) but the contract — "the button is not occluded by chrome" — stays the same.
- The `'playlist-v2'` rootlist URI type behaves identically to `'playlist'` for the adapter's purposes once accepted (same fields, same `isOwnedBySelf` filter semantics, same image URI shape). If live probing during P4 reveals divergent behavior, the plan surfaces it as a refined requirement.
- The `getDuplicatesContext` extension scaffold continues to host the React root via the existing Spicetify custom-app mechanism; no upstream Spicetify API changes are required.

## 7. Out of Scope

- Per-track enumeration via `LibraryAPI.getTracks` / `/v1/tracks` enrichment.
- Duplicate detection algorithm (the `JMPerez/spotify-dedup` port).
- Any library mutation (deletion, add, reorder).
- Manual-refresh affordance from non-failure states.
- Design system, theme tokens, dark/light mode, motion design beyond a basic spinner.
- Restyling or modifying Spotify's chrome (topbar, sidebar, now-playing bar).
- Adopting `Spicetify.URI.fromString` for type classification — the rootlist `type`-classifier approach stays; P4 only adds the missing variant.
- Generating composite covers from track art.
- Refining the `looksLikeAuthExpired` empirical detector (parked for the next iteration; needs a real auth-expired payload sample).
- Row selection or context-menu affordances.

## 8. Dependencies

- Prior mission `load-dedupable-playlists-01KT3XW3` (merged at `1a1e1ae` on `get_library`). This mission edits the artifacts that mission introduced (`src/store/playlists-store.ts`, `src/adapters/spicetify-playlists-loader.ts`, `src/pages/dedup-page.tsx`, the five view components, the row component) and reads its `data-model.md` and `spec.md` as fidelity baselines.
- `src/css/app.module.scss` — current stylesheet home for `.container`, `.title`, `.button`. Either extended (CSS-modules path) or superseded (alternate styling-home path); the decision is plan-phase.
- The existing test infrastructure: Vitest, happy-dom, `@testing-library/react`, the architecture test, and the coverage gate.

## 9. Plan-phase research questions (deferred, not blockers)

These were called out in the brief as decisions that should be made during plan-phase research with the live client running, not pinned in the spec:

1. **P1 layout home**: does the DedupPage own its own scroll surface + topbar offset, or render inside a Spicetify-provided main-view slot that already accounts for the topbar? Probe `data-porter` and other established Spicetify custom apps; pick the smallest correct fix.
2. **P2 styling home**: CSS modules (continue `.module.scss`), one global stylesheet, or styled-components / inline styles? User wants this decided after a live probe of how comparable Spicetify custom apps style themselves. Decision earns ADR-0004 only if it deviates from the existing CSS-modules pattern.
3. **P3 lifecycle hook**: does Spicetify unmount custom apps on navigation, or just hide them? Mount-time reset suffices if unmount; visibility-change or route-aware effect needed if hide-only. Probe in the live client during WP for FR-008.

These are flagged in the plan and resolved before the corresponding WPs land. They are **not** `[NEEDS CLARIFICATION]` markers because the user has explicitly deferred them to plan-phase research and accepts the spec without them being pre-decided.

## 10. Findings explicitly dropped

- **Prior mission review's RISK-1 (broken `spotify:mosaic:` covers).** Live verification on 2026-06-03 measured `mosaic: 2, brokenMosaic: 0`. No fix; out of scope.

## 11. References

- Brief: `.claude/load-dedupable-playlists-followup-brief.md`
- Prior mission review: `kitty-specs/load-dedupable-playlists-01KT3XW3/mission-review.md`
- Prior mission spec: `kitty-specs/load-dedupable-playlists-01KT3XW3/spec.md`
- Prior mission data-model: `kitty-specs/load-dedupable-playlists-01KT3XW3/data-model.md`
- Domain research: `.claude/spicetify-dedup-research.md`, `.claude/spicetify-ecosystem-research.md`
- ADRs in force: `.claude/adr/0001-hexagonal-architecture.md`, `.claude/adr/0002-spicetify-platform.md`, `.claude/adr/0003-zustand-state.md`
- Charter: `.kittify/charter/charter.md` (DIRECTIVE_001, DIRECTIVE_003, DIRECTIVE_010, DIRECTIVE_030, DIRECTIVE_034, DIRECTIVE_036)
