# Phase 0 Research — Dedup Navigation Reset Hotfix

**Mission**: `dedup-navigation-reset-hotfix-01KT9NSW`
**Date**: 2026-06-04

Resolves the three plan-phase research questions recorded in `spec.md` §9, plus a short note on the architectural fitness of the chosen lifecycle approach against `test/architecture.test.ts`.

---

## §1 — Provider identity (resolves spec §9.1)

**Decision**: Rename `NavigationProvider` to `RouteResetProvider`. Move the file from `src/store/NavigationContext.tsx` to `src/store/RouteResetContext.tsx`. Move the test file accordingly (`test/store/NavigationContext.test.tsx` → `test/store/RouteResetContext.test.tsx`). Update the import + JSX in `src/app.tsx`. Update the exported test seam `dedupPathPrefix()` — actually, *delete* it (the prefix was only used by the old listener and has no consumer in the new design).

**Rationale**:

- The name `NavigationProvider` was tied to its role as a port consumer (it subscribed to a `NavigationPort`). The new design has no port. The component's sole responsibility is "reset the store on route boundaries via React lifecycle"; `RouteResetProvider` describes that precisely.
- DIRECTIVE_001 (architectural integrity) favors names that match responsibilities. Leaving the name `NavigationProvider` after the port goes would create a small but lasting source of confusion for future readers ("which navigation? there's no NavigationPort in the codebase").
- The file rename has a finite cost: one import to update in `src/app.tsx`, one test file to rename. The benefit (clear naming for the lifetime of the codebase) outweighs the diff churn.

**Alternatives considered**:

1. **Keep `NavigationProvider` name + path**: Lower diff. Rejected — the name actively misleads. Future contributors will look for a `NavigationPort` it consumes and find none.
2. **Inline into `src/app.tsx`**: Smallest end-state surface. Rejected because it loses the testable component boundary. FR-004's production-lifecycle test wants to mount a single small component with a freshly-injected store; that's harder when the effect lives in `App` (testing `App` requires stubbing `Spicetify` globals). The provider component, even if trivial, is a useful unit-test target.

---

## §2 — FR-011 visual approach (resolves spec §9.2)

**Decision**: Enlarge the spinner from 32×32 to 64×64. Same colors (`--dedup-card-hover` ring base, `--dedup-button` rotating top), same animation, same border thickness ratio. The empty state remains unchanged in this mission.

**Rationale**:

- Live-verification screenshot evidence (`live-verification.2026-06-04.md` §NFR-006) showed the 32×32 spinner is visually present but small relative to the page area, and the loading↔empty pair was marginal at single-glance distinguishability. Doubling the spinner's footprint (4× area) gives loading a strong above-the-copy visual mass that empty does not have. The mass is static-recognizable (a partial ring shape) even without the rotation animation, so SC-2 holds at a static screenshot.
- C-003 allows "a basic spinner" — a larger basic spinner is still a basic spinner. No new motion design introduced.
- This is the lowest-diff option: one number changed in `LoadingView.module.scss`, plus a corresponding border-thickness adjustment to maintain visual balance (3px → 5px or 6px depending on live-tuning during the WP). No new elements, no new accessibility surface (the spinner is `aria-hidden="true"` already).
- The current loading-view existing test (`test/ui/LoadingView.test.tsx:43-50`) asserts the spinner has a non-empty `animation` style containing `infinite`. The size change does not affect that test; the test stays green without modification.

**Alternatives considered**:

1. **Add a static empty-state icon** (a glyph or SVG above the empty copy): Cleanly differentiates empty from loading by introducing a visual element only empty has. Rejected because (a) it adds a new element with its own accessibility considerations (alt text or aria-hidden) and (b) the simpler "enlarge spinner" change accomplishes the same SC-2 outcome by giving loading a stronger visual mass — the differentiation is symmetric either way. Carrying an icon decision to plan-phase didn't earn its keep.
2. **Layout re-shift** (move empty-state copy to a different vertical region): Subtle; depends on the existing page padding being noticeable enough. Rejected because the differentiation cue (vertical position) is weaker than the spinner-mass cue, and the diff (layout change in `EmptyView.module.scss`) is similar in size to the spinner change with weaker outcome.
3. **Belt-and-suspenders (enlarge spinner + add icon)**: Over-engineering. SC-2 only requires single-glance distinguishability; option 1 alone clears the bar based on the screenshot evidence. Reserving the icon for a future polish iteration if needed.

---

## §3 — FR-004 test placement (resolves spec §9.3)

**Decision**: The new production-lifecycle test lands in `test/store/RouteResetContext.test.tsx` (the renamed test file). It is a single new `it()` block added to the existing `describe('RouteResetProvider — ...')` group, with the title `'FR-004 — mounts with store pre-loaded into a non-idle state and resets to idle synchronously (no setPath call)'`.

**Rationale**:

- Co-locating the production-lifecycle test with the rest of the provider's tests is consistent with the prior mission's pattern (all provider behaviors tested in one file).
- The new test's shape is:
  1. Build a store, call `triggerLoad()` (or directly set state to a non-idle `loadState`), assert pre-mount state is non-idle.
  2. Render `<RouteResetProvider>` (no navigation prop, no `FakeNavigation`).
  3. Assert post-mount that `store.getState().loadState.kind === 'idle'`.
  4. **No `setPath`-equivalent call between render and assertion.** This is the load-bearing difference from the prior tests.
- The test fails today (against the old `NavigationProvider` + listener pattern) — the prior mission's design has no synchronous mount-time reset. The test passes after the FR-001 fix lands.
- For TDD discipline (NFR-001), this test is the canonical RED commit for FR-001/FR-003/FR-004.

**Alternatives considered**:

- Placing the new test in a separate file (`test/store/RouteResetContext.production-lifecycle.test.tsx`): Rejected. The test is one `it()` block; splitting the file isolates a feature artificially and breaks the "all provider tests in one place" pattern. The describe-grouping naturally separates the FR-004 test from the existing FR-008-from-FakeNav-events tests.

---

## §4 — Architecture-test fitness of the lifecycle approach

**Decision**: No changes required to `test/architecture.test.ts`. The new design respects every existing hexagonal-boundary rule.

**Verification**:

- `src/store/RouteResetContext.tsx` lives under `src/store/`. The current rule for `src/store/` forbids imports from `src/adapters/` and `src/ui/`. The new file imports only React + `./PlaylistsStoreContext` (also `src/store/`). Compliant.
- The 5 retired files (port, adapter, fakes, contract tests) reduce the surface; their removal cannot introduce new forbidden imports.
- `src/app.tsx`'s wiring change removes one `import { SpicetifyNavigation } from './adapters/spicetify-navigation'`. The retained imports (`createPlaylistsStore`, `PlaylistsStoreProvider`, `RouteResetProvider`, `SpicetifyPlaylistsLoader`, `DedupPage`) are unchanged in policy fitness.

**Verification command** (runs in CI): `npm run test:run -- test/architecture.test.ts`.

---

## §5 — DIRECTIVE_003 (decision documentation) — ADR plan

**Decision**: Two ADR file actions in this mission.

1. **ADR-0004 supersession**: Flip status header from `Accepted` to `Superseded by ADR-0005`. Append a new `## Supersession` section quoting:
   - The live-client diagnostic evidence (two distinct `SpicetifyNavigation.subscribe` stack traces across one navigate-away/back cycle, proving the React tree DOES re-mount on each Dedup navigation).
   - The mission-review.md DEFECT-1 root-cause analysis (production lifecycle is mount-after-navigation; subscription is always too late).
   - The §Alternatives.2 claim about "stays mounted across navigation" was based on the T021 live probe outcome captured in the WP-03 review note; that probe outcome is incorrect.

2. **ADR-0005 creation**: New file `.claude/adr/0005-react-lifecycle-reset.md` titled "Reset on Mount + Unmount via React Lifecycle". Standard ADR sections:
   - **Status**: Accepted
   - **Context**: The DEFECT-1 finding + the live-client diagnostic.
   - **Decision**: `useEffect(() => { reset(); return () => reset(); }, [reset])` in `RouteResetProvider`. Belt-and-suspenders: correct under the now-confirmed production behavior (tree re-mounts; mount-time reset fires) AND correct in the hypothetical future where the tree stays mounted (unmount cleanup fires on navigate-away; next mount lands on idle).
   - **Consequences**: positive (no port, no subscription, no closure-stale-ref class of bugs), negative (slight duplication of the reset() call site — both branches reset; benign given R-1 idempotence).
   - **Alternatives considered**: mount-only reset (drops the unmount cleanup), unmount-only reset (drops the mount-time catch-up), restore the port + listener with a corrected wasOnDedup-initial-value heuristic (rejected — fragile, since it depends on assumptions about Spicetify's internal navigation timing that we have no contract for).

**Rationale**: DIRECTIVE_003 mandates ADRs for load-bearing architectural decisions. The lifecycle-based design IS load-bearing — every future contributor who looks at `RouteResetProvider` and wonders "why is this so simple?" deserves to find the rationale in an ADR. The supersession is also load-bearing — readers of `0004-navigation-port.md` who wonder why we removed the port deserve the same.

C-007 mandates "reversed, not amended in place" — the file `0004-navigation-port.md` remains in the repository with its full original content; the status header is updated and the supersession section is appended. This preserves the decision history (DIRECTIVE_003) — readers see both the original direction and why it was reversed.

---

## §6 — Zero `[NEEDS CLARIFICATION]` markers

This mission's spec §9 listed three deferred research questions. All three are now resolved (§1, §2, §3 above). No `[NEEDS CLARIFICATION]` markers remain. Plan-phase research is complete.

---

## References

- `kitty-specs/dedup-page-live-client-polish-01KT6ZCR/mission-review.md` DEFECT-1
- `kitty-specs/dedup-page-live-client-polish-01KT6ZCR/live-verification.2026-06-04.md` §C.1, §NFR-006
- `kitty-specs/dedup-page-live-client-polish-01KT6ZCR/contracts/navigation-port.md` (the port contract being retired)
- `.claude/adr/0004-navigation-port.md` (the ADR being superseded)
- Charter: `.kittify/charter/charter.md` (DIRECTIVE_001, DIRECTIVE_003, DIRECTIVE_010, DIRECTIVE_030, DIRECTIVE_034, DIRECTIVE_036)
