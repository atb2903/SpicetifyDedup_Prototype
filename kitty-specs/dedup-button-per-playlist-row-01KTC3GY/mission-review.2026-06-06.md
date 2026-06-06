---
mission: dedup-button-per-playlist-row-01KTC3GY
review_date: 2026-06-06
review_type: pre-merge mission review
verdict: PASS WITH NOTES
---

# Mission Review Report: dedup-button-per-playlist-row-01KTC3GY

**Reviewer**: claude:opus-4.7:mission-reviewer (orchestrator-mode)
**Date**: 2026-06-06
**Mission**: `dedup-button-per-playlist-row-01KTC3GY` — Dedup Button Per Playlist Row
**Baseline commit**: `b4c68d6` (planning artifacts; first commit after WP00)
**Lane HEAD at review**: `aaefc73` on `kitty/mission-dedup-button-per-playlist-row-01KTC3GY-lane-a`
**Target branch HEAD**: `022ec07` on `main` (WP06 live-verification commit; lane-a not yet merged)
**WPs reviewed**: WP01 → WP06
**Review-cycle disagreement signal**: NONE. Zero rejection cycles across all six WPs. No arbiter overrides.

> **Timing caveat**: This is a *pre-merge* mission review. The skill normally runs after `spec-kitty merge` completes (all WPs in `done`). All six WPs are currently in `approved`. The implementation lives on `kitty/mission-...-lane-a`; merge into `kitty/mission-...` then into `main` has not run. The findings below are against the lane-a HEAD — the code that *will* land — not against post-merge state. Re-run a thin verification pass after merge to catch any merge-time conflict resolutions.

---

## Diff scope

```
 package.json                     |   1 +
 package-lock.json                |  15 +
 src/ui/DedupButton.module.scss   |  33 (new)
 src/ui/DedupButton.tsx           |  70 (new)
 src/ui/LikedSongsRow.module.scss |   3
 src/ui/LikedSongsRow.tsx         |  12
 src/ui/PlaylistRow.module.scss   |   3
 src/ui/PlaylistRow.tsx           |  17
 src/ui/dedup-click-log.ts        |  17 (new)
 test/ui/DedupButton.test.tsx     | 267 (new)
 test/ui/LikedSongsRow.test.tsx   |  60
 test/ui/LoadedView.test.tsx      | 279
 test/ui/PlaylistRow.test.tsx     |  82
 test/ui/dedup-click-log.test.ts  |  64 (new)
 14 files changed, 909 insertions(+), 14 deletions(-)
```

Out-of-scope safety: nothing in `src/adapters/`, `src/ports/`, `src/domain/`, `src/store/`, or `src/app.tsx` was touched. Architecture-test rules at `test/architecture.test.ts:69-74` enforce the boundary.

WP06 separately committed `kitty-specs/.../live-verification.2026-06-06.md` + 4 screenshots directly to `main` (planning-artifact lane).

---

## FR Coverage Matrix

| ID | Description (brief) | WP | Test file(s) | Adequacy | Finding |
|---|---|---|---|---|---|
| FR-001 | Dedup button at trailing edge of every playlist row | WP02/03/04 | `DedupButton.test.tsx`, `PlaylistRow.test.tsx`, `LikedSongsRow.test.tsx`, `LoadedView.test.tsx` | ADEQUATE | — |
| FR-002 | Each button bound to exactly one playlist | WP02/05 | `LoadedView.test.tsx` (1001-row + SC-001 duplicates) | ADEQUATE | — |
| FR-003 | Verbatim `[Dedup] clicked: <name> (<uri>)` on activation | WP01/02 | `dedup-click-log.test.ts`, `DedupButton.test.tsx`, live §2.A | ADEQUATE | — |
| FR-004 | Logged name/uri match the bound playlist | WP02/05 | `DedupButton.test.tsx`, `LoadedView.test.tsx` T019(c)+T020 | ADEQUATE | — |
| FR-005 | Empty list → zero buttons, zero logs | WP05 | `LoadedView.test.tsx` T019(a), `EmptyView.test.tsx:27` | **PARTIAL** | DRIFT-1 |
| FR-006 | Render for every playlist the loader returns, no ownership filter | WP05 | `LoadedView.test.tsx` T021 | **PARTIAL / AMBIGUOUS** | DRIFT-2 |
| FR-007 | No mutations, no network, no host API calls | WP02 | `DedupButton.test.tsx` side-effect isolation test, live §2.D `sideEffects:[]` | ADEQUATE | — |
| NFR-001 | Keyboard reachability (Enter or Space) | WP02 | `DedupButton.test.tsx` Enter+Space via `userEvent.keyboard`, live §2.B | ADEQUATE | RISK-1 noted |
| NFR-002 | Accessible name includes "Dedup" + playlist name | WP02 | `DedupButton.test.tsx`, `PlaylistRow.test.tsx`, `LikedSongsRow.test.tsx` | ADEQUATE | DRIFT-3 (stylistic) |
| NFR-003 | Layout non-regression (no truncation) | WP03/04 | `PlaylistRow.test.tsx` test (c), `LikedSongsRow.test.tsx` test (c), live screenshot 01 | ADEQUATE | — |
| NFR-004 | 100% line/branch coverage on new files | WP01–WP05 | `vitest.config.ts:19-25` thresholds enforced | ADEQUATE | — |
| SC-001 | 5-row fixture, duplicate-name → distinct URIs per row | WP05 | `LoadedView.test.tsx` T020 | ADEQUATE | — |
| SC-002 | Empty fixture → 0 buttons, 0 logs | WP05 | `LoadedView.test.tsx` T019(a) | **PARTIAL** | DRIFT-1 |
| SC-003 | Keyboard-only user can dedup any row | WP02 | `DedupButton.test.tsx` Enter+Space, live §2.B | ADEQUATE | RISK-1 noted |
| SC-004 | 100% line/branch coverage; CI fails on drop | — | `vitest.config.ts:19-25` | ADEQUATE | — |
| C-001 | Click handler does exactly one thing (console.log) | WP01 | `dedup-click-log.test.ts`, live §2.D | ADEQUATE | — |
| C-002 | No new runtime dependencies | WP02 | `package.json` review: `@testing-library/user-event@^14.6.1` in `devDependencies` only; `dependencies` unchanged (zustand only) | ADEQUATE | — |
| C-003 | File-level SRP | All | One file per responsibility (helper / component / styles / each row) | ADEQUATE | — |
| C-004 | TDD (failing test first) | All | RED→GREEN reported in each WP commit body; can't verify temporal order post-merge, but all required test files exist with expected coverage | PROCESS | — |
| C-005 | List-length boundary (0/1/≥3) | WP05 | `LoadedView.test.tsx` T019(a)/(b)/(c) | ADEQUATE | DRIFT-1 caveat for "0" |
| C-006 | Black-box DOM-level assertions, console.log spy | All | Verified: no test pokes component internals; `vi.spyOn(console,'log')` pattern used throughout | ADEQUATE | — |
| C-007 | ADR under `.claude/adr/` | WP01 | `.claude/adr/0006-console-only-dedup-click-confirmation.md` exists on disk; **not committed** (`.claude/` is gitignored per CLAUDE.md) | ADEQUATE | DRIFT-4 (project convention) |

**Adequacy legend**: ADEQUATE = test constrains the required behavior end-to-end via production wiring (real store + FakePlaylistsLoader). PARTIAL = test exists but covers a substitute case because the literal spec scenario is unreachable in the production model. PROCESS = process discipline cannot be verified from post-merge state alone; rely on per-WP review trail.

---

## Drift Findings

### DRIFT-1: FR-005 / SC-002 spec describes an unreachable production state

**Type**: SPEC-MODEL MISMATCH
**Severity**: **LOW**
**Spec reference**: FR-005, SC-002
**Evidence**:
- `src/domain/view-models.ts:106-113` — `toViewModels` unconditionally constructs and pins a `Liked Songs` row before mapping eligible playlists.
- `src/ui/LoadedView.tsx:38` — `LoadedView` returns `null` only when `loadState.kind !== 'loaded'`; once `loaded`, it always renders the pinned Liked Songs row.
- `test/ui/LoadedView.test.tsx:255-277` — the test for C-005 lower-bound / FR-005 falls back to the FSM "not loaded" case with an in-test comment ("the nearest legal 'zero rows rendered' fixture is the idle state"). The test acknowledges that the literal empty-loaded-list scenario the spec describes cannot exist in production.

**Analysis**: The spec assumes "loaded list is empty" is reachable. The data-model design (Liked Songs always pinned regardless of eligibility) makes it unreachable. FR-005 is satisfied *vacuously*: the test for "no buttons in empty state" uses a substitute fixture (FSM not-loaded) plus `EmptyView.test.tsx:27`. Both substitutes are principled, but the spec wording suggests a scenario the architecture has already ruled out. This is documentation drift, not a code defect — production behaves correctly under all reachable states. Recommend the spec author update FR-005 / SC-002 to reflect the actual minimum loaded-list shape (1 row: Liked Songs) in the next mission, or split FR-005 into two clauses: (a) "EmptyView FSM cell renders no Dedup buttons" (covered) and (b) "minimum loaded list is 1 row: Liked Songs" (architectural fact).

---

### DRIFT-2: FR-006 vs. upstream `isEligible` filter (the load-bearing one)

**Type**: SPEC AMBIGUITY × UPSTREAM DEPENDENCY
**Severity**: **MEDIUM**
**Spec reference**: FR-006 ("no filtering by ownership, collaborator status, or any other attribute")
**Evidence**:
- `src/domain/eligibility.ts:18-22`: `isEligible(c) = c.isOwnedByMe || (c.isCollaborative && c.canEdit)`. Excludes followed playlists, curated playlists, and other users' non-editable playlists.
- `src/domain/view-models.ts:94-97`: `toViewModels` consumes `eligible: RawCollection[]` — already-filtered. Comment: "drops happen earlier, in `isEligible`".
- `src/ui/LoadedView.tsx:41`: maps over `loadState.items` (post-eligibility-filter, post-toViewModels).
- `test/ui/LoadedView.test.tsx:421-470` (WP05 T021): the FR-006 test introduces a `plWithOwner()` helper to **bypass eligibility** so all 3 ownership variants (`self`/`other`/`system-library`) reach LoadedView. In-test comment line 422-427: "every owner kind that **survives eligibility filtering** receives a Dedup button … isolates the FR-006 contract from the orthogonal eligibility rule."

**Analysis**: Two readings of FR-006:
1. **Button doesn't introduce its own filter** — satisfied. Every row that reaches `LoadedView` gets a button regardless of `owner.kind`. The DedupButton component does not inspect owner at all.
2. **Every playlist the raw loader returns gets a button** — NOT satisfied. Followed playlists, curated playlists, and "other"-owned non-editable playlists are filtered out upstream and never get a Dedup button row.

The implementer chose reading (1) and bypassed eligibility in the FR-006 test. This is explicitly documented. The spec author should clarify which reading is intended. If reading (2) is intended, the next mission needs to either (a) lift `isEligible` for the Dedup surface specifically, or (b) revisit eligibility upstream. Either choice has product implications for what "Dedup" means: deduplicate inside playlists I cannot edit?

**Recommendation**: surface to the spec author for explicit ruling before the next mission designs the real dedup behaviour. If reading (2) is intended, FR-006 is currently NOT satisfied and a follow-up WP is needed.

---

### DRIFT-3: NFR-002 — implementation uses `Dedup <name>`, spec example was `Dedup playlist <name>`

**Type**: STYLISTIC / NON-NORMATIVE
**Severity**: **LOW**
**Spec reference**: NFR-002
**Evidence**:
- `spec.md:65`: "accessible name that includes the word 'Dedup' and the playlist name (e.g. `aria-label='Dedup playlist <name>'`)".
- `src/ui/DedupButton.tsx:64`: `aria-label={`Dedup ${playlistName}`}` — no literal "playlist" interjected.
- Live screenshot `02-row-closeup.png` confirms `Dedup` label on the actual button.

**Analysis**: The spec uses "e.g." (illustrative) and states the requirement as "includes the word 'Dedup' AND the playlist name". The implementation satisfies both. The pinned Liked Songs row would awkwardly read as "Dedup playlist Liked Songs" under the example wording, which is part of why the implementer chose the shorter form. Worth confirming with the spec author that the example was illustrative, not normative.

---

### DRIFT-4: ADR-0006 exists on disk but is not committed

**Type**: GOVERNANCE CONVENTION
**Severity**: **LOW**
**Spec reference**: C-007, charter `DIRECTIVE_003`
**Evidence**:
- `.claude/adr/0006-console-only-dedup-click-confirmation.md` — present on the implementer's working tree (per WP01 commit body) but never staged.
- `CLAUDE.md` (Artifact locations section): "`.claude/` and `.kittify/` are both gitignored — nothing in either is committed."
- ADRs 0001–0005 follow the same pattern.

**Analysis**: WP01's DoD reads "ADR file present at the canonical path" — file existence, not commit. The implementer-flagged the convention conflict during WP01 implementation; the reviewer approved the on-disk-only outcome citing the existing project pattern. This is a project-wide governance question, not a defect of this mission: should `.claude/adr/` be tracked? Currently the ADR record is only on the original author's machine and would be lost on a fresh checkout. Out of scope for a code-fix in this mission; flag for a project-policy decision.

---

## Risk Findings

### RISK-1: Space-key activation hijacked by Spotify's global play/pause hotkey

**Type**: ENVIRONMENTAL
**Severity**: **LOW** (spec uses "or"; Enter activates correctly)
**Location**: Live Spotify desktop client behaviour
**Trigger condition**: keyboard-only user with focus on a Dedup button presses Space

**Evidence**: Live walkthrough §2.B (documented in `live-verification.2026-06-06.md`): Space did NOT emit a Dedup log line in the live client; Spotify intercepted the keydown to toggle playback. Enter worked correctly. The automated test in `DedupButton.test.tsx:129-146` uses `userEvent.keyboard(' ')` which simulates native browser semantics and passes — happy-dom doesn't model Spotify's host-level handler.

**Analysis**: Spec FR-003 / NFR-001 / SC-003 all use "Enter **or** Space" (inclusive disjunction). Enter satisfies. The Space-hijack is an environmental behaviour of the Spotify client, not a defect in the button. The next mission with a real action should consider adding `onKeyDown` for `' '` with `event.preventDefault()` and manual activation if Space-parity becomes a UX requirement; out of scope here.

---

### RISK-2: No memoisation on DedupButton across a 1001-row list

**Type**: PERFORMANCE BOUNDARY
**Severity**: **LOW**
**Location**: `src/ui/DedupButton.tsx`, `src/ui/PlaylistRow.tsx:60`, `src/ui/LikedSongsRow.tsx:69`
**Trigger condition**: re-render of `LoadedView` while 1000+ playlists are in the loaded list

**Evidence**: WP02 brief Detailed guidance §T012: "Do NOT add memoisation. Primitive props on `<DedupButton>` keep re-renders proportional." Test `LoadedView.test.tsx:181-205` renders 1001 rows; full suite runs in ~3.86s.

**Analysis**: Reasonable for this mission's scope (no real work; cheap to re-render). Worth re-evaluating when the next mission ships actual click-side work — if a parent state change triggers a full list re-render and each DedupButton triggers heavy work, memoisation will matter. Not a defect now.

---

### RISK-3: FR-006 reading (2) is unverifiable from this mission's surface

**Type**: CROSS-MISSION INTEGRATION
**Severity**: **MEDIUM** (carrying RISK-2's product implication)
**Location**: `src/domain/eligibility.ts` (upstream filter); `src/ui/LoadedView.tsx` (filtered consumer)

**Evidence**: See DRIFT-2.

**Analysis**: A reviewer reading only this mission's diff would conclude "FR-006 satisfied" — every row that reaches LoadedView gets a button. But a reviewer reading the spec end-to-end might conclude "non-editable / followed / curated playlists need buttons too". The disagreement isn't visible from `git diff <baseline>..HEAD`. This is exactly the kind of gap a per-WP review can miss and a cross-mission review catches.

---

## Silent Failure Candidates

**None.** The implementation has no `try`/`catch`, no default-return error paths, no swallowed exceptions across the new code. Every code path is either a pure render or a single `console.log`. The architecture rule and tests catch any future drift into adapter/port territory at the boundary.

---

## Security Notes

UI-only mission. No new attack surface introduced.

| Surface | Hit | Risk class | Recommendation |
|---|---|---|---|
| Subprocess execution | 0 | — | — |
| File path operations | 0 | — | — |
| HTTP / network calls | 0 | — | — |
| Auth / credentials | 0 | — | — |
| User-controlled string in DOM attribute | 1 (`aria-label={`Dedup ${playlistName}`}`) | NONE (React text interpolation is XSS-safe; treated as text node, not HTML) | — |
| User-controlled string in console.log | 1 (`console.log(`[Dedup] clicked: ${name} (${uri})`)`) | NONE (`console.log` does not render HTML; no log injection risk because this is dev-tooling output, not log aggregation) | — |

`playlistName` and `playlistUri` originate from Spotify's API (post-`toViewModels` transform). The trust boundary is at the API → adapter layer, not here. No security follow-up.

---

## Live Verification Cross-Check

The WP06 sign-off (`live-verification.2026-06-06.md`) reports PASS on §2.A (3/3 lines correct), §2.B (Enter PASS, Space hijack documented), §2.D (`sideEffects: []`). Cross-referenced against the spec FR/NFR/SC IDs:

| Spec ID | Live coverage | Notes |
|---|---|---|
| FR-001 / FR-002 | §2.A + screenshot 01 (3 rows, 3 buttons at trailing edge) | OK |
| FR-003 / FR-004 | §2.A (3 lines, each matching clicked row) | OK |
| FR-007 / C-001 | §2.D (`sideEffects: []` over 3 clicks) | OK — the load-bearing risk-boundary check |
| NFR-001 / SC-003 | §2.B (Enter PASS; Space hijack documented) | OK under "or" reading |
| NFR-002 | §2.B (`first button aria-label: Dedup Liked Songs` from `getAttribute`) | OK |
| NFR-003 | Screenshot 01 (no truncation across 3 rows at 73020/631/161 tracks) | OK |
| FR-005 / SC-002 | Skipped (library non-empty); cites automated coverage | OK per quickstart §2.C policy |
| FR-006 / SC-001 | Not exercised live (library lacks duplicate-name rows AND non-`self` owners); cites automated coverage | OK *given DRIFT-2 caveat* |

Library scale at verification: 73 020-track Liked Songs — materially larger than the `/v1/me/tracks` 502 threshold that motivated the Spicetify pivot. Confirms the in-client surface works at the scale that justifies the project's architecture.

---

## Final Verdict

**PASS WITH NOTES**

### Verdict rationale

Every Functional Requirement is covered by at least one passing test that exercises real production wiring (real store + FakePlaylistsLoader, not synthetic fixtures), and three of the seven FRs additionally have live-client evidence in the WP06 sign-off. All four NFRs are covered. Coverage thresholds at `vitest.config.ts:19-25` enforce 100/100/100/100 at CI time; the post-WP05 measurement is 100/100/100/100 globally and on each of the four new/changed source files (`dedup-click-log.ts`, `DedupButton.tsx`, `PlaylistRow.tsx`, `LikedSongsRow.tsx`). No locked decisions were violated. No CRITICAL or HIGH risk findings. The single MEDIUM-severity finding (DRIFT-2 / RISK-3, the FR-006 vs. `isEligible` ambiguity) is a spec-clarification matter that affects the *next* mission's design, not this mission's deliverable.

### Blocking findings

**None.** Lane-a is ready to merge into the mission branch and then into main.

### Open items (non-blocking; should be addressed before the next mission starts)

1. **Resolve FR-006 ambiguity** with the spec author. Decision needed: does "every playlist the loader returns" mean the raw library API or the eligibility-filtered list? If raw, a follow-up WP must surface the Dedup button on non-eligible playlists (followed/curated/other-uneditable). If filtered, update FR-006 wording to remove the ambiguity. **Owner: spec author / next-mission planner.**
2. **Update FR-005 / SC-002 spec wording** to reflect that the loaded list cannot be empty (Liked Songs always pins). Split into FSM-cell coverage (EmptyView) and architectural fact, or remove the "empty loaded list" scenario. **Owner: spec author.**
3. **Decide ADR-tracking policy** at project level. ADR-0006 (and 0001–0005) only exist on developer working trees. **Owner: project / charter.**
4. **Note the Space-hijack** in the next mission's design constraints. If keyboard-only Space-parity is required, plan a `keydown` interceptor. **Owner: next-mission planner.**
5. **Re-evaluate DedupButton memoisation** when the next mission attaches real work to the click handler. **Owner: next-mission implementer.**

### Post-merge follow-up

After `spec-kitty merge --mission dedup-button-per-playlist-row-01KTC3GY` runs, re-run:
- `npm run test:run` from `main` HEAD — confirm no merge-time regressions.
- `npm run test:coverage` from `main` HEAD — confirm 100/100/100/100 still holds across all files.
- `git diff main~6..main -- src/` — confirm the merge captured the same code reviewed here.

If any of those drift from this review's expectations, file a fresh finding.
