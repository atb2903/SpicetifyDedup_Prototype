---
work_package_id: WP06
title: Zustand Load-State Store
dependencies:
- WP02
- WP04
requirement_refs:
- C-006
- FR-008
- FR-009
- FR-011
- FR-012
- NFR-002
- NFR-004
planning_base_branch: get_library
merge_target_branch: get_library
branch_strategy: Planning artifacts for this feature were generated on get_library. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into get_library unless the human explicitly redirects the landing branch.
subtasks:
- T024
- T025
- T026
- T027
history:
- timestamp: '2026-06-02T11:11:28Z'
  action: created
  by: spec-kitty.tasks
  note: Initial WP scaffold generated from /spec-kitty.tasks for mission load-dedupable-playlists-01KT3XW3.
authoritative_surface: src/store/playlists-store.ts
execution_mode: code_change
mission_id: 01KT3XW3AWY8W0YJKCE9TYNQKX
mission_slug: load-dedupable-playlists-01KT3XW3
owned_files:
- src/store/playlists-store.ts
- test/store/playlists-store.test.ts
tags: []
---

# WP06 — Zustand Load-State Store

## Objective

Implement the Zustand store that wires the `PlaylistsLoader` port to the load-state FSM. Specifically:

- `createPlaylistsStore(loader: PlaylistsLoader)` — a factory that returns a vanilla Zustand store (`StoreApi<PlaylistsState>`). Tests use this with a `FakePlaylistsLoader`.
- `PlaylistsState` shape: `{ loadState: LoadState<CollectionViewModel>; triggerLoad(): Promise<void>; retry(): Promise<void> }`.
- The store's actions transition the FSM via the `transition` function from WP02 and call `loader.load()`. They catch non-`PlaylistsLoaderError` throws and wrap them per the port contract.
- Initial state: `{ loadState: { kind: 'idle' } }`. No port call until `triggerLoad` is invoked (SC-6).

The store consumes:
- `PlaylistsLoader` interface (WP04)
- `LoadState`, `LoadAction`, `transition` (WP02)
- `PlaylistsLoaderError`, `isPlaylistsLoaderError` (WP02)
- `RawCollection`, `LikedSongsSummary`, `CollectionViewModel`, `toViewModels` (WP03)
- `isEligible` (WP03)
- `orderRootlist` (WP03)

WP09 will create the production singleton wiring `SpicetifyPlaylistsLoader`. WP06 does NOT create a singleton — only the factory.

## Branch Strategy

Planning base = merge target = `get_library`. The execution agent invokes `spec-kitty agent action implement WP06 --agent <name>`; the runtime resolves the lane and workspace path from `lanes.json`. No git operations are performed by the agent — the user owns commits.

## Context

Per ADR-0003, Zustand stores are testable in pure TypeScript via `createStore(...)` (the vanilla primitive). No React renderer is needed for the store tests; `happy-dom` is unused here. The store's React-binding hook (`usePlaylistsStore`) is exported for UI consumers but is not exercised in this WP — that responsibility falls to WP07/WP08.

The store's `triggerLoad` action does the dispatch decision between `load-succeeded` and `load-completed-empty`:

```
const result = await loader.load();
const filtered = result.playlists.filter(isEligible);
const ordered = orderRootlist(filtered);
const items = toViewModels(ordered, result.likedSongs);
// items always contains the Liked Songs row, so it's never empty —
// except when filtered is empty AND likedSongs.trackCount is 0?
// No — Liked Songs row is always present per FR-003. So `items` is
// non-empty whenever the load succeeds. The "empty" state is reached
// when items.length === 1 (only the Liked Songs row) AND
// likedSongs.trackCount === 0.
```

Wait — this is subtle. Re-read spec FR-009: "If the eligible set is successfully fetched and contains zero entries (no owned playlists, no editable collaborative playlists, and an empty Liked Songs collection), the page MUST show an empty-state message". So the empty state is reached only when ALL THREE are zero. Otherwise (Liked Songs has any track, or any eligible playlist exists), it's `loaded`.

The store's dispatch decision in concrete terms:

```
const eligiblePlaylists = result.playlists.filter(isEligible);
const ordered = orderRootlist(eligiblePlaylists);
const items = toViewModels(ordered, result.likedSongs);
const isLibraryEffectivelyEmpty =
  eligiblePlaylists.length === 0 && result.likedSongs.trackCount === 0;

if (isLibraryEffectivelyEmpty) {
  set({ loadState: transition(get().loadState, { type: 'load-completed-empty' }) });
} else {
  set({ loadState: transition(get().loadState, { type: 'load-succeeded', items }) });
}
```

The FSM in WP02 trusts this dispatch decision; it doesn't second-guess based on `items.length`. The store's tests verify the decision logic explicitly.

## Detailed guidance per subtask

### T024 — TDD `createPlaylistsStore` factory (initial state)

**Purpose**: Establish the store's shape, default state, and zero-call invariant before any action lands.

**Steps**:

1. **Failing test first**. Create `test/store/playlists-store.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import { createPlaylistsStore } from '../../src/store/playlists-store';
   import { FakePlaylistsLoader } from '../../src/adapters/fake-playlists-loader';

   describe('createPlaylistsStore', () => {
     it('initial state is idle', () => {
       const loader = new FakePlaylistsLoader({ kind: 'success', playlists: [], likedSongs: { trackCount: 0 } });
       const store = createPlaylistsStore(loader);
       expect(store.getState().loadState).toEqual({ kind: 'idle' });
     });

     it('does not call the loader before triggerLoad is invoked (SC-6)', () => {
       const loader = new FakePlaylistsLoader({ kind: 'success', playlists: [], likedSongs: { trackCount: 0 } });
       createPlaylistsStore(loader);
       expect(loader.callCount).toBe(0);
     });
   });
   ```

2. Run, watch fail. Create `src/store/playlists-store.ts`:

   ```ts
   import { createStore, type StoreApi } from 'zustand/vanilla';
   import { create as createReactStore } from 'zustand';
   import type { PlaylistsLoader } from '../ports/playlists-loader';
   import type { CollectionViewModel } from '../domain/view-models';
   import { transition, type LoadState } from '../domain/load-state';
   import { isPlaylistsLoaderError, PlaylistsLoaderError } from '../domain/errors';
   import { isEligible } from '../domain/eligibility';
   import { orderRootlist } from '../domain/ordering';
   import { toViewModels } from '../domain/view-models';

   /** Public store shape. */
   export type PlaylistsState = {
     loadState: LoadState<CollectionViewModel>;
     triggerLoad: () => Promise<void>;
     retry: () => Promise<void>;
   };

   /**
    * Vanilla Zustand store factory. Tests construct with a FakePlaylistsLoader;
    * the production singleton (in src/app.tsx, WP09) constructs with
    * SpicetifyPlaylistsLoader.
    */
   export function createPlaylistsStore(loader: PlaylistsLoader): StoreApi<PlaylistsState> {
     return createStore<PlaylistsState>((set, get) => {
       const runLoad = async () => {
         try {
           const { playlists, likedSongs } = await loader.load();
           const eligible = playlists.filter(isEligible);
           const ordered = orderRootlist(eligible);
           const items = toViewModels(ordered, likedSongs);
           const isEffectivelyEmpty = eligible.length === 0 && likedSongs.trackCount === 0;
           if (isEffectivelyEmpty) {
             set({ loadState: transition(get().loadState, { type: 'load-completed-empty' }) });
           } else {
             set({ loadState: transition(get().loadState, { type: 'load-succeeded', items }) });
           }
         } catch (err) {
           const reason = isPlaylistsLoaderError(err)
             ? err
             : new PlaylistsLoaderError('rootlist-fetch-failed', 'Loader threw a non-PlaylistsLoaderError', { cause: err });
           set({ loadState: transition(get().loadState, { type: 'load-failed', reason }) });
         }
       };

       return {
         loadState: { kind: 'idle' },
         async triggerLoad() {
           set({ loadState: transition(get().loadState, { type: 'trigger' }) });
           await runLoad();
         },
         async retry() {
           set({ loadState: transition(get().loadState, { type: 'retry' }) });
           await runLoad();
         },
       };
     });
   }

   /**
    * Optional convenience hook for React components. Bound to a store created
    * by WP09 in src/app.tsx; not used in this WP's tests.
    */
   export function bindPlaylistsHook(store: StoreApi<PlaylistsState>) {
     return createReactStore<PlaylistsState>()(() => store.getState());
   }
   ```

   Note: the `bindPlaylistsHook` design is tentative — the implementer may prefer Zustand's `useStore(store, selector)` from `zustand` directly in UI components. Adjust to whatever idiom is cleanest after consulting current Zustand docs.

3. Re-run tests; expect green.

**Files**: `src/store/playlists-store.ts` (new), `test/store/playlists-store.test.ts` (new).

**Validation**:

- [ ] Initial state `{ kind: 'idle' }`.
- [ ] `loader.callCount === 0` after store construction.
- [ ] Architecture test still green.

### T025 — Test `triggerLoad` happy path

**Purpose**: `idle → loading → loaded` with non-empty items.

**Steps**:

```ts
import { isEligible } from '../../src/domain/eligibility';
import type { RawCollection } from '../../src/domain/view-models';

const PL_SELF: RawCollection = {
  uri: 'spotify:playlist:self',
  name: 'My Playlist',
  owner: { kind: 'self', displayName: 'me' },
  trackCount: 5,
  imageUrl: null,
  isOwnedByMe: true,
  isCollaborative: false,
  canEdit: false,
};

const PL_FOLLOWED: RawCollection = { /* not eligible */ };

describe('triggerLoad happy path', () => {
  it('transitions idle → loading → loaded with view models', async () => {
    const loader = new FakePlaylistsLoader({
      kind: 'success',
      playlists: [PL_SELF],
      likedSongs: { trackCount: 42 },
    });
    const store = createPlaylistsStore(loader);
    const triggerPromise = store.getState().triggerLoad();

    // We can't easily observe the intermediate `loading` state since the
    // transition + await runLoad happen in the same microtask. Verify
    // the final state and assert callCount.
    await triggerPromise;
    const state = store.getState();
    expect(state.loadState.kind).toBe('loaded');
    if (state.loadState.kind === 'loaded') {
      expect(state.loadState.items[0].kind).toBe('liked-songs');
      expect(state.loadState.items[1].kind).toBe('playlist');
    }
    expect(loader.callCount).toBe(1);
  });

  it('filters out non-eligible playlists before view-model construction', async () => {
    const loader = new FakePlaylistsLoader({
      kind: 'success',
      playlists: [PL_SELF, PL_FOLLOWED],
      likedSongs: { trackCount: 0 },
    });
    const store = createPlaylistsStore(loader);
    await store.getState().triggerLoad();
    const state = store.getState();
    if (state.loadState.kind !== 'loaded') throw new Error('expected loaded');
    expect(state.loadState.items.length).toBe(2);  // Liked Songs + 1 eligible playlist
    expect(state.loadState.items.find((i) => i.key === PL_FOLLOWED.uri)).toBeUndefined();
  });
});
```

To observe the intermediate `loading` state, subscribe to the store before awaiting:

```ts
it('briefly transitions through loading', async () => {
  const loader = new FakePlaylistsLoader({ kind: 'success', playlists: [], likedSongs: { trackCount: 1 } });
  const store = createPlaylistsStore(loader);
  const seen: string[] = [];
  store.subscribe((s) => seen.push(s.loadState.kind));
  await store.getState().triggerLoad();
  expect(seen).toEqual(['loading', 'loaded']);
});
```

**Validation**:

- [ ] At least one test asserts the intermediate `loading` state via subscription.
- [ ] Non-eligible playlists are filtered out before reaching the view models.
- [ ] Liked Songs row always present.

### T026 — Test `triggerLoad` empty path + failure path + wrapping

**Purpose**: Cover FR-009 (empty state) and FR-008 (failure state), plus the non-`PlaylistsLoaderError` wrapping required by the port contract.

**Steps**:

```ts
describe('triggerLoad empty and failure paths', () => {
  it('transitions to empty when no eligible playlists AND likedSongs is empty', async () => {
    const loader = new FakePlaylistsLoader({
      kind: 'success',
      playlists: [],
      likedSongs: { trackCount: 0 },
    });
    const store = createPlaylistsStore(loader);
    await store.getState().triggerLoad();
    expect(store.getState().loadState.kind).toBe('empty');
  });

  it('does NOT transition to empty when likedSongs has tracks (still loaded)', async () => {
    const loader = new FakePlaylistsLoader({
      kind: 'success',
      playlists: [],
      likedSongs: { trackCount: 1 },
    });
    const store = createPlaylistsStore(loader);
    await store.getState().triggerLoad();
    expect(store.getState().loadState.kind).toBe('loaded');
  });

  it('does NOT transition to empty when there are eligible playlists (still loaded)', async () => {
    const loader = new FakePlaylistsLoader({
      kind: 'success',
      playlists: [PL_SELF],
      likedSongs: { trackCount: 0 },
    });
    const store = createPlaylistsStore(loader);
    await store.getState().triggerLoad();
    expect(store.getState().loadState.kind).toBe('loaded');
  });

  it('transitions to failed when the loader throws PlaylistsLoaderError', async () => {
    const err = new PlaylistsLoaderError('host-unavailable', 'no platform');
    const loader = new FakePlaylistsLoader({ kind: 'failure', throws: err });
    const store = createPlaylistsStore(loader);
    await store.getState().triggerLoad();
    const state = store.getState();
    expect(state.loadState.kind).toBe('failed');
    if (state.loadState.kind === 'failed') {
      expect(state.loadState.reason).toBe(err);
    }
  });

  it('wraps non-PlaylistsLoaderError throws into rootlist-fetch-failed with cause preserved', async () => {
    const original = new Error('completely unexpected');
    // FakePlaylistsLoader only takes PlaylistsLoaderError; for this test, build
    // an ad-hoc loader that throws a plain Error.
    const loader: PlaylistsLoader = { async load() { throw original; } };
    const store = createPlaylistsStore(loader);
    await store.getState().triggerLoad();
    const state = store.getState();
    expect(state.loadState.kind).toBe('failed');
    if (state.loadState.kind === 'failed') {
      expect(state.loadState.reason.reason).toBe('rootlist-fetch-failed');
      expect(state.loadState.reason.cause).toBe(original);
    }
  });
});
```

### T027 — Test `retry` from `failed` re-enters `loading`

**Purpose**: Cover FR-008 (retry affordance).

**Steps**:

```ts
describe('retry', () => {
  it('from failed re-enters loading then dispatches next outcome', async () => {
    // First load fails; second load succeeds.
    let mode: 'fail' | 'succeed' = 'fail';
    const loader: PlaylistsLoader = {
      async load() {
        if (mode === 'fail') throw new PlaylistsLoaderError('rootlist-fetch-failed', 'first try');
        return { playlists: [], likedSongs: { trackCount: 1 } };
      },
    };
    const store = createPlaylistsStore(loader);
    await store.getState().triggerLoad();
    expect(store.getState().loadState.kind).toBe('failed');

    mode = 'succeed';
    const seen: string[] = [];
    const unsub = store.subscribe((s) => seen.push(s.loadState.kind));
    await store.getState().retry();
    unsub();

    expect(seen).toEqual(['loading', 'loaded']);
    expect(store.getState().loadState.kind).toBe('loaded');
  });

  it('retry from non-failed states is a no-op (transition trusts the FSM rules)', async () => {
    const loader = new FakePlaylistsLoader({ kind: 'success', playlists: [], likedSongs: { trackCount: 1 } });
    const store = createPlaylistsStore(loader);
    // From idle: retry transition leaves us in idle, but the action still
    // calls loader.load(). This is a known design choice: the action body
    // doesn't gate on the prior state. UI tests should never expose retry()
    // from non-failed states; the architecture enforces it.
    await store.getState().retry();
    // The transition function would leave loadState as 'idle' (retry is
    // ignored from idle). But the load runs anyway and the final state is
    // determined by the load result.
    expect(store.getState().loadState.kind).toBe('loaded');
  });
});
```

Hmm — the second test reveals a design wrinkle. If `retry` is callable from `idle` and runs the load, it sidesteps `triggerLoad`'s `trigger` action. Decide whether to:

(a) Gate `retry` on the prior state being `failed`. Throw or no-op otherwise.
(b) Treat `retry` as "same as triggerLoad". Document that the only difference is the action name dispatched.

For safety, prefer (a) — `retry` is a no-op from non-`failed` states:

```ts
async retry() {
  const before = get().loadState;
  if (before.kind !== 'failed') return;  // documented no-op
  set({ loadState: transition(before, { type: 'retry' }) });
  await runLoad();
},
```

Update the test accordingly. This matches FR-008's spirit ("retry affordance" implies the user was in the failure state).

**Files**: `test/store/playlists-store.test.ts` (extend).

**Validation**:

- [ ] `retry` from `failed` re-enters `loading` then completes.
- [ ] `retry` from other states is a no-op (loader not called).
- [ ] Coverage 100 %.

## Test strategy

Pure-TypeScript store tests using `createStore(...)`. No React, no `happy-dom`. `vitest`'s `subscribe` API observes intermediate states.

For non-`PlaylistsLoaderError` wrapping, construct an ad-hoc `PlaylistsLoader` inline rather than extending `FakePlaylistsLoader` — keeps the fake simple.

## Definition of Done

- [ ] `src/store/playlists-store.ts` exists with `createPlaylistsStore`, `PlaylistsState`, and an exported React hook (`useStore`-based) for WP07/WP08 use.
- [ ] Initial state is `{ kind: 'idle' }`; zero loader calls before `triggerLoad`.
- [ ] All four state outcomes (`loaded`, `empty`, `failed` from `PlaylistsLoaderError`, `failed` from wrapped non-loader-error) verified.
- [ ] `retry` re-enters `loading` from `failed` only.
- [ ] 100 % coverage on `playlists-store.ts`.
- [ ] Architecture test green; `tsc --noEmit` clean.

## Risks

- **Observing the intermediate `loading` state requires `subscribe`.** Don't try `expect(state.loadState.kind).toBe('loading')` synchronously — the action runs to completion in one microtask. Use the subscription pattern.
- **`retry` from non-failed states**: the "no-op" semantics are a design choice. Document this in JSDoc. The UI never exposes retry from non-failed states, so the test is documentary, not load-bearing.
- **Zustand 5.x React-binding API**: confirm the current idiomatic hook export (`create()((set) => ...)` vs `create<T>()((set) => ...)` vs vanilla + `useStore`). Adjust the React binding accordingly.
- **The store filters eligibility, but data-model.md §9 says "Store does not validate; calls the port"**. Reconcile: eligibility filtering is *transformation*, not *validation*. The store does no shape validation (the adapter owns that); it just applies domain rules (eligibility, ordering, transform) to typed inputs. This is consistent.

## Reviewer guidance

- Run `npm run test:coverage`. Confirm 100 % on `playlists-store.ts`.
- Open the store. Verify: it imports `PlaylistsLoader` from `ports/`, not from `adapters/`. The factory's signature accepts the port interface, not a concrete class.
- Confirm `triggerLoad`'s dispatch decision matches the spec: empty state ONLY when both `playlists` (filtered to eligible) is empty AND `likedSongs.trackCount === 0`.
- Confirm `retry` gates on the prior state being `failed`.
- Architecture test green.

## Activity Log

- 2026-06-02T23:01:05Z – unknown – Ready for review
