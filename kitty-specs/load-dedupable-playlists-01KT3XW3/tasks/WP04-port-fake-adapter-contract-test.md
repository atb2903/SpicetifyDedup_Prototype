---
work_package_id: WP04
title: Port + Fake Adapter + Contract Test
dependencies:
- WP03
requirement_refs:
- C-001
planning_base_branch: get_library
merge_target_branch: get_library
branch_strategy: Planning artifacts for this feature were generated on get_library. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into get_library unless the human explicitly redirects the landing branch.
subtasks:
- T015
- T016
- T017
- T018
history:
- timestamp: '2026-06-02T11:11:28Z'
  action: created
  by: spec-kitty.tasks
  note: Initial WP scaffold generated from /spec-kitty.tasks for mission load-dedupable-playlists-01KT3XW3.
authoritative_surface: src/ports/playlists-loader.ts
execution_mode: code_change
mission_id: 01KT3XW3AWY8W0YJKCE9TYNQKX
mission_slug: load-dedupable-playlists-01KT3XW3
owned_files:
- src/ports/playlists-loader.ts
- src/adapters/fake-playlists-loader.ts
- test/ports/playlists-loader-contract.test.ts
tags: []
---

# WP04 — Port + Fake Adapter + Contract Test

## Objective

Land the seam between the domain and the host. Specifically:

- Define the `PlaylistsLoader` port interface — the stable contract that both the production adapter (WP05) and the in-memory test fake (this WP) implement.
- Implement `FakePlaylistsLoader`, the in-memory test double the store (WP06) and UI tests (WP07/WP08) consume. Parameterized to return success results or throw `PlaylistsLoaderError` variants.
- Write the cross-implementation contract test that any `PlaylistsLoader` must pass. This is the source-of-truth executable specification of the port behavior; it runs against the fake here, and will run against the production adapter in WP05.

The full port contract is documented in [`../contracts/playlists-loader-port.md`](../contracts/playlists-loader-port.md). Re-read that file before starting — it specifies methods, return shape, error contract, guarantees, and side-effect rules.

## Branch Strategy

Planning base = merge target = `get_library`. The execution agent invokes `spec-kitty agent action implement WP04 --agent <name>`; the runtime resolves the lane and workspace path from `lanes.json`. No git operations are performed by the agent — the user owns commits.

## Context

The port returns domain types (`RawCollection`, `LikedSongsSummary`) defined in WP03, *not* host-shaped types. This means: even the fake adapter constructs domain objects directly, no translation needed; the production adapter (WP05) does the host→domain translation inside its `load()` method.

The contract is intentionally minimal: a single method, two return fields, one typed error class. No options parameter, no progress callback, no AbortController — those exclusions are deliberate (per the contract doc's "Non-contract" section) and should not creep in.

This WP is on the critical path: WP05 (production adapter) reuses the contract test from here; WP06 (store) depends on this port + fake.

## Detailed guidance per subtask

### T015 — Define `PlaylistsLoader` interface

**Purpose**: Encode the contract from `contracts/playlists-loader-port.md` as a TypeScript interface that all implementations satisfy.

**Steps**:

1. Create `src/ports/playlists-loader.ts`:

   ```ts
   /**
    * Port contract — see kitty-specs/load-dedupable-playlists-01KT3XW3/
    * contracts/playlists-loader-port.md for the canonical spec.
    *
    * Implementations: SpicetifyPlaylistsLoader (production, WP05),
    * FakePlaylistsLoader (in-memory test double, WP04).
    *
    * Guarantees:
    * - Atomicity: load() resolves with a complete result or throws;
    *   no partial results.
    * - Read-only: no mutation APIs are called.
    * - Order preservation: `playlists` is in host-native order;
    *   the domain ordering rule pins Liked Songs separately.
    * - No host fetches before load() is called.
    */
   import type {
     RawCollection,
     LikedSongsSummary,
   } from '../domain/view-models';

   export interface PlaylistsLoader {
     /**
      * Fetch the user's full rootlist + Liked Songs summary.
      * Throws PlaylistsLoaderError on any failure; never returns
      * a partial result.
      */
     load(): Promise<{
       playlists: RawCollection[];
       likedSongs: LikedSongsSummary;
     }>;
   }
   ```

2. Verify `tsc --noEmit` is clean and the architecture test still passes (no `react`/`zustand`/`adapters/`/`store/`/`ui/` imports in `src/ports/**`).

**Files**: `src/ports/playlists-loader.ts` (new).

**Validation**:

- [ ] JSDoc points the reader to the canonical port contract doc.
- [ ] Imports are only from `../domain/view-models` (types only).

### T016 — Implement `FakePlaylistsLoader`

**Purpose**: An in-memory implementation of `PlaylistsLoader` parameterized to return any combination of success/failure results. Used in every store and UI test in this mission.

**Steps**:

1. Create `src/adapters/fake-playlists-loader.ts`:

   ```ts
   /**
    * In-memory PlaylistsLoader for tests. Parameterize at construction
    * with either a success result or a PlaylistsLoaderError to throw.
    *
    * This file is owned by the test surface but lives under src/ so the
    * architecture test treats it like any other adapter (must not import
    * from store/ or ui/).
    */
   import type { PlaylistsLoader } from '../ports/playlists-loader';
   import type {
     RawCollection,
     LikedSongsSummary,
   } from '../domain/view-models';
   import type { PlaylistsLoaderError } from '../domain/errors';

   export type FakeLoaderResult =
     | { kind: 'success'; playlists: RawCollection[]; likedSongs: LikedSongsSummary }
     | { kind: 'failure'; throws: PlaylistsLoaderError };

   export class FakePlaylistsLoader implements PlaylistsLoader {
     /** Counts every load() call for assertion in tests. */
     callCount = 0;

     constructor(private readonly result: FakeLoaderResult) {}

     async load(): Promise<{
       playlists: RawCollection[];
       likedSongs: LikedSongsSummary;
     }> {
       this.callCount += 1;
       if (this.result.kind === 'failure') throw this.result.throws;
       return {
         playlists: this.result.playlists,
         likedSongs: this.result.likedSongs,
       };
     }
   }
   ```

2. Note the `callCount`. It is the simplest mechanism for tests to assert "the port was called exactly N times" — including the critical "zero calls before trigger" assertion for SC-6.

**Files**: `src/adapters/fake-playlists-loader.ts` (new).

**Validation**:

- [ ] Constructor accepts both success and failure variants.
- [ ] `callCount` increments per call.
- [ ] On failure, throws the configured error; does not increment any counter twice or behave nondeterministically.

### T017 — Cross-implementation contract test

**Purpose**: An executable spec of the port. Any implementation that passes this suite satisfies the contract.

**Steps**:

1. Create `test/ports/playlists-loader-contract.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import type { PlaylistsLoader } from '../../src/ports/playlists-loader';
   import { FakePlaylistsLoader } from '../../src/adapters/fake-playlists-loader';
   import { PlaylistsLoaderError, isPlaylistsLoaderError } from '../../src/domain/errors';
   import type { RawCollection, LikedSongsSummary } from '../../src/domain/view-models';

   /**
    * Cross-implementation contract test for PlaylistsLoader.
    *
    * Suite factory: pass a function that returns a PlaylistsLoader plus
    * convenience setters/probes for failure modes. WP05 reuses this with
    * a vi.stubGlobal-driven production adapter factory.
    */
   export function runPlaylistsLoaderContract(
     name: string,
     factory: (result: { playlists: RawCollection[]; likedSongs: LikedSongsSummary } | { throws: PlaylistsLoaderError }) => PlaylistsLoader,
   ) {
     describe(`PlaylistsLoader contract — ${name}`, () => {
       const SAMPLE_PLAYLIST: RawCollection = {
         uri: 'spotify:playlist:abc',
         name: 'My Playlist',
         owner: { kind: 'self', displayName: 'me' },
         trackCount: 10,
         imageUrl: 'https://i.scdn.co/image/abc',
         isOwnedByMe: true,
         isCollaborative: false,
         canEdit: false,
       };
       const SAMPLE_LIKED: LikedSongsSummary = { trackCount: 42 };

       it('resolves with the configured result on success', async () => {
         const loader = factory({ playlists: [SAMPLE_PLAYLIST], likedSongs: SAMPLE_LIKED });
         const result = await loader.load();
         expect(result.playlists).toEqual([SAMPLE_PLAYLIST]);
         expect(result.likedSongs).toEqual(SAMPLE_LIKED);
       });

       it('resolves with empty arrays when the library has nothing', async () => {
         const loader = factory({ playlists: [], likedSongs: { trackCount: 0 } });
         const result = await loader.load();
         expect(result.playlists).toEqual([]);
         expect(result.likedSongs).toEqual({ trackCount: 0 });
       });

       it.each([
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
       ] as const)('throws PlaylistsLoaderError with reason %s when configured', async (reason) => {
         const loader = factory({ throws: new PlaylistsLoaderError(reason, `test: ${reason}`) });
         await expect(loader.load()).rejects.toSatisfy((e: unknown) =>
           isPlaylistsLoaderError(e) && e.reason === reason,
         );
       });

       it('does not return a partial result on failure', async () => {
         const loader = factory({ throws: new PlaylistsLoaderError('rootlist-fetch-failed', 'x') });
         await expect(loader.load()).rejects.toBeInstanceOf(PlaylistsLoaderError);
       });
     });
   }

   // Run the contract against the FakePlaylistsLoader.
   runPlaylistsLoaderContract('FakePlaylistsLoader', (result) => {
     if ('throws' in result) {
       return new FakePlaylistsLoader({ kind: 'failure', throws: result.throws });
     }
     return new FakePlaylistsLoader({ kind: 'success', playlists: result.playlists, likedSongs: result.likedSongs });
   });
   ```

2. Note `runPlaylistsLoaderContract` is *exported* so WP05 can `import { runPlaylistsLoaderContract } from '../ports/playlists-loader-contract.test';` and re-run it. The Vitest config's `include` already picks up `.test.ts` files, so the suite runs both standalone and (via re-import) inside WP05's adapter test.

**Files**: `test/ports/playlists-loader-contract.test.ts` (new).

**Validation**:

- [ ] All 10 error reasons covered via `it.each`.
- [ ] Happy path and empty-library path both covered.
- [ ] Suite factory is exported for WP05 reuse.
- [ ] `expect(loader.load()).rejects.toSatisfy(...)` is the assertion (not `try/catch` — let Vitest's rejection assertion own this).

### T018 — Fake adapter passes the contract suite

**Purpose**: Demonstrate that the fake adapter satisfies the contract. The standalone `runPlaylistsLoaderContract('FakePlaylistsLoader', …)` call from T017 covers this — there is no additional code to write, but there is verification work.

**Steps**:

1. Run `npm run test:run -- test/ports/playlists-loader-contract.test.ts`. Confirm every test passes.
2. Add one more deliberate test outside the contract suite that asserts a fake-specific property:

   ```ts
   describe('FakePlaylistsLoader specifics', () => {
     it('increments callCount on each invocation', async () => {
       const loader = new FakePlaylistsLoader({ kind: 'success', playlists: [], likedSongs: { trackCount: 0 } });
       expect(loader.callCount).toBe(0);
       await loader.load();
       expect(loader.callCount).toBe(1);
       await loader.load();
       expect(loader.callCount).toBe(2);
     });

     it('callCount is observable across mixed success and failure-throwing variants', async () => {
       const loader = new FakePlaylistsLoader({ kind: 'failure', throws: new PlaylistsLoaderError('rootlist-fetch-failed', 'x') });
       await expect(loader.load()).rejects.toBeInstanceOf(PlaylistsLoaderError);
       expect(loader.callCount).toBe(1);
     });
   });
   ```

3. Confirm 100 % coverage on `fake-playlists-loader.ts`.

**Files**: `test/ports/playlists-loader-contract.test.ts` (extend).

**Validation**:

- [ ] All contract tests green for the fake.
- [ ] `callCount` tests cover both success and failure paths.
- [ ] 100 % coverage.

## Test strategy

Black-box per DIRECTIVE_036. The contract test treats the loader as an opaque object exposing one method; the fake's tests verify only the implementation-specific `callCount` field. WP05 re-uses the contract test against a `vi.stubGlobal`-driven adapter — same suite, different implementation.

## Definition of Done

- [ ] `src/ports/playlists-loader.ts` exists with JSDoc and the `PlaylistsLoader` interface.
- [ ] `src/adapters/fake-playlists-loader.ts` exists with `FakePlaylistsLoader` and `FakeLoaderResult`.
- [ ] `test/ports/playlists-loader-contract.test.ts` exists; contract suite passes for the fake; suite factory exported.
- [ ] 100 % coverage on both new `src/` files.
- [ ] Architecture test still green; the adapter file doesn't import from `store/` or `ui/`.
- [ ] `tsc --noEmit` clean.

## Risks

- **`test/ports/` is a new test subdirectory** not covered by `test/setup.ts`'s cleanup at the moment. Verify Vitest picks it up via the config's `include: ['test/**/*.test.{ts,tsx}']` (it does — `**/`).
- **`toSatisfy` syntax** is Vitest 4-specific. If for any reason the suite is back-ported, rewrite as `try { await loader.load(); throw new Error('expected rejection'); } catch (e) { expect(isPlaylistsLoaderError(e)).toBe(true); ... }`.
- **Coverage of the fake's failure variant**: ensure the failure-mode test actually executes — `await expect(...).rejects` is the correct pattern; bare `await loader.load()` in a `try` would also work.

## Reviewer guidance

- Pull the branch. Run `npm run test:coverage`. Both new `src/` files at 100 %.
- Open `src/ports/playlists-loader.ts`. Compare line-for-line with `contracts/playlists-loader-port.md` "Interface" section.
- Open `src/adapters/fake-playlists-loader.ts`. Verify it implements `PlaylistsLoader` (the interface is in the `implements` clause). Confirm `callCount` semantics.
- Open `test/ports/playlists-loader-contract.test.ts`. Verify `runPlaylistsLoaderContract` is exported. Verify all 10 reason values from the union are exercised. Confirm at least one test for the empty-library path.
- Confirm the architecture test still passes. The new test file under `test/ports/` does not violate any rule.
