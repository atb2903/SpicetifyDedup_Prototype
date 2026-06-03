---
work_package_id: WP02
title: 'Domain: Load-State FSM & Errors'
dependencies:
- WP01
requirement_refs:
- NFR-004
planning_base_branch: get_library
merge_target_branch: get_library
branch_strategy: Planning artifacts for this feature were generated on get_library. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into get_library unless the human explicitly redirects the landing branch.
subtasks:
- T005
- T006
- T007
- T008
agent: "claude"
shell_pid: "161658"
history:
- timestamp: '2026-06-02T11:11:28Z'
  action: created
  by: spec-kitty.tasks
  note: Initial WP scaffold generated from /spec-kitty.tasks for mission load-dedupable-playlists-01KT3XW3.
authoritative_surface: src/domain/load-state.ts
execution_mode: code_change
mission_id: 01KT3XW3AWY8W0YJKCE9TYNQKX
mission_slug: load-dedupable-playlists-01KT3XW3
owned_files:
- src/domain/load-state.ts
- src/domain/errors.ts
- test/domain/load-state.test.ts
- test/domain/errors.test.ts
tags: []
---

# WP02 — Domain: Load-State FSM & Errors

## Objective

Land the pure-TypeScript foundation that every later WP depends on: the load-state finite state machine (`LoadState`, `LoadAction`, `transition`) and the typed error class (`PlaylistsLoaderError`, `isPlaylistsLoaderError`). Both modules are fully pure — no React, no Zustand, no Spicetify. They test in milliseconds without `happy-dom` and form the basis of the store's behavior (WP06) and the adapter's error contract (WP05).

This is the first WP to actually exercise the hexagonal import boundaries: the architecture test from WP01 starts policing `src/domain/**` here.

## Branch Strategy

Planning base = merge target = `get_library`. The execution agent invokes `spec-kitty agent action implement WP02 --agent <name>`; the runtime resolves the lane and workspace path from `lanes.json`. No git operations are performed by the agent — the user owns commits.

## Context

Definitions taken verbatim from [`../data-model.md`](../data-model.md):

- **Load state** is a discriminated union with five variants: `idle`, `loading`, `loaded` (carries `items: CollectionViewModel[]`), `empty`, `failed` (carries `reason: PlaylistsLoaderError`).
- **Actions**: `trigger`, `load-succeeded`, `load-completed-empty`, `load-failed`, `retry`.
- **Transitions** are exhaustively tabulated in `data-model.md` §6. Most action × state combinations are *ignored* (state passes through unchanged) — that's by design, defensive against dispatch races.
- **Errors** are a single class `PlaylistsLoaderError extends Error` with a `reason: PlaylistsLoaderErrorReason` and optional `cause`. Reasons enumerated in `data-model.md` §7.

Forward references — these files don't exist yet, but `load-state.ts` needs to import the type:

- `CollectionViewModel` — defined in WP03 (`src/domain/view-models.ts`).
- `PlaylistsLoaderError` — defined in this WP (`src/domain/errors.ts`).

To avoid a circular dependency between WP02 and WP03, the WP02 author should **forward-declare a stub `CollectionViewModel` type** inside `load-state.ts` and re-export it… no, that's wrong, it creates two definitions. The cleaner approach: WP02 defines `load-state.ts` to import from `./view-models` (which will exist after WP03). For now, WP02 lands `view-models.ts` with just the `CollectionViewModel` type declaration (no `toViewModels` function — that comes in WP03). This is a small reach-ahead but keeps imports clean.

**Decision for this WP**: land a minimal `src/domain/view-models.ts` that declares only `CollectionViewModel`, `CollectionKind`, `OwnerIdentity`, and the placeholder `RawCollection`/`LikedSongsSummary` types. WP03 expands the file with the `toViewModels` function and tests. To prevent ownership conflict, both WPs treat `src/domain/view-models.ts` as a single file — WP02 owns its first version; WP03 adds to it.

**Update to owned_files**: include `src/domain/view-models.ts` and `test/domain/view-models.test.ts` … wait, this violates the "no two WPs may have overlapping owned_files" rule. To respect that rule cleanly, this WP must NOT touch `view-models.ts`. Instead, define the types `LoadedItems`, etc. locally in `load-state.ts` using a type alias that is opaque to WP02:

```ts
// load-state.ts
// CollectionViewModel is defined in src/domain/view-models.ts (WP03).
// We accept it as a structural opaque token here so this module compiles
// in isolation.
export type Loaded<Item> = { kind: 'loaded'; items: Item[] };
```

Hmm — that's ugly. Cleanest path: WP02 imports `CollectionViewModel` from `./view-models`, and WP03 lands the file. The dependency is **WP02 depends on WP03** for typecheck reasons.

That's a real reordering. Let me reconsider the WP02/WP03 relationship.

Actually the simpler fix: WP02's `load-state.ts` types the `loaded` variant generically:

```ts
export type LoadState<Item = unknown> =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'loaded'; items: Item[] }
  | { kind: 'empty' }
  | { kind: 'failed'; reason: PlaylistsLoaderError };
```

Consumers (WP06 store) pass `CollectionViewModel` as the type parameter. The FSM doesn't care what's in `items`. This is cleaner, more testable, and avoids the dependency.

**Final decision**: WP02 uses `LoadState<Item>` parameterized. WP06 specializes it as `LoadState<CollectionViewModel>`. No reach-ahead into WP03's files.

## Detailed guidance per subtask

### T005 — TDD `src/domain/load-state.ts` types + `transition` function

**Purpose**: Encode the load-state FSM as pure data + a pure transition function so it can be exercised without any React or store machinery.

**Steps**:

1. **Failing test first**. Open `test/domain/load-state.test.ts`. Write a test that imports `LoadState`, `LoadAction`, and `transition` from `../../src/domain/load-state` and asserts the simplest happy-path transition:

   ```ts
   import { describe, it, expect } from 'vitest';
   import { transition, type LoadState, type LoadAction } from '../../src/domain/load-state';

   describe('load-state FSM', () => {
     it('idle + trigger → loading', () => {
       const next = transition({ kind: 'idle' }, { type: 'trigger' });
       expect(next).toEqual({ kind: 'loading' });
     });
   });
   ```

2. Run `npm run test:run`. Confirm the test fails because `src/domain/load-state.ts` does not exist. **Watch it fail** — this is the TDD discipline; don't skip.

3. Create `src/domain/load-state.ts`. Define:

   - `type LoadAction = { type: 'trigger' } | { type: 'load-succeeded'; items: unknown[] } | { type: 'load-completed-empty' } | { type: 'load-failed'; reason: PlaylistsLoaderError } | { type: 'retry' };`
   - `type LoadState<Item = unknown> = { kind: 'idle' } | { kind: 'loading' } | { kind: 'loaded'; items: Item[] } | { kind: 'empty' } | { kind: 'failed'; reason: PlaylistsLoaderError };`
   - `function transition<Item>(state: LoadState<Item>, action: LoadAction): LoadState<Item>` — implements the table in `data-model.md` §6.

   Import `PlaylistsLoaderError` from `./errors` (which is created in T007 — order subtasks T005, T007 in tandem so the import is satisfied; or split into T005a/T005b/T007 — but cleaner to just have the author work T007 first then T005 if the order matters).

4. Re-run the test; expect it green. JSDoc on every export per charter docs gate.

5. Add tests for every cell of the table in `data-model.md` §6 — including the "ignored action" cells. Example:

   ```ts
   it('loaded + trigger → loaded (action ignored; loaded is terminal)', () => {
     const before: LoadState = { kind: 'loaded', items: [1, 2, 3] };
     expect(transition(before, { type: 'trigger' })).toEqual(before);
   });
   ```

**Files**: `src/domain/load-state.ts` (new), `test/domain/load-state.test.ts` (new).

**Validation**:

- [ ] Every action × state cell from `data-model.md` §6 has a test.
- [ ] All transitions are pure — no `Date.now`, no `Math.random`, no I/O.
- [ ] `transition` never mutates the input state object (use spread/return new object).
- [ ] 100 % coverage on `load-state.ts`.

### T006 — Boundary tests for FSM `items.length`

**Purpose**: The charter mandates boundary testing for every numeric bound (min−1, min, nominal, max, max+1). The only numeric bound in the FSM is `items.length` — distinguishing "empty" from "loaded" — and it is sneakier than it looks: the store enforces the dispatch decision (which action to dispatch), and the FSM trusts what it's told. We test both sides.

**Steps**:

1. In `test/domain/load-state.test.ts`, add a describe block "boundary: items.length":

   ```ts
   describe('boundary: items.length', () => {
     it('loading + load-succeeded with 1 item → loaded with that 1 item', () => {
       const next = transition({ kind: 'loading' }, { type: 'load-succeeded', items: ['a'] });
       expect(next).toEqual({ kind: 'loaded', items: ['a'] });
     });

     it('loading + load-succeeded with 2 items → loaded with those 2 items', () => {
       const next = transition({ kind: 'loading' }, { type: 'load-succeeded', items: ['a', 'b'] });
       expect(next).toEqual({ kind: 'loaded', items: ['a', 'b'] });
     });

     it('loading + load-completed-empty → empty (regardless of FSM state)', () => {
       expect(transition({ kind: 'loading' }, { type: 'load-completed-empty' })).toEqual({ kind: 'empty' });
     });

     it('loading + load-succeeded with 1000 items → loaded with 1000 items (NFR-002 headroom)', () => {
       const items = Array.from({ length: 1000 }, (_, i) => i);
       const next = transition({ kind: 'loading' }, { type: 'load-succeeded', items });
       expect(next.kind).toBe('loaded');
       expect((next as { items: number[] }).items.length).toBe(1000);
     });
   });
   ```

2. Note the asymmetry: there is **no `load-succeeded` with 0 items** — that dispatch path is wrong. The store will dispatch `load-completed-empty` when it sees an empty list; the FSM doesn't need a special case. To make this contract loud, add one more test:

   ```ts
   it('loading + load-succeeded with empty array → loaded with empty array (the store is responsible for not dispatching this)', () => {
     const next = transition({ kind: 'loading' }, { type: 'load-succeeded', items: [] });
     expect(next).toEqual({ kind: 'loaded', items: [] });
   });
   ```

   This documents that the FSM is permissive on this boundary; the *store* (WP06) is where the dispatch decision lives. WP06 tests will mirror this.

**Files**: `test/domain/load-state.test.ts` (extend).

**Validation**:

- [ ] Min−1 (negative length) is excluded — TypeScript prevents constructing it.
- [ ] Min (0), nominal (1), max (1,000 per NFR-002), max+1 (1,001) all covered or documented as out of scope.
- [ ] Coverage remains 100 %.

### T007 — TDD `src/domain/errors.ts` — `PlaylistsLoaderError` + classifier

**Purpose**: The single error type produced by the loader port. Used by the FSM (`failed` state's `reason`), the adapter (thrown), the store (caught + dispatched), and the UI (lookup table to render an explanation).

**Steps**:

1. **Failing test first**. Open `test/domain/errors.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import { PlaylistsLoaderError, isPlaylistsLoaderError } from '../../src/domain/errors';

   describe('PlaylistsLoaderError', () => {
     it('constructs with reason and message', () => {
       const e = new PlaylistsLoaderError('rootlist-fetch-failed', 'fetch blew up');
       expect(e.reason).toBe('rootlist-fetch-failed');
       expect(e.message).toBe('fetch blew up');
       expect(e instanceof Error).toBe(true);
     });
   });
   ```

2. Run, watch fail, create `src/domain/errors.ts`:

   ```ts
   /**
    * The single error type produced by the PlaylistsLoader port.
    * Adapters throw this; the store catches and dispatches it as the
    * `failed` state's reason; the UI renders an explanation from the
    * `reason` field via a small lookup table.
    */

   export type PlaylistsLoaderErrorReason =
     | 'rootlist-fetch-failed'
     | 'rootlist-item-missing-name'
     | 'rootlist-item-missing-owner'
     | 'rootlist-item-invalid-track-count'
     | 'rootlist-item-missing-flag'
     | 'rootlist-item-unsupported-shape'
     | 'liked-songs-fetch-failed'
     | 'liked-songs-invalid-track-count'
     | 'host-unavailable'
     | 'host-auth-expired';

   export class PlaylistsLoaderError extends Error {
     readonly reason: PlaylistsLoaderErrorReason;
     readonly cause?: unknown;

     constructor(
       reason: PlaylistsLoaderErrorReason,
       message: string,
       options?: { cause?: unknown },
     ) {
       super(message);
       this.name = 'PlaylistsLoaderError';
       this.reason = reason;
       if (options?.cause !== undefined) this.cause = options.cause;
     }
   }

   /**
    * Classifier predicate. Returns true if `x` is a PlaylistsLoaderError instance.
    * Useful for callers (e.g. the store) that need to distinguish loader errors
    * from arbitrary thrown values without try/catch + instanceof gymnastics.
    */
   export function isPlaylistsLoaderError(x: unknown): x is PlaylistsLoaderError {
     return x instanceof PlaylistsLoaderError;
   }
   ```

3. Add a test that `cause` survives construction and `isPlaylistsLoaderError` correctly classifies.

**Files**: `src/domain/errors.ts` (new), `test/domain/errors.test.ts` (new).

**Validation**:

- [ ] `instanceof Error` returns true.
- [ ] `name` is `'PlaylistsLoaderError'` (so stack traces are recognizable).
- [ ] `cause` round-trips.
- [ ] `isPlaylistsLoaderError` returns false for `new Error('x')`, `null`, `undefined`, strings, numbers, plain objects.

### T008 — Test every `PlaylistsLoaderErrorReason` value

**Purpose**: Ensure each reason can be constructed without TypeScript flagging it as an invalid member of the union, and that the resulting error round-trips through `isPlaylistsLoaderError`. This pins the union shape so a typo or accidental rename surfaces immediately.

**Steps**:

1. In `test/domain/errors.test.ts`, add:

   ```ts
   const REASONS = [
     'rootlist-fetch-failed',
     'rootlist-item-missing-name',
     'rootlist-item-missing-owner',
     'rootlist-item-invalid-track-count',
     'rootlist-item-missing-flag',
     'rootlist-item-unsupported-shape',
     'liked-songs-fetch-failed',
     'liked-songs-invalid-track-count',
     'host-unavailable',
     'host-auth-expired',
   ] as const satisfies readonly PlaylistsLoaderErrorReason[];

   describe.each(REASONS)('reason "%s"', (reason) => {
     it('constructs and classifies', () => {
       const e = new PlaylistsLoaderError(reason, `test message for ${reason}`);
       expect(e.reason).toBe(reason);
       expect(isPlaylistsLoaderError(e)).toBe(true);
     });
   });
   ```

2. The `satisfies` clause is doing important work: if the enum changes (a reason added or removed), this test stops type-checking — which is exactly what we want, since the UI's lookup table needs to be updated in lock-step.

**Files**: `test/domain/errors.test.ts` (extend).

**Validation**:

- [ ] Every reason in the union has a corresponding `describe.each` case.
- [ ] Removing a reason from the union (try it locally — revert) makes the `satisfies` clause flag a compilation error.
- [ ] Coverage remains 100 %.

## Test strategy

100 % of WP02 is TDD-driven. No file is written before its test exists in a failing state. Tests live alongside their subject in `test/domain/` and run under the default Vitest config (no `happy-dom` needed; pure logic).

Per the charter, every numeric bound has boundary tests; the only numeric bound here is `items.length` (T006).

## Definition of Done

- [ ] `src/domain/load-state.ts` exists with `LoadState`, `LoadAction`, `transition`. Pure functions, JSDoc on every export.
- [ ] `src/domain/errors.ts` exists with `PlaylistsLoaderError`, `PlaylistsLoaderErrorReason`, `isPlaylistsLoaderError`. JSDoc on every export.
- [ ] `test/domain/load-state.test.ts` covers every transition table cell + the boundary cases from T006.
- [ ] `test/domain/errors.test.ts` covers construction, classifier behavior, and every reason value.
- [ ] `npm run test:run` green; `npm run test:coverage` reports 100 % on `src/domain/load-state.ts` and `src/domain/errors.ts`.
- [ ] `tsc --noEmit` clean.
- [ ] The architecture test from WP01 still passes (no React/Zustand/Spicetify imports in `src/domain/**`).

## Risks

- **Import order of `load-state.ts` → `errors.ts`.** If T005 lands before T007 with an import on `./errors`, T005's tests don't compile. Mitigation: do T007 first, then T005. The order in this WP file is logical (load-state before errors) but the implementer should re-order if needed.
- **`transition`'s "ignored actions" coverage cost.** Testing every action × state cell explicitly creates 5 × 5 = 25 test cases. This is correct per the charter; do not skip with a fancy generative test that obscures intent.
- **Generic `LoadState<Item>` syntax weirdness in tests.** Tests can default to `LoadState<unknown>` for action-only assertions. Type-narrow only where the test cares about the `items` field shape.

## Reviewer guidance

- Pull the branch. Run `npm run test:run` and `npm run test:coverage`. Both green at 100 %.
- Open `src/domain/load-state.ts`. Map every clause of the `transition` switch/conditional to a row in `data-model.md` §6. Anything not in the table is a bug.
- Open `src/domain/errors.ts`. Verify `PlaylistsLoaderErrorReason` matches `data-model.md` §7 exactly — no extra reasons, no missing ones.
- Confirm the architecture test passes. Try `git diff` on `test/architecture.test.ts` — it should be unchanged from WP01.
- Confirm no imports of `react`, `zustand`, or `Spicetify` in either source file.

## Activity Log

- 2026-06-02T16:35:26Z – claude – shell_pid=43064 – Started implementation via action command
- 2026-06-02T21:05:13Z – claude – shell_pid=43064 – Ready for review: load-state FSM + PlaylistsLoaderError, 72 tests, 100% coverage, tsc clean
- 2026-06-02T21:20:25Z – claude – shell_pid=43064 – Ready for review
- 2026-06-03T10:59:06Z – claude – shell_pid=161658 – Started review via action command
- 2026-06-03T11:02:26Z – claude – shell_pid=161658 – Review passed: all 25 transition-table cells from data-model.md §6 covered, items.length boundary cases (0/1/2/1000/1001) tested per charter, all 10 PlaylistsLoaderError reasons match §7 and pinned via 'as const satisfies', isPlaylistsLoaderError classifier covers negative cases, architecture test green (no react/zustand/Spicetify in src/domain/), 358/358 tests, 100% line+branch coverage, tsc --noEmit clean, JSDoc on every export, commit scope limited to the 4 owned files.
