---
work_package_id: WP07
title: 'UI: State Views (Idle / Loading / Empty / Failed)'
dependencies:
- WP06
requirement_refs:
- FR-007
- FR-008
- FR-009
- FR-011
- NFR-003
planning_base_branch: get_library
merge_target_branch: get_library
branch_strategy: Planning artifacts for this feature were generated on get_library. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into get_library unless the human explicitly redirects the landing branch.
subtasks:
- T028
- T029
- T030
- T031
agent: "claude"
shell_pid: "172602"
history:
- timestamp: '2026-06-02T11:11:28Z'
  action: created
  by: spec-kitty.tasks
  note: Initial WP scaffold generated from /spec-kitty.tasks for mission load-dedupable-playlists-01KT3XW3.
authoritative_surface: src/ui/IdleView.tsx
execution_mode: code_change
mission_id: 01KT3XW3AWY8W0YJKCE9TYNQKX
mission_slug: load-dedupable-playlists-01KT3XW3
owned_files:
- src/ui/IdleView.tsx
- src/ui/LoadingView.tsx
- src/ui/EmptyView.tsx
- src/ui/FailedView.tsx
- test/ui/IdleView.test.tsx
- test/ui/LoadingView.test.tsx
- test/ui/EmptyView.test.tsx
- test/ui/FailedView.test.tsx
tags: []
---

# WP07 — UI: State Views (Idle / Loading / Empty / Failed)

## Objective

Implement the four React components that render the page in its non-`loaded` states:

- `IdleView` — the initial state. Renders the load-trigger button. Clicking it dispatches `triggerLoad`. **This is the sole entry point into the loading state in this iteration.** Implements FR-011.
- `LoadingView` — a non-blocking loading indicator. Implements FR-007.
- `EmptyView` — distinct empty-state copy. Implements FR-009.
- `FailedView` — failure explanation derived from `PlaylistsLoaderError.reason` via a small lookup table, plus a retry button that dispatches `retry`. Implements FR-008.

Each component is small, presentational, accessible, and consumes only the store's hook (`usePlaylistsStore` from WP06). No component imports the port or any adapter directly.

These tests run under `happy-dom` (already configured in `vitest.config.ts`). Use `@testing-library/react` for queries and event simulation; matchers are extended by `test/setup.ts`.

## Branch Strategy

Planning base = merge target = `get_library`. The execution agent invokes `spec-kitty agent action implement WP07 --agent <name>`; the runtime resolves the lane and workspace path from `lanes.json`. No git operations are performed by the agent — the user owns commits.

## Context

Per ADR-0001 (hexagonal architecture) and the architecture test (WP01), `src/ui/**` MUST NOT import from `src/adapters/**` or `src/ports/**`. Components consume the store via the React hook exported from `src/store/playlists-store.ts`.

For unit tests, build a fresh store per test wired to a `FakePlaylistsLoader`. Render the component inside a `<StoreProvider store={testStore}>` pattern, or — if the WP06 store uses a module-level singleton — pass the store via a context. The cleanest pattern with Zustand: each test calls `createPlaylistsStore(fake)` and uses Zustand's `useStore(store, selector)` API inside the component. The component takes the store via props or context; the production app (WP09) provides the production store.

**Suggested wiring** (decide in WP07, document for WP09):

- Components do NOT import a singleton store. They import a `usePlaylistsStore` hook from `src/store/playlists-store.ts` that consumes a Zustand store passed via React context.
- Export a `<PlaylistsStoreProvider store={...}>` wrapper from `src/store/playlists-store.ts` (add this in WP06's followup work or here in WP07 — it's small).

This adds ~20 lines to `playlists-store.ts` but cleanly enables testability. If you prefer, push the provider into a separate file `src/store/PlaylistsStoreContext.tsx` — that file would be owned by this WP. Add it to `owned_files` if you go this route.

For this prompt, assume the provider/hook live in `src/store/playlists-store.ts` (extended in WP06 follow-up if needed; or add the provider here as part of WP07 setup — flag the implementation in T028's commit).

## Detailed guidance per subtask

### T028 — TDD `IdleView` + test

**Purpose**: Render the "Load my dedup-able playlists" button. Click → `triggerLoad`. Verify no load happens before click.

**Steps**:

1. **Failing test first**. Create `test/ui/IdleView.test.tsx`:

   ```tsx
   import { describe, it, expect } from 'vitest';
   import { render, screen, fireEvent } from '@testing-library/react';
   import React from 'react';
   import { IdleView } from '../../src/ui/IdleView';
   import { createPlaylistsStore, PlaylistsStoreProvider } from '../../src/store/playlists-store';
   import { FakePlaylistsLoader } from '../../src/adapters/fake-playlists-loader';

   const make = () => {
     const loader = new FakePlaylistsLoader({ kind: 'success', playlists: [], likedSongs: { trackCount: 1 } });
     const store = createPlaylistsStore(loader);
     return { loader, store };
   };

   describe('IdleView', () => {
     it('renders a Load button', () => {
       const { store } = make();
       render(<PlaylistsStoreProvider store={store}><IdleView /></PlaylistsStoreProvider>);
       expect(screen.getByRole('button', { name: /load/i })).toBeInTheDocument();
     });

     it('does not call the loader before the button is clicked (SC-6)', () => {
       const { loader } = make();
       render(<PlaylistsStoreProvider store={make().store}><IdleView /></PlaylistsStoreProvider>);
       expect(loader.callCount).toBe(0);
     });

     it('clicking the button dispatches triggerLoad', async () => {
       const { loader, store } = make();
       render(<PlaylistsStoreProvider store={store}><IdleView /></PlaylistsStoreProvider>);
       fireEvent.click(screen.getByRole('button', { name: /load/i }));
       // The action is async; wait a microtask for the loader to be invoked.
       await Promise.resolve();
       expect(loader.callCount).toBe(1);
     });
   });
   ```

2. Run, watch fail. Create `src/ui/IdleView.tsx`:

   ```tsx
   /**
    * The initial view. Renders the load-trigger button — the sole entry
    * point into the loading state in this iteration (FR-011, C-006, SC-6).
    */
   import React from 'react';
   import { usePlaylistsStore } from '../store/playlists-store';

   export function IdleView() {
     const triggerLoad = usePlaylistsStore((s) => s.triggerLoad);
     return (
       <div className="dedup-idle">
         <p className="dedup-idle__copy">
           Load your dedup-able playlists to get started.
         </p>
         <button
           type="button"
           className="dedup-idle__trigger"
           aria-label="Load my dedup-able playlists"
           onClick={() => { void triggerLoad(); }}
         >
           Load
         </button>
       </div>
     );
   }
   ```

3. Style classes are placeholders; the WP08 follow-up (LoadedView) and WP09 (page wiring) will refine styling. Use Spotify's `--spice-*` CSS variables when adding styles — never hashed Spotify class selectors.

**Files**: `src/ui/IdleView.tsx` (new), `test/ui/IdleView.test.tsx` (new).

**Validation**:

- [ ] Button is queryable by role + accessible name.
- [ ] Zero loader calls before click.
- [ ] One loader call after click.

### T029 — TDD `LoadingView` + test

**Purpose**: Show a non-blocking loading indicator while the load is in flight (FR-007). No specific time bound (per NFR-001 / SC-1's "no wall-clock budget").

**Steps**:

1. Test first:

   ```tsx
   describe('LoadingView', () => {
     it('renders a status role with an accessible label', () => {
       render(<LoadingView />);
       const indicator = screen.getByRole('status');
       expect(indicator).toHaveAccessibleName(/loading/i);
     });

     it('renders without crashing when given no props', () => {
       render(<LoadingView />);
     });
   });
   ```

2. Implementation:

   ```tsx
   /**
    * Non-blocking loading indicator. No wall-clock progress; per NFR-001 the
    * total load duration is unbounded (host APIs control it). The indicator's
    * job is purely to assure the user the page is alive while waiting.
    */
   import React from 'react';

   export function LoadingView() {
     return (
       <div className="dedup-loading" role="status" aria-label="Loading your dedup-able playlists">
         <span className="dedup-loading__spinner" aria-hidden="true" />
         <span className="dedup-loading__copy">Loading your dedup-able playlists…</span>
       </div>
     );
   }
   ```

**Files**: `src/ui/LoadingView.tsx` (new), `test/ui/LoadingView.test.tsx` (new).

**Validation**:

- [ ] `role="status"` present.
- [ ] Accessible name conveys "loading playlists" or similar.

### T030 — TDD `EmptyView` + test

**Purpose**: Distinct empty-state message (FR-009, SC-5). Must NOT look like a spinner or a failure.

**Steps**:

1. Test first:

   ```tsx
   describe('EmptyView', () => {
     it('renders an empty-state message', () => {
       render(<EmptyView />);
       expect(screen.getByText(/no dedup-eligible collections/i)).toBeInTheDocument();
     });

     it('does not render a spinner or status role', () => {
       render(<EmptyView />);
       expect(screen.queryByRole('status')).not.toBeInTheDocument();
     });

     it('does not render a button or alert', () => {
       render(<EmptyView />);
       expect(screen.queryByRole('button')).not.toBeInTheDocument();
       expect(screen.queryByRole('alert')).not.toBeInTheDocument();
     });
   });
   ```

2. Implementation:

   ```tsx
   /**
    * Empty-state view (FR-009, SC-5). Distinct from loading and failed —
    * intentionally has no spinner, no button, no error styling.
    */
   import React from 'react';

   export function EmptyView() {
     return (
       <div className="dedup-empty">
         <p className="dedup-empty__copy">
           No dedup-eligible collections in your library.
         </p>
       </div>
     );
   }
   ```

**Files**: `src/ui/EmptyView.tsx` (new), `test/ui/EmptyView.test.tsx` (new).

### T031 — TDD `FailedView` + test

**Purpose**: Render a human-readable failure explanation derived from `PlaylistsLoaderError.reason`, plus a retry button that dispatches `retry`.

**Steps**:

1. Test first:

   ```tsx
   import { PlaylistsLoaderError } from '../../src/domain/errors';

   describe('FailedView', () => {
     const make = () => {
       const loader = new FakePlaylistsLoader({ kind: 'failure', throws: new PlaylistsLoaderError('host-unavailable', 'detail') });
       const store = createPlaylistsStore(loader);
       return { loader, store };
     };

     it('renders the explanation for host-unavailable', async () => {
       const { store } = make();
       await store.getState().triggerLoad();   // transition to failed
       render(<PlaylistsStoreProvider store={store}><FailedView /></PlaylistsStoreProvider>);
       expect(screen.getByText(/spotify client/i)).toBeInTheDocument();   // copy includes 'Spotify client'
     });

     it('renders a Retry button that dispatches retry', async () => {
       const { loader, store } = make();
       await store.getState().triggerLoad();
       render(<PlaylistsStoreProvider store={store}><FailedView /></PlaylistsStoreProvider>);
       expect(loader.callCount).toBe(1);
       fireEvent.click(screen.getByRole('button', { name: /retry/i }));
       await Promise.resolve();
       expect(loader.callCount).toBe(2);
     });

     it('uses role="alert" for the failure container', async () => {
       const { store } = make();
       await store.getState().triggerLoad();
       render(<PlaylistsStoreProvider store={store}><FailedView /></PlaylistsStoreProvider>);
       expect(screen.getByRole('alert')).toBeInTheDocument();
     });
   });
   ```

2. Implementation:

   ```tsx
   /**
    * Failure view (FR-008, NFR-004, SC-4). Renders a human-readable
    * explanation derived from the PlaylistsLoaderError's reason via a small
    * lookup table, plus a retry button that re-enters the loading state.
    */
   import React from 'react';
   import { usePlaylistsStore } from '../store/playlists-store';
   import type { PlaylistsLoaderErrorReason } from '../domain/errors';

   const EXPLANATIONS: Record<PlaylistsLoaderErrorReason, string> = {
     'host-unavailable': 'The Spotify client is not ready. Open Spotify and try again.',
     'host-auth-expired': 'Your Spotify session has expired. Sign in again and retry.',
     'rootlist-fetch-failed': 'Could not fetch your playlists. The Spotify client returned an error.',
     'rootlist-item-missing-name': 'One of your playlists is missing a name. The Spotify client returned an unexpected response.',
     'rootlist-item-missing-owner': 'One of your playlists is missing owner information. The Spotify client returned an unexpected response.',
     'rootlist-item-invalid-track-count': 'One of your playlists has an invalid track count. The Spotify client returned an unexpected response.',
     'rootlist-item-missing-flag': 'One of your playlists is missing an ownership or collaboration flag. The Spotify client returned an unexpected response.',
     'rootlist-item-unsupported-shape': 'One of your playlists is in an unrecognized format. This often means Spotify changed its data shape — please report this.',
     'liked-songs-fetch-failed': 'Could not fetch your Liked Songs. The Spotify client returned an error.',
     'liked-songs-invalid-track-count': 'Your Liked Songs track count is in an unexpected format. The Spotify client returned an unexpected response.',
   };

   export function FailedView() {
     const loadState = usePlaylistsStore((s) => s.loadState);
     const retry = usePlaylistsStore((s) => s.retry);

     if (loadState.kind !== 'failed') return null;
     const explanation = EXPLANATIONS[loadState.reason.reason];

     return (
       <div className="dedup-failed" role="alert">
         <p className="dedup-failed__explanation">{explanation}</p>
         <details className="dedup-failed__detail">
           <summary>Technical details</summary>
           <code>{loadState.reason.message}</code>
         </details>
         <button
           type="button"
           className="dedup-failed__retry"
           onClick={() => { void retry(); }}
         >
           Retry
         </button>
       </div>
     );
   }
   ```

3. Add a test covering each reason → explanation lookup:

   ```tsx
   const REASONS = [
     'host-unavailable', 'host-auth-expired', 'rootlist-fetch-failed',
     // ... all 10
   ] as const;

   describe.each(REASONS)('FailedView for reason %s', (reason) => {
     it('renders the corresponding explanation', async () => {
       const loader = new FakePlaylistsLoader({ kind: 'failure', throws: new PlaylistsLoaderError(reason, 'test') });
       const store = createPlaylistsStore(loader);
       await store.getState().triggerLoad();
       render(<PlaylistsStoreProvider store={store}><FailedView /></PlaylistsStoreProvider>);
       expect(screen.getByRole('alert')).toBeInTheDocument();
       // Explanation contains some recognizable substring tied to the reason.
     });
   });
   ```

**Files**: `src/ui/FailedView.tsx` (new), `test/ui/FailedView.test.tsx` (new).

**Validation**:

- [ ] Every reason has a string in `EXPLANATIONS` (the `Record<…, string>` type ensures this at compile time).
- [ ] Retry click invokes the store's `retry` action (verified by `loader.callCount` going from 1 to 2).
- [ ] `role="alert"` on the container.

## Test strategy

`@testing-library/react` + `happy-dom`. Each test constructs a fresh store wired to a `FakePlaylistsLoader`, renders the component inside the provider, and asserts on roles/text. The `PlaylistsStoreProvider` and `usePlaylistsStore` hook are exported from `src/store/playlists-store.ts` — if WP06 didn't ship them, add them as part of T028 (minor extension, no scope creep).

`role="status"` is for live regions that update non-disruptively; `role="alert"` is for assertive updates (the failure case). Use them deliberately.

## Definition of Done

- [ ] All four view components exist with JSDoc on every export.
- [ ] All four test files green; 100 % coverage on each component.
- [ ] `EXPLANATIONS` covers every `PlaylistsLoaderErrorReason` (compile-time guaranteed by `Record<>` type).
- [ ] No component imports from `src/adapters/**` or `src/ports/**`.
- [ ] Architecture test green; `tsc --noEmit` clean.

## Risks

- **Store provider not yet shipped in WP06.** If the implementer reaches WP07 and finds no provider/hook export in `playlists-store.ts`, add them as a small T028 prerequisite (~20 LOC). Don't expand `owned_files` to include `playlists-store.ts` — that's WP06's file. The cleanest workaround: create a tiny `src/store/PlaylistsStoreContext.tsx` owned by this WP; add it to `owned_files` if you go this route. Document the decision in the WP review.
- **`fireEvent.click` synchronous vs async event handling.** The action is `void triggerLoad()` (fire-and-forget); the test needs to `await Promise.resolve()` (or use `await waitFor(...)`) to let the microtask run before asserting `callCount`. Don't use a longer `setTimeout` — there's no real timing dependency.
- **Reason → explanation copy** is product-facing text. Have the user sign off on the exact strings before merging, or note in the WP review that copy is provisional and to be tightened before ship.

## Reviewer guidance

- Pull. `npm run test:coverage`. All four views at 100 %.
- Open each component. Confirm:
  - No `import` from `src/adapters/` or `src/ports/`.
  - The Idle button's `onClick` calls `triggerLoad`, not `loader.load` directly.
  - `FailedView` reads only `loadState` and `retry` from the store, not other fields.
- Run the architecture test. Should be green.
- Check the `EXPLANATIONS` table — every reason maps to a unique, user-friendly explanation. Push back on any "TODO" or "internal-error" strings — they should be replaced with concrete user-facing copy.

## Activity Log

- 2026-06-03T09:01:00Z – unknown – Start WP07 implementation
- 2026-06-03T09:01:42Z – unknown – Ready for review
- 2026-06-03T12:09:50Z – claude – shell_pid=172602 – Started review via action command
