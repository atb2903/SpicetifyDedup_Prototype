---
work_package_id: WP01
title: RouteResetProvider + production-lifecycle tests
dependencies: []
requirement_refs:
- FR-001
- FR-002
- FR-003
- FR-004
- FR-006
planning_base_branch: get_library
merge_target_branch: get_library
branch_strategy: Worktree per execution lane allocated by `finalize-tasks`; branch from `get_library`; merge back into `get_library`.
subtasks:
- T001
- T002
- T003
- T004
- T005
- T006
history:
- timestamp: '2026-06-04T20:07:25Z'
  actor: tasks
  note: Authored by /spec-kitty.tasks
authoritative_surface: src/store/RouteResetContext.tsx
execution_mode: code_change
mission_slug: dedup-navigation-reset-hotfix-01KT9NSW
owned_files:
- src/store/RouteResetContext.tsx
- test/store/RouteResetContext.test.tsx
priority: P0
tags: []
---

# WP01 — RouteResetProvider + production-lifecycle tests

## Objective

Close DEFECT-1 from the prior mission. Replace the navigation-port-based listener (whose `wasOnDedup` initial value is permanently `true` in production, so its reset condition is permanently unreachable) with a React-lifecycle reset bridge:

```tsx
useEffect(() => {
  reset();              // FR-001: mount-time reset
  return () => reset(); // FR-002: unmount-time cleanup
}, [reset]);
```

Drive the implementation test-first (NFR-001 / DIRECTIVE_034): write five failing tests first, watch them fail, then implement the provider.

## Branch Strategy

- **Planning base**: `get_library`
- **Merge target**: `get_library`
- **Execution worktree**: allocated by `finalize-tasks` (see `lanes.json`).
- **Implementation entry command**: `spec-kitty agent action implement WP01 --agent <name> --mission dedup-navigation-reset-hotfix-01KT9NSW`

## Context

This WP creates **two new files** and touches **nothing else**:

- `src/store/RouteResetContext.tsx` (new)
- `test/store/RouteResetContext.test.tsx` (new)

The retirement of the prior `NavigationContext.tsx`, the navigation port + adapter, and the wiring change in `src/app.tsx` is **WP02's responsibility**. WP01 deliberately leaves the prior files in place so its DoD is verifiable in isolation (the new tests pass against the new file; the prior tests still run unchanged).

### Authoritative references (READ THESE BEFORE STARTING)

1. **`kitty-specs/dedup-navigation-reset-hotfix-01KT9NSW/contracts/route-reset-provider.md`** — component signature (§1), behavioral contract (§2), full test plan (§3), architecture-test compliance (§4), JSDoc requirements (§5).
2. **`kitty-specs/dedup-navigation-reset-hotfix-01KT9NSW/data-model.md`** §1, §3 — type definitions; `RouteResetProviderProps` has only `children`.
3. **`kitty-specs/dedup-navigation-reset-hotfix-01KT9NSW/spec.md`** §3 (FR-001..FR-004, FR-006), §2 (user flows).
4. **`kitty-specs/dedup-navigation-reset-hotfix-01KT9NSW/research.md`** §1, §3 — rationale for the rename and the test placement.
5. **Prior provider source** at `src/store/NavigationContext.tsx` — read it once to understand what's being replaced. Do **not** copy the listener body or the `try/catch` around `currentPath()` / `subscribe()`. The new design has neither.
6. **`src/store/playlists-store.ts`** — `reset()` action signature and R-1 idempotence; the `usePlaylistsStore` hook in `PlaylistsStoreContext.tsx`.
7. **Prior test** at `test/store/NavigationContext.test.tsx` — use as a structural template (imports, render setup, store wiring) but discard the FakeNavigation / `setPath` apparatus entirely.

### Why this design (one paragraph for the implementer)

In production, Spicetify changes `Platform.History.location.pathname` to `/spicetify-dedup` AND fires its history listeners *before* mounting the custom-app React tree. By the time the prior `NavigationProvider`'s `useEffect` ran, `currentPath()` was already `/spicetify-dedup`, so `wasOnDedup` initialised to `true`. The inbound navigation event had already happened. The reset condition `!wasOnDedup && isOnDedup` was permanently unreachable. The 2026-06-04 live diagnostic confirmed the React tree DOES re-mount on each Dedup navigation (two distinct `SpicetifyNavigation.subscribe` calls captured across one navigate-away/back cycle), which makes the mount-time reset the load-bearing path. The unmount cleanup is belt-and-suspenders for the hypothetical future where Spotify ever keeps the tree mounted across navigation. Both branches are safe because `reset()` is idempotent from idle (R-1).

## Subtasks

### T001 — RED: Failing test T-new-1 (production-lifecycle mount-time reset, parametrised)

**Purpose**: This is the canonical RED commit for FR-001 / FR-003 / FR-004. It's the test the prior mission's suite was structurally missing — mount with a pre-non-idle store, no `setPath` call between mount and assertion.

**Steps**:

1. Create `test/store/RouteResetContext.test.tsx` (new file).
2. Top-level structure: imports (React, render from @testing-library/react, vitest helpers, `createPlaylistsStore` from `src/store/playlists-store`, `PlaylistsStoreProvider`, `RouteResetProvider` — note: this import will fail typecheck until T005 lands, which is the expected RED state), a fake loader factory, a `describe('RouteResetProvider — production-lifecycle reset')` block.
3. Inside, use `describe.each([['idle'], ['loading'], ['loaded'], ['empty'], ['failed']])` to parametrise over five source-state keys.
4. For each non-idle state, drive the store into that state before rendering (use the store's public actions: `triggerLoad()` for `loading`; `await` it for `loaded` / `empty` depending on the fake loader's resolution; reject the fake loader for `failed`).
5. For `idle`, do nothing pre-mount — the store starts at idle.
6. Render `<PlaylistsStoreProvider store={store}><RouteResetProvider>...</RouteResetProvider></PlaylistsStoreProvider>`.
7. Assert `store.getState().loadState.kind === 'idle'` post-render — synchronously (no `await`, no `act()` wait inside the assertion).
8. Also assert the loader's `callCount` is unchanged from its pre-render value (the reset must not trigger a load).

**Files**: `test/store/RouteResetContext.test.tsx` (new file, ~140 lines just for this test plus shared setup).

**Validation**:
- [ ] Test file imports `RouteResetProvider` from `../../src/store/RouteResetContext` (path will not exist yet — that's expected RED).
- [ ] Parametrisation covers all five state keys.
- [ ] Each parametrised case ends with `expect(store.getState().loadState.kind).toBe('idle')`.
- [ ] No `FakeNavigation`, no `setPath()`, no navigation-port stubbing anywhere in this test file.

**Edge cases**:
- For `loading` source state: drive `triggerLoad()` but do NOT await; the store is in `loading` at render time. The reset transitions it to `idle`. Verify the in-flight load promise resolution doesn't leak post-reset (this is the same scenario quickstart B.4 covers at the live level — the reset wins; the late loader resolution lands on an already-reset store and is a benign no-op per the store's transition guards).
- For `empty` source state: the fake loader must resolve with an empty `RawCollection` shape that the loader port maps to `{ kind: 'empty' }`. If you're unsure of the exact shape, mimic the pattern from the existing `test/store/playlists-store.test.ts`.
- For `failed` source state: the fake loader rejects with a `PlaylistsLoaderError` (mirror the existing failed-state tests).

### T002 — RED: Failing test T-new-2 (mount/unmount cycles each reset; loader call count exact)

**Purpose**: Drive the FR-002 unmount-cleanup branch. Verifies two mount cycles each trigger a reset and that no extra loader calls are induced by the resets.

**Steps**:

1. Inside the same test file, in a new `describe('RouteResetProvider — mount/unmount cycles')` block, write a test that:
   - Creates a store with a fake loader (callCount tracked).
   - Pre-loads to `loaded` (await `triggerLoad`).
   - Records `loader.callCount` as `c0`.
   - Renders the provider (RTL `render` returns `unmount`).
   - Asserts `store.getState().loadState.kind === 'idle'` (the mount-time reset fired).
   - Re-pre-loads to `loaded` again (await `triggerLoad`).
   - Records `loader.callCount` as `c1`. `c1` should be `c0 + 1` (one extra load).
   - Calls `unmount()`.
   - Asserts `store.getState().loadState.kind === 'idle'` again (the unmount cleanup fired).
   - Asserts `loader.callCount === c1` (cleanup didn't trigger an extra load — verifies R-1..R-5 loader-isolation invariants).

**Files**: same file as T001 (append the new `describe`).

**Validation**:
- [ ] Two `expect(store.getState().loadState.kind).toBe('idle')` checks — one post-mount, one post-unmount.
- [ ] Loader callCount asserted exactly (`c0 + 1` after the second pre-load, unchanged after unmount).
- [ ] No `act()` wraps required — the resets are synchronous.

### T003 — RED: Failing test T-new-3 (synchronous mount-time reset)

**Purpose**: Important nuance: React's `useEffect` runs *after* the commit phase, so a naive reading is that the assertion needs to be inside `await act(async () => {})`. In practice with `@testing-library/react` 16 + happy-dom 20, the `render()` call flushes effects synchronously before returning. T-new-3 locks this in as a contract — if a future React version delays the effect, this test fails loudly and the implementer must reconsider whether to switch to `useLayoutEffect`.

**Steps**:

1. In another `describe('RouteResetProvider — synchronous reset on mount')` block, write:
   - Create store; pre-load to `loaded`.
   - Call `render(<RouteResetProvider>...)` — capture the return value but do NOT `await` anything.
   - Immediately on the next line: `expect(store.getState().loadState.kind).toBe('idle')`.
2. Do NOT use `act(async () => {})`. The point of the test is that you don't need to.
3. Comment in the test explaining why this is a contract assertion (one short line; future reader needs to know not to "fix" the test by adding `await act`).

**Files**: same file (append).

**Validation**:
- [ ] No `await` anywhere in the test body.
- [ ] No `act()` wrap.
- [ ] If T-new-3 fails when the implementation lands (T005), STOP — the production behavior requires the synchronous reset; revisit whether `useEffect` is the right hook or whether `useLayoutEffect` is needed. (Don't pre-emptively switch; first see if the contract holds.)

### T004 — RED: Port-forward T-survive-1..4 to the new mechanism

**Purpose**: Cover the four surviving behaviors from the prior provider's tests in the new mechanism (no FakeNavigation; no `setPath`). See `contracts/route-reset-provider.md` §3 "Existing tests that survive (rewritten)".

**Steps**:

1. **T-survive-1** (loader isolation): `describe('RouteResetProvider — loader isolation')` → mount + unmount; assert `loader.callCount` unchanged from pre-mount (no load triggered by mount-time or unmount reset).
2. **T-survive-2** (reset on unmount): explicitly tested by T-new-2 already. **Skip a duplicate test** — note in a code comment in T-new-2 that it also covers T-survive-2.
3. **T-survive-3** (renders children): `describe('RouteResetProvider — children pass-through')` → render `<RouteResetProvider><div data-testid="child" /></RouteResetProvider>`; assert `screen.getByTestId('child')` resolves.
4. **T-survive-4** (idempotent mount from idle): part of T-new-1's `'idle'` parametrised case — the cold-start cold-mount scenario. **Skip a duplicate test** — note that the `idle` case in T-new-1 covers T-survive-4.

**Files**: same file (append). Net new tests from T004: T-survive-1 + T-survive-3 (two new `describe` blocks).

**Validation**:
- [ ] T-survive-1 asserts `loader.callCount` exact.
- [ ] T-survive-3 asserts the child element is in the DOM.
- [ ] No FakeNavigation, no setPath, no NavigationPort references anywhere in the test file.

### T005 — GREEN: Implement `src/store/RouteResetContext.tsx`

**Purpose**: Make T001-T004 turn green.

**Steps**:

1. Create the file at `src/store/RouteResetContext.tsx`.
2. Implement exactly per `contracts/route-reset-provider.md` §1:
   ```tsx
   import React, { useEffect } from 'react';
   import { usePlaylistsStore } from './PlaylistsStoreContext';

   interface RouteResetProviderProps {
     children: React.ReactNode;
   }

   export function RouteResetProvider({
     children,
   }: RouteResetProviderProps): React.ReactElement {
     const reset = usePlaylistsStore((s) => s.reset);
     useEffect(() => {
       reset();
       return () => reset();
     }, [reset]);
     return <>{children}</>;
   }
   ```
3. Add JSDoc on the exported function per `contracts/route-reset-provider.md` §5 (one-line summary, `@param children`, idempotence note, ADR-0005 reference).
4. Optional file-level JSDoc explaining the layer placement (`src/store/`) and the no-cross-layer-import rule. Keep it concise; the body of the file is small.

**Files**: `src/store/RouteResetContext.tsx` (new file, ~30-50 lines including JSDoc).

**Validation**:
- [ ] No imports from `src/adapters/` or `src/ui/` (architecture test gate).
- [ ] No `NavigationPort` reference.
- [ ] No `try/catch` around any host probe (no host probe exists in this design).
- [ ] No `settings.json` import (no dedupPathPrefix in this design).
- [ ] Exported function has JSDoc.
- [ ] Tests T001-T004 all pass when this file lands.

### T006 — Verify WP01

**Purpose**: Lock in the green state.

**Steps**:

1. Run `npm run test:run -- test/store/RouteResetContext.test.tsx` — confirm all parametrised cases + named tests pass.
2. Run `npm run test:coverage` — confirm 100/100/100/100 on `src/store/RouteResetContext.tsx` specifically (and on the test file).
3. Run `npm run typecheck` — confirm zero errors.
4. (Optional, fast sanity check) Run `npm run test:run` (the full suite) — the prior provider's tests still run (they're not touched in this WP); they should still pass since this WP doesn't delete anything they depend on.

**Files**: none (verification only).

**Validation**:
- [ ] All four commands exit 0.
- [ ] No "uncovered line" warning on the new file.
- [ ] No new architecture-test failures.

## Definition of Done

- [ ] All six subtasks complete.
- [ ] `npm run test:run -- test/store/RouteResetContext.test.tsx` exits 0.
- [ ] `npm run test:coverage` reports 100/100/100/100 (or per-file 100% on the new file at minimum; the global coverage gate stays green because the old NavigationContext.tsx is still present and still covered by its tests).
- [ ] `npm run typecheck` exits 0.
- [ ] The test file contains zero references to `FakeNavigation`, `setPath`, `NavigationPort`, `currentPath`, or `subscribe` (a final `grep` confirms).
- [ ] JSDoc on `RouteResetProvider` per `contracts/route-reset-provider.md` §5.
- [ ] Commit history shows the RED commit (T001-T004) before the GREEN commit (T005), preserving TDD discipline per NFR-001.

## TDD Commit Sequencing (mandatory per NFR-001)

Two commits minimum in this WP:

1. **RED commit**: `test(route-reset): add failing production-lifecycle tests for FR-001/FR-002/FR-003/FR-004` — contains the test file with T001-T004 in place. The build typecheck will fail (no RouteResetProvider exists yet) — that's the expected RED signal. Commit anyway; this is the failing-test commit that NFR-001 audits.
2. **GREEN commit**: `feat(route-reset): implement RouteResetProvider with mount+unmount reset (FR-001/FR-002)` — contains the new source file. The build now typechecks and tests pass.

Optionally a third commit for JSDoc or minor cleanup, but the RED→GREEN structure must be observable in `git log` for the WP02 reviewer.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| `useEffect` runs *after* render, so synchronous-reset contract (T-new-3) might fail | If it fails, do NOT add `await act()` — that masks the contract. Instead investigate: with `@testing-library/react` 16 + happy-dom 20 + React 19, effects flush before `render()` returns. If a future React version changes this, the contract is broken and the implementer should switch to `useLayoutEffect` (or escalate to plan amendment). |
| Coverage gate fails because the test file shares a per-file coverage line | Use `vi.coverage` not at issue — the test file is exercised by the runner, source file by tests. Verify with `npm run test:coverage` before commit. |
| Architecture test fails because of a forbidden import | Confirm only `react` and `./PlaylistsStoreContext` are imported in the new source file. Do not import from `../ports/` or `../adapters/`. |
| Forgetting JSDoc fails NFR-008 review | Use the template in `contracts/route-reset-provider.md` §5 as the literal docstring; do not omit. |

## Reviewer Guidance

A reviewer of WP01 should check:

1. RED→GREEN commit ordering in `git log` for this WP's branch.
2. The new source file has no cross-layer imports (`grep -E "from '\\.\\./adapters\|from '\\.\\./ui\|from '\\.\\./ports" src/store/RouteResetContext.tsx` returns zero).
3. The test file contains the parametrised T-new-1 over five states.
4. The synchronous-reset contract (T-new-3) is asserted without `await` / `act()`.
5. Coverage 100% on the new file.
6. JSDoc on `RouteResetProvider` is present and references ADR-0005.

## When done

1. From inside the WP01 worktree: `spec-kitty agent action mark-done WP01 --agent <name> --mission dedup-navigation-reset-hotfix-01KT9NSW`.
2. Verify status transition: `spec-kitty status --mission dedup-navigation-reset-hotfix-01KT9NSW --json`.
3. Trigger review per the project's mission flow (the user or the implement-review skill drives this).
