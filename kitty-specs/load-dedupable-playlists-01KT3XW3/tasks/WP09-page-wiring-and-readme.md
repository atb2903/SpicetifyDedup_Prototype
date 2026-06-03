---
work_package_id: WP09
title: Page Wiring, Hello World Cleanup, README
dependencies:
- WP05
- WP07
- WP08
requirement_refs:
- FR-010
- FR-011
- NFR-002
- NFR-003
planning_base_branch: get_library
merge_target_branch: get_library
branch_strategy: Planning artifacts for this feature were generated on get_library. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into get_library unless the human explicitly redirects the landing branch.
subtasks:
- T035
- T036
- T037
- T038
agent: "claude"
shell_pid: "154091"
history:
- timestamp: '2026-06-02T11:11:28Z'
  action: created
  by: spec-kitty.tasks
  note: Initial WP scaffold generated from /spec-kitty.tasks for mission load-dedupable-playlists-01KT3XW3.
authoritative_surface: src/ui/DedupPage.tsx
execution_mode: code_change
mission_id: 01KT3XW3AWY8W0YJKCE9TYNQKX
mission_slug: load-dedupable-playlists-01KT3XW3
owned_files:
- src/app.tsx
- src/ui/DedupPage.tsx
- test/ui/DedupPage.test.tsx
- test/app.test.tsx
- README.md
tags: []
---

# WP09 — Page Wiring, Hello World Cleanup, README

## Objective

Bring the feature live. Specifically:

- Create `DedupPage` — the top-level page component that routes the store's `LoadState.kind` to the right view (`IdleView` / `LoadingView` / `LoadedView` / `EmptyView` / `FailedView`).
- Replace `src/app.tsx`'s Hello World with `<DedupPage />` wrapped in `<PlaylistsStoreProvider store={productionStore}>` where the production store is created with `SpicetifyPlaylistsLoader`.
- Delete the now-superseded `test/app.test.tsx` (the Hello World smoke test). The `DedupPage` test replaces it.
- Verify the full suite passes and coverage remains 100 %.
- Update the README to describe the new page behavior.
- Run the live verification: open Spotify with the extension loaded, confirm zero pre-trigger fetches in DevTools Network, click Load, verify the playlist list appears, force a Platform failure and verify the failure state + retry work.

This is the closing WP. After WP09 lands, the mission is ready for `/spec-kitty.accept` and `/spec-kitty.merge`.

## Branch Strategy

Planning base = merge target = `get_library`. The execution agent invokes `spec-kitty agent action implement WP09 --agent <name>`; the runtime resolves the lane and workspace path from `lanes.json`. No git operations are performed by the agent — the user owns commits.

## Context

`DedupPage` is the simplest possible router: a switch on `loadState.kind`. It does not render layout chrome, headers, or navigation — the Spicetify Custom App harness provides the surrounding chrome. The page is mounted by `src/app.tsx` (whose default export is the page component).

The production singleton is created exactly once: at module load of `src/app.tsx`. Constructing the singleton instantiates `SpicetifyPlaylistsLoader`, but the adapter's constructor does no work — no `Spicetify.*` access happens until `triggerLoad` is invoked. SC-6 is preserved.

The live verification step (T038) requires a working dev environment: Spotify installed, the extension registered (`spicetify config custom_apps spicetify-dedup` + `spicetify apply`), and `npm run watch` running.

## Detailed guidance per subtask

### T035 — Wire singleton store + replace Hello World

**Purpose**: Make the app actually render the Dedup page in production.

**Steps**:

1. Update `src/app.tsx`:

   ```tsx
   import React from 'react';
   import { DedupPage } from './ui/DedupPage';
   import { createPlaylistsStore, PlaylistsStoreProvider } from './store/playlists-store';
   import { SpicetifyPlaylistsLoader } from './adapters/spicetify-playlists-loader';

   const productionStore = createPlaylistsStore(new SpicetifyPlaylistsLoader());

   const App = () => (
     <PlaylistsStoreProvider store={productionStore}>
       <DedupPage />
     </PlaylistsStoreProvider>
   );

   export default App;
   ```

2. Confirm `src/app.tsx`'s import surface respects the architecture rules:
   - It is in `src/` directly (not under `domain/`, `ports/`, `store/`, etc.), so the architecture test allows it to import from any layer.
   - It is the *only* file that imports `SpicetifyPlaylistsLoader`; verify by `grep -r "from.*spicetify-playlists-loader" src/ test/` — should return only `src/app.tsx` and `test/adapters/spicetify-playlists-loader.test.ts`.

3. Run `npm run test:run`. The architecture test should still be green.

**Files**: `src/app.tsx` (modify).

**Validation**:

- [ ] `src/app.tsx` mounts `DedupPage` inside the provider.
- [ ] The singleton is created at module-load (not lazily); but constructing the adapter is side-effect-free.
- [ ] Architecture test still green.

### T036 — TDD `DedupPage` + test

**Purpose**: A simple switch over `loadState.kind` that picks the right view.

**Steps**:

1. Test first. Create `test/ui/DedupPage.test.tsx`:

   ```tsx
   import { describe, it, expect } from 'vitest';
   import { render, screen, fireEvent } from '@testing-library/react';
   import React from 'react';
   import { DedupPage } from '../../src/ui/DedupPage';
   import { createPlaylistsStore, PlaylistsStoreProvider } from '../../src/store/playlists-store';
   import { FakePlaylistsLoader } from '../../src/adapters/fake-playlists-loader';
   import { PlaylistsLoaderError } from '../../src/domain/errors';

   const make = (variant: 'success' | 'empty' | 'failure') => {
     const loader = variant === 'failure'
       ? new FakePlaylistsLoader({ kind: 'failure', throws: new PlaylistsLoaderError('host-unavailable', 'x') })
       : new FakePlaylistsLoader({
           kind: 'success',
           playlists: variant === 'success' ? [/* some playlist */] : [],
           likedSongs: variant === 'success' ? { trackCount: 1 } : { trackCount: 0 },
         });
     return { loader, store: createPlaylistsStore(loader) };
   };

   describe('DedupPage', () => {
     it('routes idle → IdleView (Load button present)', () => {
       const { store } = make('success');
       render(<PlaylistsStoreProvider store={store}><DedupPage /></PlaylistsStoreProvider>);
       expect(screen.getByRole('button', { name: /load/i })).toBeInTheDocument();
     });

     it('routes loading → LoadingView (status role)', async () => {
       const { store } = make('success');
       const triggerPromise = store.getState().triggerLoad();
       render(<PlaylistsStoreProvider store={store}><DedupPage /></PlaylistsStoreProvider>);
       expect(screen.getByRole('status')).toBeInTheDocument();
       await triggerPromise;
     });

     it('routes loaded → LoadedView (list visible)', async () => {
       const { store } = make('success');
       await store.getState().triggerLoad();
       render(<PlaylistsStoreProvider store={store}><DedupPage /></PlaylistsStoreProvider>);
       expect(screen.getByText('Liked Songs')).toBeInTheDocument();
     });

     it('routes empty → EmptyView (distinct copy)', async () => {
       const { store } = make('empty');
       await store.getState().triggerLoad();
       render(<PlaylistsStoreProvider store={store}><DedupPage /></PlaylistsStoreProvider>);
       expect(screen.getByText(/no dedup-eligible/i)).toBeInTheDocument();
     });

     it('routes failed → FailedView (alert role)', async () => {
       const { store } = make('failure');
       await store.getState().triggerLoad();
       render(<PlaylistsStoreProvider store={store}><DedupPage /></PlaylistsStoreProvider>);
       expect(screen.getByRole('alert')).toBeInTheDocument();
       expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
     });

     it('end-to-end: idle → trigger → loaded transition is visible in the rendered DOM', async () => {
       const { store } = make('success');
       const { rerender, container } = render(<PlaylistsStoreProvider store={store}><DedupPage /></PlaylistsStoreProvider>);
       // Initial: Load button.
       expect(screen.getByRole('button', { name: /load/i })).toBeInTheDocument();
       // Click to trigger; wait for completion.
       fireEvent.click(screen.getByRole('button', { name: /load/i }));
       await new Promise((r) => setTimeout(r, 0));
       rerender(<PlaylistsStoreProvider store={store}><DedupPage /></PlaylistsStoreProvider>);
       expect(screen.getByText('Liked Songs')).toBeInTheDocument();
     });
   });
   ```

2. Implementation. Create `src/ui/DedupPage.tsx`:

   ```tsx
   /**
    * The top-level Dedup page. Routes the store's load-state to the right
    * view. The page itself contributes no chrome — the Spicetify Custom App
    * harness provides the surrounding layout.
    */
   import React from 'react';
   import { usePlaylistsStore } from '../store/playlists-store';
   import { IdleView } from './IdleView';
   import { LoadingView } from './LoadingView';
   import { LoadedView } from './LoadedView';
   import { EmptyView } from './EmptyView';
   import { FailedView } from './FailedView';

   export function DedupPage() {
     const kind = usePlaylistsStore((s) => s.loadState.kind);
     switch (kind) {
       case 'idle': return <IdleView />;
       case 'loading': return <LoadingView />;
       case 'loaded': return <LoadedView />;
       case 'empty': return <EmptyView />;
       case 'failed': return <FailedView />;
     }
   }
   ```

3. Note: the switch is exhaustive. TypeScript's strict mode + the discriminated union ensures every case is handled — if a new case is added to `LoadState`, the compiler flags the missing branch.

**Files**: `src/ui/DedupPage.tsx` (new), `test/ui/DedupPage.test.tsx` (new).

**Validation**:

- [ ] Switch is exhaustive; no `default` branch needed.
- [ ] Each `loadState.kind` routes to the corresponding view.
- [ ] No view imported anywhere besides this file (verifiable via grep).

### T037 — Delete Hello World smoke test; verify 100 % coverage

**Purpose**: The Hello World test (`test/app.test.tsx`) is superseded. Removing it shrinks the test suite and removes a now-meaningless assertion. The `DedupPage` test from T036 is the replacement.

**Steps**:

1. Delete `test/app.test.tsx`.
2. Run `npm run test:run`. Confirm green.
3. Run `npm run test:coverage`. Confirm 100 % across `src/`. The `src/app.tsx` (now wiring the store + provider) is covered by the integration assertions in `test/ui/DedupPage.test.tsx`? **Caveat**: `DedupPage.test.tsx` creates its own store and does not import `src/app.tsx`. So `src/app.tsx`'s body — `createPlaylistsStore(new SpicetifyPlaylistsLoader())` plus the JSX — is uncovered after the Hello World test is removed.

   This is a real coverage problem. Options:
   - (a) Add a tiny `test/app.test.tsx` that smoke-imports `App` and renders it with `vi.stubGlobal('Spicetify', …)` so the production wiring runs without crashing.
   - (b) Exclude `src/app.tsx` from coverage. Adjust `vitest.config.ts`'s `coverage.exclude` to add `src/app.tsx`. Document the rationale: `app.tsx` is pure wiring + the production singleton; the production singleton's adapter is tested separately, and the page is tested via `DedupPage.test.tsx`.

   **Recommended**: option (a). It's ~10 lines and keeps the coverage guarantee unconditional. Refresh `test/app.test.tsx` with:

   ```tsx
   import { describe, it, expect, vi, afterEach } from 'vitest';
   import { render } from '@testing-library/react';
   import React from 'react';

   describe('src/app.tsx', () => {
     afterEach(() => vi.unstubAllGlobals());

     it('mounts the Dedup page in the idle state by default (no host fetches)', async () => {
       // Stub Spicetify so the SpicetifyPlaylistsLoader constructor is safe
       // even though it is never actually called (no triggerLoad in this test).
       vi.stubGlobal('Spicetify', { Platform: { RootlistAPI: {}, LibraryAPI: {} } });
       const { default: App } = await import('../src/app');
       const { getByRole } = render(<App />);
       expect(getByRole('button', { name: /load/i })).toBeInTheDocument();
     });
   });
   ```

   This covers `src/app.tsx`'s body and asserts the idle-state surface end-to-end.

**Files**: `test/app.test.tsx` (rewrite — same path; the old content goes away, new content lands).

**Validation**:

- [ ] `npm run test:coverage` reports 100 % across `src/` including `app.tsx`.
- [ ] No assertion of Hello World remains anywhere.

### T038 — Update README + live verification

**Purpose**: Reflect the new page behavior in the README, and perform the live end-to-end verification the spec's success criteria demand.

**Steps**:

1. Open `README.md`. Find the section describing the current Hello World state. Replace with:

   ```markdown
   ## Current state

   The Dedup page (registered in the Spotify sidebar as **Dedup**) renders an
   idle landing surface with a single **Load** button. Clicking the button
   fetches the user's library and lists their dedup-eligible collections:

   - Playlists the user owns
   - Collaborative playlists the user can edit
   - Liked Songs (always pinned first)

   Followed playlists, Spotify-curated playlists, and other users' playlists
   the user cannot mutate are excluded.

   The page is **idle until the user clicks Load** — no Spotify Platform
   calls are issued before the click. A failure during load surfaces a
   typed error explanation and a Retry button.

   This iteration is strictly read-only. Track enumeration, duplicate
   detection, and library mutation arrive in later iterations.
   ```

2. Live verification — run these steps and document the result in the PR description (the agent does not commit but should record observations for the reviewer):

   a. Build: `npm run build`.

   b. Apply: `spicetify apply`.

   c. Open Spotify. Open DevTools (Spicetify keybind or `Ctrl+Shift+I`).

   d. Navigate to the Dedup page from the sidebar.

   e. **Assertion 1 (SC-6)**: in the Network panel filter for `api-partner.spotify.com` and `pathfinder`. Confirm zero requests. The page should be in the idle state with the Load button visible.

   f. Click Load. Observe Network panel: requests should appear (corresponding to `RootlistAPI` + `LibraryAPI` calls).

   g. **Assertion 2 (SC-1)**: the page eventually shows the loaded list with Liked Songs pinned first and the user's eligible playlists below.

   h. Reload the page (Spicetify's reload keybind). Page returns to idle.

   i. In DevTools console, temporarily corrupt the adapter:

      ```js
      const real = Spicetify.Platform.RootlistAPI.getContents;
      Spicetify.Platform.RootlistAPI.getContents = () => Promise.reject(new Error('forced'));
      ```

   j. Click Load. **Assertion 3 (SC-4)**: the failure state appears with an explanation and a Retry button.

   k. Restore: `Spicetify.Platform.RootlistAPI.getContents = real;`.

   l. Click Retry. **Assertion 4 (FR-008)**: the page transitions to loading and ultimately to loaded.

3. Record the four assertion outcomes in the WP review notes.

**Files**: `README.md` (modify).

**Validation**:

- [ ] README updated.
- [ ] All four live assertions pass; documented in WP review notes.

## Test strategy

`DedupPage` is unit-tested for routing; `src/app.tsx` is integration-tested via `test/app.test.tsx`. Live verification is the final gate, exercised manually against a running Spotify client.

## Definition of Done

- [ ] `src/app.tsx` mounts `DedupPage` inside the provider with the production singleton.
- [ ] `src/ui/DedupPage.tsx` exists; routing is exhaustive over `LoadState.kind`.
- [ ] `test/ui/DedupPage.test.tsx` covers every routing branch.
- [ ] `test/app.test.tsx` rewritten to smoke-test `App` (no Hello World assertion).
- [ ] `npm run test:coverage` reports 100 % across `src/`.
- [ ] `tsc --noEmit` clean.
- [ ] Architecture test green.
- [ ] README updated; live verification documented and passing.

## Risks

- **`src/app.tsx` coverage gap** after deleting the Hello World test (T037). Mitigated by the rewritten smoke test in option (a). If coverage drops, the threshold gate fails and prevents merge.
- **Live verification depends on the implementer's local Spotify install.** If they can't run live, document the gap and ask the user to perform the verification before merge. Don't claim DoD without it.
- **`createPlaylistsStore(new SpicetifyPlaylistsLoader())` at module load.** This constructs the adapter eagerly. The adapter's constructor must be side-effect-free (no `Spicetify.*` access in the constructor); WP05 enforces this. If the constructor is found to touch `Spicetify`, the smoke test in T037 will fail under `vi.stubGlobal` with a permissive stub.
- **DevTools session can be tedious.** Use Spicetify's reload keybind for fast iteration. Note any flakiness in the live verification notes.

## Reviewer guidance

- Pull. `npm run test:coverage`. 100 % across `src/`.
- `tsc --noEmit` clean.
- Architecture test green.
- Open `src/app.tsx`. Confirm it imports `SpicetifyPlaylistsLoader` (the only file that does, besides the adapter's own test).
- Open `src/ui/DedupPage.tsx`. Verify the switch is exhaustive and there is no `default` branch.
- Open `README.md`. Confirm the description matches the new behavior.
- Cross-check the live verification notes from the WP review:
  - Zero pre-trigger network calls.
  - Loaded list shows Liked Songs first.
  - Forced failure surfaces the failure state.
  - Retry recovers.
- If live verification was skipped, hold the mission until the user can run it themselves.

## Activity Log

- 2026-06-03T09:14:58Z – claude – shell_pid=154091 – Started implementation via action command
