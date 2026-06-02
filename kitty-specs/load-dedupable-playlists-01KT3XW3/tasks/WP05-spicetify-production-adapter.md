---
work_package_id: WP05
title: Spicetify Production Adapter
dependencies:
- WP04
requirement_refs:
- C-001
- NFR-001
planning_base_branch: get_library
merge_target_branch: get_library
branch_strategy: Planning artifacts for this feature were generated on get_library. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into get_library unless the human explicitly redirects the landing branch.
subtasks:
- T019
- T020
- T021
- T022
- T023
agent: "claude"
shell_pid: "85546"
history:
- timestamp: '2026-06-02T11:11:28Z'
  action: created
  by: spec-kitty.tasks
  note: Initial WP scaffold generated from /spec-kitty.tasks for mission load-dedupable-playlists-01KT3XW3.
authoritative_surface: src/adapters/spicetify-playlists-loader.ts
execution_mode: code_change
mission_id: 01KT3XW3AWY8W0YJKCE9TYNQKX
mission_slug: load-dedupable-playlists-01KT3XW3
owned_files:
- src/adapters/spicetify-playlists-loader.ts
- test/adapters/spicetify-playlists-loader.test.ts
- test/adapters/fixtures/rootlist-response.sample.json
- test/adapters/fixtures/liked-songs-response.sample.json
tags: []
---

# WP05 — Spicetify Production Adapter

## Objective

Implement the production `SpicetifyPlaylistsLoader` against the live `Spicetify.Platform.RootlistAPI` and `Spicetify.Platform.LibraryAPI`. This WP requires a running Spotify desktop client with the Dedup extension loaded so the implementer can capture the actual Platform response shapes from DevTools before writing the adapter. Once the captured shapes are committed as JSON fixtures, the adapter is built test-first with `vi.stubGlobal('Spicetify', …)` driving the unit tests.

The adapter is the single module boundary between the host runtime and the rest of the codebase. It owns: host-availability checks, response-shape validation (fail-loud), error normalization to `PlaylistsLoaderError`, and translation to domain types.

## Branch Strategy

Planning base = merge target = `get_library`. The execution agent invokes `spec-kitty agent action implement WP05 --agent <name>`; the runtime resolves the lane and workspace path from `lanes.json`. No git operations are performed by the agent — the user owns commits.

## Context

The exact field names on `Spicetify.Platform.RootlistAPI` are an implementation-time discovery — they are not in any committed spec because they cannot be derived without a live client (`research.md` "Deferred to implementation"). This is the WP where that discovery happens. The implementer:

1. Runs `npm run watch` so spicetify-creator builds into `~/.config/spicetify/CustomApps/spicetify-dedup/` on every save.
2. Runs `spicetify watch -a -l` so the client live-reloads.
3. Opens the Dedup page in the running client; in DevTools console evaluates `Spicetify.Platform.RootlistAPI` and `Spicetify.Platform.LibraryAPI` to enumerate methods.
4. Calls candidate methods and captures their return values into fixture files.

`Spicetify.Platform.RootlistAPI` is undocumented. Community sightings of the method name vary: `getContents`, `getRootlist`, `getFolder`. The implementer's first job is to confirm which method exists and what shape it returns. Likewise for `LibraryAPI` (the `data-porter` reference impl uses `getTracks({ limit, offset })` — for this iteration we only need `totalLength` from the first call).

The contract test from WP04 (`runPlaylistsLoaderContract`) is re-imported here and run with a factory that constructs the production adapter. Same suite; different implementation. If the suite fails, the adapter is broken — no other test bypasses it.

## Detailed guidance per subtask

### T019 — Capture `Platform.RootlistAPI` live fixture

**Purpose**: Record the actual response shape from a running client into a versioned fixture file.

**Steps**:

1. Ensure the extension is registered and applied (`spicetify config custom_apps spicetify-dedup`, `spicetify apply`).
2. In the project root run `npm run watch` (one terminal) and `spicetify watch -a -l` (second terminal).
3. Open Spotify. Open DevTools (`Ctrl+Shift+I` or via Spicetify keybind).
4. In the Console, evaluate:

   ```js
   Object.keys(Spicetify.Platform.RootlistAPI)
   ```

   Note the method names. The most plausible enumeration method (per community sightings): `getContents` returning a nested folder/playlist tree, or `getRootlist` returning a flattened list.

5. Call the candidate method and capture the result:

   ```js
   const r = await Spicetify.Platform.RootlistAPI.getContents();
   copy(JSON.stringify(r, null, 2));   // copies pretty-printed JSON to clipboard
   ```

6. Paste the captured JSON into `test/adapters/fixtures/rootlist-response.sample.json`. Redact any account-specific data — usernames, internal IDs that look sensitive — into a placeholder (e.g. replace `"username": "alex_real"` with `"username": "test-user-1"`). Preserve the shape.
7. If the response is nested (folders containing playlists containing folders), include at least one folder + one playlist + one collaborative playlist in the captured slice. If the implementer's real library doesn't include all three, augment the fixture by hand to include synthetic entries with the discovered shape.

**Files**: `test/adapters/fixtures/rootlist-response.sample.json` (new).

**Validation**:

- [ ] Fixture is valid JSON.
- [ ] Includes at least one owned playlist, one collaborative-editable playlist, and one non-eligible item.
- [ ] No account-specific PII.

### T020 — Capture `Platform.LibraryAPI` Liked Songs fixture

**Purpose**: Record the response shape from `LibraryAPI.getTracks({ limit: 1, offset: 0 })` — we only need `totalLength` in this iteration, but the fixture should preserve the full envelope for future iterations.

**Steps**:

1. In DevTools Console:

   ```js
   const r = await Spicetify.Platform.LibraryAPI.getTracks({ limit: 1, offset: 0 });
   copy(JSON.stringify(r, null, 2));
   ```

2. Paste into `test/adapters/fixtures/liked-songs-response.sample.json`. Redact PII in the single track item.
3. Confirm `totalLength` is present at the top level.

**Files**: `test/adapters/fixtures/liked-songs-response.sample.json` (new).

**Validation**:

- [ ] Fixture is valid JSON.
- [ ] Includes `totalLength: number`.
- [ ] No PII.

### T021 — TDD `src/adapters/spicetify-playlists-loader.ts`

**Purpose**: Implement the production adapter against the captured fixtures. Test-first.

**Steps**:

1. **Failing test first**. Open `test/adapters/spicetify-playlists-loader.test.ts`:

   ```ts
   import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
   import { SpicetifyPlaylistsLoader } from '../../src/adapters/spicetify-playlists-loader';
   import { PlaylistsLoaderError, isPlaylistsLoaderError } from '../../src/domain/errors';
   import rootlistFixture from './fixtures/rootlist-response.sample.json';
   import likedFixture from './fixtures/liked-songs-response.sample.json';

   describe('SpicetifyPlaylistsLoader', () => {
     afterEach(() => vi.unstubAllGlobals());

     it('throws host-unavailable when Spicetify is missing', async () => {
       vi.stubGlobal('Spicetify', undefined);
       const loader = new SpicetifyPlaylistsLoader();
       await expect(loader.load()).rejects.toSatisfy((e: unknown) =>
         isPlaylistsLoaderError(e) && e.reason === 'host-unavailable',
       );
     });

     it('throws host-unavailable when Platform.RootlistAPI is missing', async () => {
       vi.stubGlobal('Spicetify', { Platform: { LibraryAPI: {} } });
       const loader = new SpicetifyPlaylistsLoader();
       await expect(loader.load()).rejects.toSatisfy((e: unknown) =>
         isPlaylistsLoaderError(e) && e.reason === 'host-unavailable',
       );
     });
   });
   ```

2. Run, watch fail. Create `src/adapters/spicetify-playlists-loader.ts`:

   ```ts
   import type { PlaylistsLoader } from '../ports/playlists-loader';
   import type {
     RawCollection,
     LikedSongsSummary,
     OwnerIdentity,
   } from '../domain/view-models';
   import { isRawCollection } from '../domain/view-models';
   import { PlaylistsLoaderError } from '../domain/errors';

   /**
    * Production PlaylistsLoader implementation. Reads the user's rootlist
    * (playlist tree) and Liked Songs summary from Spicetify.Platform.
    * Validates fail-loud at every shape boundary; normalizes to domain types.
    *
    * This is the SINGLE module in the codebase that touches the global
    * Spicetify object. The architecture test enforces that no other src/
    * file under domain/, ports/, store/, or ui/ imports from here.
    */
   export class SpicetifyPlaylistsLoader implements PlaylistsLoader {
     async load() {
       const platform = this.requirePlatform();
       const rootlist = await this.fetchRootlist(platform.RootlistAPI);
       const likedSongs = await this.fetchLikedSongs(platform.LibraryAPI);
       return { playlists: rootlist, likedSongs };
     }

     private requirePlatform() {
       if (typeof Spicetify === 'undefined' ||
           !Spicetify ||
           !Spicetify.Platform ||
           !Spicetify.Platform.RootlistAPI ||
           !Spicetify.Platform.LibraryAPI) {
         throw new PlaylistsLoaderError(
           'host-unavailable',
           'Spicetify.Platform.{RootlistAPI,LibraryAPI} not available',
         );
       }
       return Spicetify.Platform;
     }

     private async fetchRootlist(api: Spicetify.Platform.RootlistAPI): Promise<RawCollection[]> {
       let raw: unknown;
       try {
         raw = await api.getContents();
       } catch (cause) {
         throw new PlaylistsLoaderError(
           'rootlist-fetch-failed',
           'Platform.RootlistAPI.getContents() threw',
           { cause },
         );
       }
       return this.normalizeRootlist(raw);
     }

     private normalizeRootlist(raw: unknown): RawCollection[] {
       // Implementation derived from the captured fixture in WP05.
       // 1. Walk the (possibly nested) tree.
       // 2. For each playlist-shaped node, build a RawCollection.
       // 3. Filter out folders/separators/non-playlist nodes silently.
       // 4. Validate each RawCollection via isRawCollection; throw on drift.
       //
       // Fill in body once the fixture shape is known.
       // ...
     }

     private async fetchLikedSongs(api: Spicetify.Platform.LibraryAPI): Promise<LikedSongsSummary> {
       let raw: unknown;
       try {
         raw = await api.getTracks({ limit: 1, offset: 0 });
       } catch (cause) {
         throw new PlaylistsLoaderError(
           'liked-songs-fetch-failed',
           'Platform.LibraryAPI.getTracks() threw',
           { cause },
         );
       }
       const totalLength = (raw as { totalLength?: unknown })?.totalLength;
       if (typeof totalLength !== 'number' || !Number.isInteger(totalLength) || totalLength < 0) {
         throw new PlaylistsLoaderError(
           'liked-songs-invalid-track-count',
           `Expected totalLength to be a non-negative integer; got ${String(totalLength)}`,
         );
       }
       return { trackCount: totalLength };
     }
   }
   ```

3. Implement `normalizeRootlist` against the captured fixture. Treat the fixture as the authoritative shape source; use `isRawCollection` to validate each constructed `RawCollection` and throw `'rootlist-item-unsupported-shape'` if any item fails the structural check.

4. Add happy-path test using the captured fixture:

   ```ts
   it('happy path: returns normalized playlists from the captured fixture', async () => {
     vi.stubGlobal('Spicetify', {
       Platform: {
         RootlistAPI: { getContents: vi.fn().mockResolvedValue(rootlistFixture) },
         LibraryAPI: { getTracks: vi.fn().mockResolvedValue(likedFixture) },
       },
     });
     const loader = new SpicetifyPlaylistsLoader();
     const { playlists, likedSongs } = await loader.load();
     expect(playlists.length).toBeGreaterThan(0);
     expect(likedSongs.trackCount).toBe(likedFixture.totalLength);
     for (const p of playlists) {
       expect(typeof p.uri).toBe('string');
       expect(p.owner.kind).toMatch(/self|other/);
     }
   });
   ```

**Files**: `src/adapters/spicetify-playlists-loader.ts` (new), `test/adapters/spicetify-playlists-loader.test.ts` (new).

### T022 — Test every `PlaylistsLoaderError` reason

**Purpose**: Drive each error-throwing branch of the adapter with a tailored stub.

**Steps**: Add per-reason tests:

```ts
it('rootlist-fetch-failed when RootlistAPI throws', async () => {
  vi.stubGlobal('Spicetify', {
    Platform: {
      RootlistAPI: { getContents: vi.fn().mockRejectedValue(new Error('boom')) },
      LibraryAPI: { getTracks: vi.fn() },
    },
  });
  const loader = new SpicetifyPlaylistsLoader();
  await expect(loader.load()).rejects.toSatisfy((e: unknown) =>
    isPlaylistsLoaderError(e) && e.reason === 'rootlist-fetch-failed',
  );
});

it('liked-songs-invalid-track-count when totalLength is not a number', async () => {
  vi.stubGlobal('Spicetify', {
    Platform: {
      RootlistAPI: { getContents: vi.fn().mockResolvedValue(rootlistFixture) },
      LibraryAPI: { getTracks: vi.fn().mockResolvedValue({ totalLength: 'not-a-number' }) },
    },
  });
  const loader = new SpicetifyPlaylistsLoader();
  await expect(loader.load()).rejects.toSatisfy((e: unknown) =>
    isPlaylistsLoaderError(e) && e.reason === 'liked-songs-invalid-track-count',
  );
});

it('rootlist-item-missing-name when an item lacks a name', async () => {
  const broken = { ...rootlistFixture, /* tweak to remove a name */ };
  // ... stub and expect 'rootlist-item-missing-name'
});
```

Cover every reason: `host-unavailable`, `host-auth-expired`, `rootlist-fetch-failed`, `rootlist-item-missing-name`, `rootlist-item-missing-owner`, `rootlist-item-invalid-track-count`, `rootlist-item-missing-flag`, `rootlist-item-unsupported-shape`, `liked-songs-fetch-failed`, `liked-songs-invalid-track-count`.

`host-auth-expired` is detected by inspecting the rejection from `RootlistAPI.getContents()` for an auth-expired indicator (a string match in the error message, an HTTP status code, etc. — discovered empirically). If the implementer can't reliably trigger it, leave a `// TODO: refine` comment and document the gap in the WP review notes.

**Files**: `test/adapters/spicetify-playlists-loader.test.ts` (extend).

**Validation**:

- [ ] All 10 `PlaylistsLoaderErrorReason` values exercised.
- [ ] 100 % branch coverage on the adapter.

### T023 — Production adapter passes the contract suite

**Purpose**: Re-run the WP04 contract suite against the production adapter. Asserts mutation APIs are never called.

**Steps**:

1. Import the suite:

   ```ts
   import { runPlaylistsLoaderContract } from '../ports/playlists-loader-contract.test';
   ```

2. Create a factory that wraps the production adapter behind a `vi.stubGlobal` setup so the contract suite can drive it:

   ```ts
   runPlaylistsLoaderContract('SpicetifyPlaylistsLoader', (result) => {
     const removeStub = vi.fn();
     const addStub = vi.fn();
     if ('throws' in result) {
       const r = result.throws;
       // Map the requested error reason onto stub behaviors.
       // Most reasons can be produced by tweaking the RootlistAPI/LibraryAPI mocks.
       vi.stubGlobal('Spicetify', {
         Platform: {
           RootlistAPI: { getContents: vi.fn().mockRejectedValue(r) },
           LibraryAPI: { getTracks: vi.fn(), add: addStub, remove: removeStub },
         },
       });
     } else {
       vi.stubGlobal('Spicetify', {
         Platform: {
           RootlistAPI: { getContents: vi.fn().mockResolvedValue(buildRootlistFromDomain(result.playlists)) },
           LibraryAPI: { getTracks: vi.fn().mockResolvedValue({ totalLength: result.likedSongs.trackCount, items: [], offset: 0, limit: 1 }), add: addStub, remove: removeStub },
         },
       });
     }
     return new SpicetifyPlaylistsLoader();
   });
   ```

3. The helper `buildRootlistFromDomain` synthesizes a host-shaped rootlist response from the domain `RawCollection[]` the contract test passes in. Implement it inline; it's the inverse of `normalizeRootlist`. Keep it ~20 lines.

4. Add a no-mutation assertion that runs after each contract test:

   ```ts
   afterEach(() => {
     // Both addStub and removeStub should have zero calls across every test.
     // (They're scoped per stub call, so this assertion is per-test.)
   });
   ```

   Or, more idiomatically, instrument the per-`it` test to assert zero `add`/`remove` calls. Since the contract suite is shared, the easiest way is to add the assertion inside `runPlaylistsLoaderContract` itself — but that couples the contract to the production adapter's stub shape. Cleaner: add one dedicated test in `spicetify-playlists-loader.test.ts`:

   ```ts
   it('never calls mutation APIs (.add, .remove) during load', async () => {
     const add = vi.fn();
     const remove = vi.fn();
     vi.stubGlobal('Spicetify', {
       Platform: {
         RootlistAPI: { getContents: vi.fn().mockResolvedValue(rootlistFixture) },
         LibraryAPI: { getTracks: vi.fn().mockResolvedValue(likedFixture), add, remove },
       },
     });
     const loader = new SpicetifyPlaylistsLoader();
     await loader.load();
     expect(add).not.toHaveBeenCalled();
     expect(remove).not.toHaveBeenCalled();
   });
   ```

**Files**: `test/adapters/spicetify-playlists-loader.test.ts` (extend).

**Validation**:

- [ ] Contract suite passes against the production adapter for all reasons + happy path.
- [ ] No-mutation assertion passes.
- [ ] 100 % coverage on the adapter.

## Test strategy

`vi.stubGlobal('Spicetify', …)` in a `beforeEach`/`afterEach` block (with `vi.unstubAllGlobals()` in `afterEach`) gives perfect per-test isolation. The captured fixtures provide the realistic input shape; per-test stub overrides exercise the failure branches. The shared contract suite from WP04 makes the production adapter a drop-in implementation — if its tests fail, the implementation is broken.

## Definition of Done

- [ ] `src/adapters/spicetify-playlists-loader.ts` exists with the production implementation; JSDoc on every export.
- [ ] `test/adapters/spicetify-playlists-loader.test.ts` covers all 10 error reasons + happy path + no-mutation.
- [ ] `test/adapters/fixtures/rootlist-response.sample.json` and `liked-songs-response.sample.json` exist; PII-free.
- [ ] Contract suite from WP04 passes against the production adapter.
- [ ] 100 % coverage on the adapter.
- [ ] `npm run test:run` green; `tsc --noEmit` clean.
- [ ] Manual run in live client (open page, trigger load, see actual playlists in console via store inspector) succeeds. Manual verification of `spicetify-platform.d.ts` typings — refine any field names that turn out to differ from the WP01 best-effort.

## Risks

- **Fixture capture session burns 30–60 minutes** if Platform method names take exploration. Budget accordingly.
- **`host-auth-expired` reason may be hard to trigger artificially.** If the implementer can't get a reproducer in WP05, leave the branch unreachable in the adapter (throwing only on the documented signal) and add a comment. The contract test does not strictly require the adapter to *produce* this reason — it only requires the adapter to honor it when configured to.
- **Field names may shift between Spotify releases.** Don't pin against a specific Spotify version in the ambient typings; rely on the runtime validator to fail loud when drift happens.
- **Architecture test friction.** The adapter is allowed to import `Spicetify` (via the ambient global). Make sure the architecture test's allow-list permits this — see WP01 T003 rules.

## Reviewer guidance

- Confirm the captured fixtures contain at least one owned playlist, one collaborative-editable playlist, and one non-eligible item.
- Open `src/adapters/spicetify-playlists-loader.ts`. Verify it does NOT call `Platform.LibraryAPI.add` or `.remove` anywhere. Search the file for `add(` and `remove(` — should turn up empty.
- Confirm the architecture test still passes — no imports from `store/` or `ui/` in this file.
- Run the test suite. Coverage at 100 %.
- Spot-check one of the error-reason tests by deliberately corrupting a single rootlist item in the fixture; confirm the right reason is thrown. Revert.

## Activity Log

- 2026-06-02T22:25:41Z – claude – shell_pid=85546 – Started implementation via action command
- 2026-06-02T22:53:43Z – claude – shell_pid=85546 – Production SpicetifyPlaylistsLoader complete: live rootlist + liked-songs fixtures captured & redacted (augmented with synthetic collaborative + nested folder per brief authorization), adapter implemented test-first against the captured shapes, all 10 PlaylistsLoaderErrorReason values exercised, no-mutation invariant tested, shared runPlaylistsLoaderContract from WP04 passes against the production adapter via a stub factory. npm run test:run 255/255 green; tsc --noEmit clean; v8 coverage 100% lines/branches/functions/statements. host-auth-expired branch covered via stubbed 401/token-expired/token-invalid rejections; the empirical detector may need refinement once a real auth-expiry signal is observed in the live client.
