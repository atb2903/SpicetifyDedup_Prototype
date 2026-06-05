---
work_package_id: WP02
title: Wire RouteResetProvider in app.tsx + retire navigation port
dependencies:
- WP01
requirement_refs:
- FR-005
- FR-006
planning_base_branch: get_library
merge_target_branch: get_library
branch_strategy: Planning artifacts for this feature were generated on get_library. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into get_library unless the human explicitly redirects the landing branch.
subtasks:
- T007
- T008
- T009
- T010
- T011
agent: "claude:opus-4-7:reviewer:reviewer"
shell_pid: "372168"
history:
- timestamp: '2026-06-04T20:07:25Z'
  actor: tasks
  note: Authored by /spec-kitty.tasks
authoritative_surface: src/app.tsx
execution_mode: code_change
mission_slug: dedup-navigation-reset-hotfix-01KT9NSW
owned_files:
- src/app.tsx
- src/store/NavigationContext.tsx
- src/ports/navigation.ts
- src/adapters/spicetify-navigation.ts
- test/store/NavigationContext.test.tsx
- test/adapters/spicetify-navigation.test.ts
- test/adapters/fake-navigation.ts
- test/ports/navigation-port-contract.test.ts
- test/app.test.tsx
priority: P0
tags: []
---

# WP02 — Wire RouteResetProvider in app.tsx + retire navigation port

## Objective

Make `src/app.tsx` use the new `RouteResetProvider` (created in WP01) instead of `NavigationProvider`. Delete the five retired files plus the prior provider's test file. Verify SC-3 grep returns zero hits for the retired symbols. Keep all global gates green.

## Branch Strategy

- **Planning base**: `get_library`
- **Merge target**: `get_library`
- **Execution worktree**: allocated by `finalize-tasks`. Because this WP depends on WP01, the worktree branches from a base that includes WP01's merged tip.
- **Implementation entry command**: `spec-kitty agent action implement WP02 --agent <name> --mission dedup-navigation-reset-hotfix-01KT9NSW`

## Context

WP01 created `src/store/RouteResetContext.tsx` and `test/store/RouteResetContext.test.tsx`. It deliberately did NOT touch the old files or rewire `app.tsx`. WP02 closes the loop:

- **Rewire** `src/app.tsx`: drop `NavigationProvider` + `SpicetifyNavigation` imports/usage; mount `<RouteResetProvider>` instead.
- **Delete** five source/test files + the prior provider's test file (seven files total, listed below).
- **Update** `test/app.test.tsx` to reflect the new provider boundary.

After WP02 merges, the SC-3 grep (`NavigationPort | SpicetifyNavigation | FakeNavigation | navigation-port-contract`) returns **zero hits** in `src/` and `test/`.

### Authoritative references (READ THESE BEFORE STARTING)

1. **`kitty-specs/dedup-navigation-reset-hotfix-01KT9NSW/spec.md`** §3 (FR-005, FR-006), §5 (Files retired list), §4 (SC-3).
2. **`kitty-specs/dedup-navigation-reset-hotfix-01KT9NSW/plan.md`** Project Structure section (the file-by-file edit list).
3. **`kitty-specs/dedup-navigation-reset-hotfix-01KT9NSW/data-model.md`** §2 (NavigationPort DELETED) and §5 (module-boundary contract unchanged).
4. **Current `src/app.tsx`** — read end-to-end before editing. The current shape:
   ```tsx
   import { NavigationProvider } from './store/NavigationContext';
   import { SpicetifyNavigation } from './adapters/spicetify-navigation';
   const productionNavigation = new SpicetifyNavigation();
   const App = () => (
     <PlaylistsStoreProvider store={productionStore}>
       <NavigationProvider navigation={productionNavigation}>
         <DedupPage />
       </NavigationProvider>
     </PlaylistsStoreProvider>
   );
   ```
5. **`src/store/RouteResetContext.tsx`** (created in WP01) — the import target.
6. **Current `test/app.test.tsx`** — read to see what stubbing exists for `SpicetifyNavigation` / `NavigationProvider`; you'll need to remove that stubbing.

### Why this is one WP

Splitting the rewire from the deletions would break typecheck mid-merge: if `src/app.tsx` still imports from `./store/NavigationContext` but that file is deleted, the build fails. The rewire and the deletions must land in the same merge, so they're one WP.

## Subtasks

### T007 — Edit `src/app.tsx`: swap providers, drop SpicetifyNavigation

**Purpose**: Replace the old provider with the new one and drop the now-unused adapter construction.

**Steps**:

1. Open `src/app.tsx`.
2. Remove these imports:
   ```ts
   import { NavigationProvider } from './store/NavigationContext';
   import { SpicetifyNavigation } from './adapters/spicetify-navigation';
   ```
3. Remove the `productionNavigation` constant declaration:
   ```ts
   const productionNavigation = new SpicetifyNavigation();
   ```
4. Add an import for the new provider:
   ```ts
   import { RouteResetProvider } from './store/RouteResetContext';
   ```
5. Rewrite the JSX:
   ```tsx
   const App = () => (
     <PlaylistsStoreProvider store={productionStore}>
       <RouteResetProvider>
         <DedupPage />
       </RouteResetProvider>
     </PlaylistsStoreProvider>
   );
   ```
6. Update the file-level JSDoc to reflect the new wiring (drop the paragraph about `productionNavigation` / `SpicetifyNavigation`; reword the "Provider order" paragraph to reference `RouteResetProvider` instead of `NavigationProvider`).

**Files**: `src/app.tsx`.

**Validation**:
- [ ] No reference to `NavigationProvider`, `SpicetifyNavigation`, or `productionNavigation` in the file after edit.
- [ ] `RouteResetProvider` is imported and used as the inner provider.
- [ ] The file-level JSDoc has no stale claims (re-read it after edit; if a sentence still references `productionNavigation`, fix it).

### T008 — Edit `test/app.test.tsx`: update stubs and assertions

**Purpose**: The app test currently stubs `NavigationProvider` / `SpicetifyNavigation` to isolate the App's mounting concern. Update to stub / assert against `RouteResetProvider` instead.

**Steps**:

1. Open `test/app.test.tsx`.
2. Find any `vi.mock('./store/NavigationContext', ...)` or equivalent — remove or rewrite to `vi.mock('./store/RouteResetContext', ...)` if a mock is still needed.
3. Find any `vi.mock('./adapters/spicetify-navigation', ...)` — delete entirely (the adapter is gone).
4. Update any assertion that looks for `<NavigationProvider>` in the rendered output — change to `<RouteResetProvider>`.
5. Run the test in isolation (`npm run test:run -- test/app.test.tsx`) to verify it still passes.

**Files**: `test/app.test.tsx`.

**Validation**:
- [ ] No `NavigationProvider`, `SpicetifyNavigation`, `FakeNavigation`, or navigation-port references in the file.
- [ ] The test asserts something about the new `RouteResetProvider` boundary (presence in the tree, or that it wraps `DedupPage`).
- [ ] Test passes in isolation.

### T009 — Delete seven retired files

**Purpose**: Remove the navigation-port direction entirely.

**Steps**:

Delete these files (use `git rm` or the file-deletion equivalent in your environment):

1. `src/ports/navigation.ts`
2. `src/adapters/spicetify-navigation.ts`
3. `src/store/NavigationContext.tsx`
4. `test/adapters/spicetify-navigation.test.ts`
5. `test/adapters/fake-navigation.ts`
6. `test/ports/navigation-port-contract.test.ts`
7. `test/store/NavigationContext.test.tsx`

**Files**: seven deletions.

**Validation**:
- [ ] All seven files removed from the working tree.
- [ ] No other files reference any of these paths (verified by T011 grep).
- [ ] After deletion, `src/ports/` retains only `playlists-loader.ts`; `test/ports/` retains only `playlists-loader-contract.test.ts`; `test/adapters/` retains `spicetify-playlists-loader.test.ts`, `fake-playlists-loader.test.ts`, and `fixtures/`.

### T010 — Verify global gates

**Purpose**: Confirm no regression sneaks in via the deletions or the rewire.

**Steps**:

1. `npm run test:run` — full suite. Expected: zero failures.
2. `npm run test:coverage` — full coverage report. Expected: 100/100/100/100 across the runner gate (the deleted files no longer count toward coverage; the new RouteResetProvider from WP01 carries its own 100%).
3. `npm run typecheck` — zero errors.
4. `npm run test:run -- test/architecture.test.ts` — architecture test passes (no rule edit was needed; deletions reduce surface).
5. `npm run build` — build succeeds.

**Files**: none (verification only).

**Validation**:
- [ ] All five commands exit 0.
- [ ] No `tsc` complaint about a missing module (would indicate an orphaned import in some file not in the owned-files list — investigate before patching outside ownership).
- [ ] Coverage gate stays green at the per-file and global level.

### T011 — SC-3 grep verification

**Purpose**: Definitive evidence that the retirement is complete.

**Steps**:

1. Run:
   ```bash
   grep -rnE "NavigationPort|SpicetifyNavigation|FakeNavigation|navigation-port-contract" src test
   ```
2. Expected: zero output (`grep` exits 1, which is the "no match" exit code — that's the PASS signal).
3. Also verify no orphan reference to the deleted file paths:
   ```bash
   grep -rn -E "ports/navigation|adapters/spicetify-navigation|store/NavigationContext|adapters/fake-navigation" src test
   ```
   Expected: zero output.

**Files**: none (verification only).

**Validation**:
- [ ] Both `grep` commands return zero hits.
- [ ] Record the grep transcript in the WP commit message or PR description as evidence for SC-3.

## Definition of Done

- [ ] All five subtasks complete.
- [ ] `src/app.tsx` mounts `RouteResetProvider`; no references to the retired port/adapter remain.
- [ ] All seven retired files deleted.
- [ ] `npm run test:run`, `npm run test:coverage`, `npm run typecheck`, `npm run build`, architecture test — all exit 0.
- [ ] SC-3 grep returns zero hits.
- [ ] `test/app.test.tsx` updated to reflect the new provider; passes in isolation.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Typecheck fails because some file outside the owned-files list imports from a deleted path | Run `npm run typecheck` after every deletion sub-step. If a missing-module error points to a file outside `owned_files`, STOP — investigate and report; do not silently extend ownership. |
| `test/app.test.tsx` stubs may have subtle dependencies on `NavigationProvider`'s exported shape | Read the file completely before editing; understand each `vi.mock` block. Prefer minimal stubbing — if the test can run without mocking RouteResetProvider, drop the mock. |
| Coverage gate dips because one of the retained tests was inadvertently coupled to deleted code | If coverage drops below 100% on any retained file, investigate which line is now uncovered and decide whether the test needs to be updated. Do not lower the gate. |
| Forgotten import in app.tsx after rewrite (e.g. stale `SpicetifyNavigation` import the editor missed) | T011's grep catches it. Also `npm run typecheck` flags unused imports under strict mode (config-dependent — if TS doesn't flag, ESLint typically does in this repo). |

## Reviewer Guidance

A reviewer of WP02 should check:

1. `src/app.tsx` diff shows clean swap (NavigationProvider → RouteResetProvider; SpicetifyNavigation imports gone; `productionNavigation` gone).
2. The seven deletions are in the diff.
3. `git log` for this WP shows the deletion + rewire as ideally one commit (or a tightly bounded sequence — the goal is "atomic merge").
4. SC-3 grep transcript is recorded.
5. `npm run test:coverage` artifact (or output snippet) confirms 100/100/100/100.

## When done

1. From inside the WP02 worktree: `spec-kitty agent action mark-done WP02 --agent <name> --mission dedup-navigation-reset-hotfix-01KT9NSW`.
2. Verify status: `spec-kitty status --mission dedup-navigation-reset-hotfix-01KT9NSW --json`.
3. Trigger review per the project's mission flow.

## Activity Log

- 2026-06-05T09:36:05Z – claude:opus-4-7:implementer:implementer – shell_pid=369622 – Started implementation via action command
- 2026-06-05T09:41:31Z – claude:opus-4-7:implementer:implementer – shell_pid=369622 – Ready for review: app.tsx swap + 7-file retirement; SC-3 grep zero hits; gates green (402 tests, 100/100/100/100 coverage, tsc clean, build success); commit 38dfce9
- 2026-06-05T09:42:10Z – claude:opus-4-7:reviewer:reviewer – shell_pid=372168 – Started review via action command
- 2026-06-05T09:44:59Z – claude:opus-4-7:reviewer:reviewer – shell_pid=372168 – Review passed: RouteResetProvider wired in src/app.tsx, 7 retired files deleted, SC-3 grep zero hits (re-verified), 402/402 tests, 100/100/100/100 coverage, tsc clean, architecture 60/60, build green. The WP01-file JSDoc edit (one-word swap removing the literal SpicetifyNavigation.subscribe token) is minimal SC-3-driven scope-crossing — accepted.
