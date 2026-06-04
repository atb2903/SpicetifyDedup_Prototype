# Tasks: Dedup Navigation Reset Hotfix

**Mission**: `dedup-navigation-reset-hotfix-01KT9NSW`
**Mission ID**: `01KT9NSWY6YKMB66KGXG04ZZ92`
**Spec**: [`spec.md`](./spec.md) | **Plan**: [`plan.md`](./plan.md)
**Generated**: 2026-06-04T20:07:25Z
**Planning base / merge target**: `get_library` / `get_library`

---

## Branch Contract

- **Current branch at tasks-phase start**: `get_library`
- **Planning base branch**: `get_library`
- **Final merge target**: `get_library`
- **`branch_matches_target`**: ✅ true

Execution worktrees are allocated per `lanes.json` computed by `finalize-tasks`.

---

## Mission Summary

Close DEFECT-1 from the prior mission: replace the broken navigation-port listener (whose `wasOnDedup` initial value is always `true` in production, making its reset condition permanently unreachable) with a React-lifecycle reset bridge. Mount-time reset fires on every entry into the Dedup React tree; unmount-time cleanup fires on every exit. Retire the navigation port + adapter + contract tests + ADR-0004. Bundle three non-blocking polish items: styled-state-views README note (DRIFT-2), `--dedup-topbar-offset` override documentation (RISK-5), and a spinner enlargement (FR-011/SC-2 loading↔empty disambiguation).

**MVP scope recommendation**: WP01 + WP02 + WP03 (the load-bearing hotfix + retirement + ADR history). WP04 (spinner) and WP05 (README) are bundled polish; they may merge in parallel.

---

## Subtask Index

| ID | Description | WP | Parallel |
|----|-------------|----|----------|
| T001 | RED — Failing test T-new-1 (production-lifecycle mount-time reset, parametrised over `idle`/`loading`/`loaded`/`empty`/`failed`) in new `test/store/RouteResetContext.test.tsx` | WP01 | — |
| T002 | RED — Failing test T-new-2 (mount/unmount cycle each resets; loader call count exact) | WP01 | — |
| T003 | RED — Failing test T-new-3 (mount-time reset is synchronous; no `await`/`act()` needed) | WP01 | — |
| T004 | RED — Port-forward surviving tests T-survive-1..4 to the new file/mechanism (no FakeNavigation, no setPath) | WP01 | — |
| T005 | GREEN — Implement `src/store/RouteResetContext.tsx` per `contracts/route-reset-provider.md` §1 (JSDoc per §5) | WP01 | — |
| T006 | Verify WP01 — `npm run test:run -- test/store/RouteResetContext.test.tsx` green; coverage 100/100/100/100 on the new file; typecheck clean | WP01 | — |
| T007 | Edit `src/app.tsx`: replace `NavigationProvider` import with `RouteResetProvider`, drop `SpicetifyNavigation` construction, drop `navigation` prop on the JSX element | WP02 | — |
| T008 | Edit `test/app.test.tsx`: drop `NavigationProvider`/`SpicetifyNavigation` stubbing; assert `RouteResetProvider` is mounted | WP02 | — |
| T009 | Delete the five retired files (`src/ports/navigation.ts`, `src/adapters/spicetify-navigation.ts`, `src/store/NavigationContext.tsx`, `test/adapters/spicetify-navigation.test.ts`, `test/adapters/fake-navigation.ts`, `test/ports/navigation-port-contract.test.ts`, `test/store/NavigationContext.test.tsx`) | WP02 | — |
| T010 | Verify WP02 — full `npm run test:run`, `npm run test:coverage` (100/100/100/100), `npm run typecheck`, architecture test all green | WP02 | — |
| T011 | SC-3 grep verification — `grep -r -nE "NavigationPort\|SpicetifyNavigation\|FakeNavigation\|navigation-port-contract" src test` returns zero hits | WP02 | — |
| T012 | Edit `.claude/adr/0004-navigation-port.md` per `contracts/adr-supersession.md` §1: status flip + appended `## Supersession` section | WP03 | [P] |
| T013 | Create `.claude/adr/0005-react-lifecycle-reset.md` per `contracts/adr-supersession.md` §2 (Status: Accepted, Context cites diagnostic evidence, Decision shows `useEffect` snippet, Alternatives considered enumerated, Implementation notes reference `RouteResetContext.tsx`) | WP03 | [P] |
| T014 | Verify WP03 — `contracts/adr-supersession.md` §3 checks: status header on 0004, ADR-0005 exists with `Status: Accepted`, supersession chain readable end-to-end | WP03 | [P] |
| T015 | Edit `src/ui/LoadingView.module.scss`: `.spinner` width/height `32px` → `64px`; border thickness `3px` → `5px` (tune to `6px` only if live-verification dictates) | WP04 | [D] |
| T016 | Verify WP04 — existing `test/ui/LoadingView.test.tsx` stays green without modification; full test suite, coverage gate, typecheck all green | WP04 | [D] |
| T017 | Edit `README.md` (FR-009): in the Dedup-page description paragraph, add a sentence noting the five state views (idle / loading / list / empty / failed) ship with intentional visual styling that distinguishes them at a glance | WP05 | [D] |
| T018 | Edit `README.md` (FR-010): document the `--dedup-topbar-offset` CSS custom property override hook for users whose Spicetify build's topbar height differs from the 110px default | WP05 | [D] |

The `[P]` marker in this index is informational only; per-WP progress tracks via the checkbox rows under each WP heading below.

---

## Work Package 1 (WP01) — RouteResetProvider + production-lifecycle tests

**Priority**: P0 (load-bearing hotfix — closes DEFECT-1).
**Goal**: Stand up `src/store/RouteResetContext.tsx` with a `useEffect`-based reset bridge that resets the playlists store on mount and on unmount. Drive it test-first per NFR-001/DIRECTIVE_034 with five new tests (T-new-1 parametrised, T-new-2, T-new-3) plus four surviving tests rewritten to the new mechanism.
**Independent test**: `npm run test:run -- test/store/RouteResetContext.test.tsx` exits 0 with five parametrised cases plus the six concrete cases passing. Coverage on the new file is 100/100/100/100.

**Included subtasks**:

- [ ] T001 RED — Failing test T-new-1 (production-lifecycle mount-time reset, parametrised)
- [ ] T002 RED — Failing test T-new-2 (mount/unmount cycles each reset; loader call count exact)
- [ ] T003 RED — Failing test T-new-3 (synchronous mount-time reset)
- [ ] T004 RED — Port-forward T-survive-1..4 to the new mechanism (no FakeNavigation, no setPath)
- [ ] T005 GREEN — Implement `src/store/RouteResetContext.tsx`
- [ ] T006 Verify — test suite + coverage + typecheck clean on the new file

**Estimated prompt size**: ~380 lines.
**Implementation sketch**: Write all failing tests first (T001-T004) and commit them as a single RED commit so the TDD discipline is observable in `git log` (NFR-001). Then implement the provider (T005) and commit as GREEN. Verify (T006).
**Parallel opportunities**: None within WP01 (TDD discipline serialises the RED→GREEN commit order).
**Dependencies**: None.
**Risks**: Confused `act()` semantics around the synchronous reset; mitigated by T-new-3 explicitly asserting no `await` is needed. The `useEffect` runs after React commits, so the assertion order matters — read carefully and follow the contract.
**Requirements satisfied**: FR-001, FR-002, FR-003, FR-004, FR-006.

---

## Work Package 2 (WP02) — Wire RouteResetProvider in app.tsx + retire navigation port

**Priority**: P0 (completes the hotfix; required for SC-3).
**Goal**: Make `src/app.tsx` use `RouteResetProvider` instead of `NavigationProvider`. Delete the five retired files (port, adapter, fakes, contract tests, prior provider) and the prior provider's test file. Verify SC-3 grep returns zero hits.
**Independent test**: `npm run build` succeeds; `npm run test:run` exits 0 with the prior provider's tests *gone* and the new RouteResetProvider tests running; the architecture test passes; SC-3 grep finds zero hits.

**Included subtasks**:

- [ ] T007 Edit `src/app.tsx`: swap `NavigationProvider` for `RouteResetProvider`; drop SpicetifyNavigation imports/construction; drop `navigation` prop
- [ ] T008 Edit `test/app.test.tsx`: remove NavigationProvider/SpicetifyNavigation stubbing; assert `RouteResetProvider` wraps the page
- [ ] T009 Delete five retired files + the prior provider test file
- [ ] T010 Verify — full test suite, coverage gate, typecheck, architecture test all green
- [ ] T011 SC-3 grep — zero hits for `NavigationPort | SpicetifyNavigation | FakeNavigation | navigation-port-contract` in `src/` and `test/`

**Estimated prompt size**: ~320 lines.
**Implementation sketch**: Single commit pattern works fine — the deletion + the app.tsx rewire have to land together to keep the typecheck green. The architecture-test rule table is unchanged (no edit required). Coverage stays 100/100/100/100 because the deleted files are deleted, not orphaned.
**Parallel opportunities**: None within WP02 (the five deletions + the two edits are interlocked at typecheck).
**Dependencies**: WP01 (the new file must exist before app.tsx can import it).
Depends on WP01.
**Risks**: Accidentally keeping an unused import in `app.tsx` that ESLint or the architecture test flags. Mitigated by T010's full verification sweep.
**Requirements satisfied**: FR-005, FR-006 (consumed in app.tsx).

---

## Work Package 3 (WP03) — ADR-0004 supersession + ADR-0005 creation

**Priority**: P1 (history hygiene; DIRECTIVE_003).
**Goal**: Flip ADR-0004's status to `Superseded by ADR-0005 (2026-06-04)` and append the supersession section per `contracts/adr-supersession.md` §1. Create ADR-0005 per §2.1 with all required sections and references to the diagnostic evidence.
**Independent test**: The three verification checks in `contracts/adr-supersession.md` §3 all pass: ADR-0004 contains the supersession header text, ADR-0005 exists with `Status: Accepted`, and reading both end-to-end the supersession chain is internally consistent.

**Included subtasks**:

- [ ] T012 ADR-0004 status flip + append `## Supersession` section
- [ ] T013 Create ADR-0005 per the contract template
- [ ] T014 Verify per `contracts/adr-supersession.md` §3 (greps + manual end-to-end read)

**Estimated prompt size**: ~260 lines.
**Implementation sketch**: ADR-0004's body is preserved word-for-word (C-007 mandates "reversed not amended" — only the status header and an appended section change). ADR-0005 follows the contract template literally; the Context section cites mission-review.md DEFECT-1 + live-verification.2026-06-04.md §C.1 by absolute path.
**Parallel opportunities**: WP03 runs independently of WP01/WP02; can merge in parallel.
**Dependencies**: None.
**Risks**: Inadvertently rewriting the ADR-0004 body. Mitigated by reading the file end-to-end before any edit and asserting the existing sections are untouched after the supersession append.
**Requirements satisfied**: FR-007, FR-008.

---

## Work Package 4 (WP04) — Spinner enlargement for SC-2 disambiguation

**Priority**: P1 (visual polish; SC-2 / FR-011 / FR-012).
**Goal**: Edit `src/ui/LoadingView.module.scss` to enlarge the spinner from 32×32 to 64×64 and scale the border thickness from 3px to 5px (or 6px if live-tuning requires). No new motion design (C-003).
**Independent test**: `npm run test:run -- test/ui/LoadingView.test.tsx` stays green without modification (the existing test asserts the `animation` property, which is unchanged); full test suite + coverage + typecheck remain green.

**Included subtasks**:

- [x] T015 Edit `src/ui/LoadingView.module.scss`: `.spinner` 32→64, border 3→5
- [x] T016 Verify — LoadingView test stays green; full suite, coverage gate, typecheck pass

**Estimated prompt size**: ~180 lines.
**Implementation sketch**: A single CSS module change. Two numeric edits in one block. The live-verification screenshot capture (NFR-006) happens *outside* this WP — it's mission-DoD work using the post-merge build per `quickstart.md` §2.
**Parallel opportunities**: WP04 runs independently of all other WPs; can merge in parallel.
**Dependencies**: None.
**Risks**: Border-thickness ratio at 64×64 looks visually off if scaled too aggressively (e.g. 6px+). Stick to 5px in the initial edit; if the post-build live screenshot looks too heavy, the live-verification step can adjust before sign-off — but that adjustment is a follow-up change, not part of this WP's DoD.
**Requirements satisfied**: FR-011, FR-012.

---

## Work Package 5 (WP05) — README updates (DRIFT-2, RISK-5)

**Priority**: P1 (NFR-007).
**Goal**: Add two sentences to README.md: one documenting the intentional visual styling of the five state views (FR-009), one documenting the `--dedup-topbar-offset` CSS custom property override hook for non-default topbar heights (FR-010).
**Independent test**: Manual review of the README diff confirms both sentences land in the natural places per FR-009/FR-010, and `npm run build` still succeeds (the README is not part of the build, but the sweep confirms nothing breaks).

**Included subtasks**:

- [x] T017 README FR-009 — styled-state-views note
- [x] T018 README FR-010 — `--dedup-topbar-offset` override documentation

**Estimated prompt size**: ~160 lines.
**Implementation sketch**: Two surgical edits. Read the current README first to locate the Dedup-page description paragraph (FR-009 placement) and the existing styling section (FR-010 placement). The sentences should be grammatical drop-ins that match the surrounding tone.
**Parallel opportunities**: WP05 runs independently of all other WPs.
**Dependencies**: None.
**Risks**: Putting the new sentences in the wrong paragraph. Mitigated by reading the README first and matching the FR placement guidance (FR-009: "same paragraph cluster as the existing WP01 clickable-Load-button note"; FR-010: "documents the override hook").
**Requirements satisfied**: FR-009, FR-010.

---

## Execution Order

```
WP01 (RouteResetProvider + tests)
   └── WP02 (wire + retire) [depends on WP01]

WP03 (ADRs)        ─┐
WP04 (spinner CSS) ─┼─ all three parallel with WP01/WP02
WP05 (README)      ─┘
```

**Parallelisation highlights**:

- WP03, WP04, WP05 each touch disjoint file surfaces from each other and from WP01/WP02. All three can land in parallel, in any order, alongside the WP01→WP02 chain.
- WP01 must precede WP02 because WP02's `src/app.tsx` edit imports the file WP01 creates.

---

## Definition of Done (mission-level)

The mission is done when:

1. All 18 subtasks above are marked `[x]`.
2. `npm run test:run` exits 0; `npm run test:coverage` reports 100/100/100/100; `npm run typecheck` exits 0; `npm run build` succeeds.
3. Architecture test (`test/architecture.test.ts`) passes.
4. SC-3 grep (`NavigationPort | SpicetifyNavigation | FakeNavigation | navigation-port-contract`) returns zero hits in `src/` and `test/`.
5. The live-verification artefact at `kitty-specs/dedup-navigation-reset-hotfix-01KT9NSW/live-verification.<YYYY-MM-DD>.md` (produced post-merge per `quickstart.md`) records PASS for B.1, B.2, B.3, B.4 and the FR-011 SC-2 third-party-glance check.
6. NFR-010 regression sweep confirms the four prior-mission PASS assertions (Assertion A, B, C.2, D from `kitty-specs/dedup-page-live-client-polish-01KT6ZCR/live-verification.2026-06-04.md`) remain PASS.

---

## Next suggested commands

After this `/spec-kitty.tasks` run completes (and `finalize-tasks` commits the WP files), the next step is `/spec-kitty.implement` — either invoked manually per-WP or via the `/spec-kitty-implement-review` skill for end-to-end execution.
