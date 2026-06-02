# Quickstart — Load Dedup-able Playlists

**Mission**: `load-dedupable-playlists-01KT3XW3`
**Date**: 2026-06-02
**Audience**: Whoever runs `/spec-kitty.tasks` next, and whoever implements each work package.

This is the TDD-driven build sequence for the feature. Each work package starts with a failing test, watches it fail, then ships the implementation that turns it green. No WP advances without `npm run test:run` passing and `tsc --noEmit` clean.

---

## 0. Prerequisites

- Node 20+ on the dev machine.
- Spicetify CLI 2.43+ installed and `spicetify config` initialized.
- Spotify desktop client installed and the custom-app registered:

  ```
  spicetify config custom_apps spicetify-dedup
  spicetify apply
  ```

- This repo cloned at `/home/alex/Documents/repos/SpicetifyDedup_Prototype` with `npm install` already run.
- Existing Hello World iteration green: `npm run test:run` passes.

---

## 1. Definition of done (whole feature)

- [ ] Every FR / NFR / C / SC in [spec.md](spec.md) maps to at least one test (see traceability table at the bottom of this file).
- [ ] `npm run test:run` shows 100 % line and 100 % branch coverage across `src/`.
- [ ] `tsc --noEmit` reports zero errors.
- [ ] Opening the Dedup page in a running Spotify client (after `npm run build` and `spicetify apply`) shows the idle state with a load button; clicking it loads the user's playlists + Liked Songs; the failure path renders correctly when the Platform call is forced to throw (verified manually with `Spicetify.Platform.RootlistAPI` temporarily overridden in DevTools).
- [ ] README updated to reflect the new state of the page (replaces "renders Hello World" with the new behavior summary).
- [ ] Three ADRs present and committed-to-the-mission at `/home/alex/Documents/repos/SpicetifyDedup_Prototype/.claude/adr/000{1,2,3}-*.md`.

---

## 2. Work-package build order

This is the recommended order. `/spec-kitty.tasks` produces the canonical work-package files (`WP01.md` … `WPNN.md`); this section is the architect's guidance to inform that breakdown. The order respects test-first discipline and the dependency graph: nothing depends on a module that hasn't been built.

### WP01 — Scaffolding & gates

**Goal**: install the new runtime dependency, configure coverage, and add the import-graph architecture test.

Steps:

1. Add `zustand` to `dependencies` in `/home/alex/Documents/repos/SpicetifyDedup_Prototype/package.json` (`npm install zustand`).
2. Add `@vitest/coverage-v8` to `devDependencies`.
3. Update `/home/alex/Documents/repos/SpicetifyDedup_Prototype/vitest.config.ts` to enable coverage with the `v8` provider, `100` thresholds for lines and branches, and includes set to `src/**/*.{ts,tsx}` (exclude `src/types/**`).
4. Write `/home/alex/Documents/repos/SpicetifyDedup_Prototype/test/architecture.test.ts` — a static test that reads each source file and asserts the hexagonal import rules:
   - Files in `src/domain/**` MUST NOT import from `react`, `zustand`, `Spicetify`, `src/adapters/**`, `src/store/**`, or `src/ui/**`.
   - Files in `src/ports/**` MUST NOT import from `src/adapters/**`, `src/store/**`, or `src/ui/**`.
   - Files in `src/adapters/**` MUST NOT import from `src/store/**` or `src/ui/**`.
   - Files in `src/ui/**` MUST NOT import from `src/adapters/**` directly (only through the store).
5. Add `/home/alex/Documents/repos/SpicetifyDedup_Prototype/src/types/spicetify-platform.d.ts` with `declare global { namespace Spicetify { … } }` augmentations narrowly typing the `Platform.RootlistAPI` / `Platform.LibraryAPI` shapes this iteration uses (best-effort; refined in WP05).

**Done when**: `npm run test:run` passes (architecture test green by default since no source files in those dirs exist yet); coverage reporter shows 100 % (nothing to cover); typecheck clean.

### WP02 — Domain: load-state FSM

**Test first** (`test/domain/load-state.test.ts`): every cell of the transition table in [data-model.md](data-model.md) §6. Including the ignored-action cases.

**Implementation** (`src/domain/load-state.ts`): `LoadState` and `LoadAction` types; `transition(state, action): LoadState` pure function. JSDoc on every export.

**Done when**: `test/domain/load-state.test.ts` is green and contributes 100 % coverage of `load-state.ts`.

### WP03 — Domain: errors

**Test first** (`test/domain/errors.test.ts`): construction with every `PlaylistsLoaderErrorReason`; `isPlaylistsLoaderError(x)` true for valid instances, false for plain `Error`, `null`, `undefined`, strings, and `{}`.

**Implementation** (`src/domain/errors.ts`): `PlaylistsLoaderError` class, `PlaylistsLoaderErrorReason` union, `isPlaylistsLoaderError` classifier.

### WP04 — Domain: eligibility, ordering, view-models

Three small modules, three small test files. Each landed independently in TDD order.

- `test/domain/eligibility.test.ts` → truth table over `(isOwnedByMe, isCollaborative, canEdit)`. Owned-by-me passes regardless of the other two; collaborative-and-can-edit passes; everything else fails. Liked Songs handled separately (not a `RawCollection`).
- `src/domain/eligibility.ts` → `isEligible(c: RawCollection): boolean`.
- `test/domain/ordering.test.ts` → input order preserved; Liked Songs pinned via the `toViewModels` boundary (covered next).
- `src/domain/ordering.ts` → currently a no-op identity function on `RawCollection[]`, but exported as a named function so it has a stable extension point for future iterations that reorder.
- `test/domain/view-models.test.ts` → `toViewModels(eligible, likedSongs)` yields Liked Songs row first, then each eligible playlist in input order; placeholder image when `imageUrl === null`; long names pass through unchanged.
- `src/domain/view-models.ts` → `toViewModels`, `RawCollection`, `LikedSongsSummary`, `CollectionViewModel`, `OwnerIdentity` types.

### WP05 — Port + production adapter + test fake

**Test first**:

- `test/ports/playlists-loader-contract.test.ts` — shared contract suite; runs against both adapters (see contract doc).
- `test/adapters/spicetify-playlists-loader.test.ts` — `vi.stubGlobal('Spicetify', …)` drives the production adapter. Covers: host-unavailable; rootlist-fetch-failed; each shape-validation failure; happy path; mutation-API not called.

**Implementation**:

- `src/ports/playlists-loader.ts` — the interface from [`contracts/playlists-loader-port.md`](contracts/playlists-loader-port.md).
- `src/adapters/spicetify-playlists-loader.ts` — production adapter. **This is the WP that requires live DevTools.** Capture the actual `Platform.RootlistAPI` response shape from the running client, save the fixture into `test/adapters/fixtures/rootlist-response.sample.json`, and write the adapter against that fixture.
- `src/adapters/fake-playlists-loader.ts` — in-memory test fake.

Both adapters MUST pass the shared contract suite.

### WP06 — Store

**Test first** (`test/store/playlists-store.test.ts`): given a fake loader, exercise every `triggerLoad` and `retry` path:

- Initial state is `idle`; no port calls until `triggerLoad`.
- `triggerLoad` transitions through `loading` to `loaded` for a non-empty result.
- `triggerLoad` transitions through `loading` to `empty` for a zero-eligible result.
- `triggerLoad` transitions through `loading` to `failed` when the loader throws.
- A non-`PlaylistsLoaderError` from the loader is wrapped into `PlaylistsLoaderError('rootlist-fetch-failed', …)` with the original as `cause`.
- `retry` from `failed` re-enters `loading` and dispatches the next outcome.
- Boundary tests for `items.length`: 0 → `empty`; 1 → `loaded`; 1,000 → `loaded`.

**Implementation** (`src/store/playlists-store.ts`): Zustand store factory accepting an injected `PlaylistsLoader`. The default export is a singleton store wired to `new SpicetifyPlaylistsLoader()`; the factory `createPlaylistsStore(loader)` exists for tests.

### WP07 — UI: views, in TDD order

Each view file gets a sibling test file under `test/ui/`. Order:

1. `IdleView` + test — trigger button click dispatches `triggerLoad`; no port calls without click; correct ARIA label.
2. `LoadingView` + test — non-blocking indicator visible; semantic role.
3. `EmptyView` + test — distinct empty-state copy; not a spinner, not a failure.
4. `FailedView` + test — explanation text derived from `PlaylistsLoaderError.reason` via a small lookup table; retry button dispatches `retry`.
5. `PlaylistRow` + test — name, owner identity rendering for `'self'` vs `'other'`, track count, cover with placeholder when `imageUrl === null`.
6. `LikedSongsRow` + test — fixed copy and styling; rendered when `kind === 'liked-songs'`.
7. `LoadedView` + test — iterates view models; Liked Songs renders the dedicated row; ordering preserved.
8. `DedupPage` + test — routes the store's `LoadState.kind` to the right view.

Each view consumes only view-model types from `src/domain/view-models.ts` and the store's hook. None import the port or adapter directly.

### WP08 — Page wiring + Hello World cleanup

- Replace `src/app.tsx`'s `<div>Hello World</div>` with `<DedupPage />`.
- Delete `test/app.test.tsx` (the Hello World smoke test) — it's superseded by `DedupPage.test.tsx`.
- Verify the test suite still passes and coverage remains 100 %.
- Build (`npm run build`), apply (`spicetify apply`), and click through the page in the running client. Verify:
  - Page mounts in idle state with a single Load button.
  - DevTools Network tab shows zero outbound calls until the button is clicked (verifies SC-6).
  - Click triggers a successful load against the real library.
  - Force-throwing from `Spicetify.Platform.RootlistAPI` in DevTools triggers the failure state with retry working.

### WP09 — README update

- Update `/home/alex/Documents/repos/SpicetifyDedup_Prototype/README.md`. Replace the Hello World status text with: "The Dedup page renders an idle state with a Load button; clicking it lists the user's dedup-eligible collections (owned playlists, collaborative playlists with edit rights, and Liked Songs) with Liked Songs pinned first. Loading and failure states match `kitty-specs/load-dedupable-playlists-01KT3XW3/spec.md`."
- Confirm test + typecheck still pass.

---

## 3. Traceability — spec items → tests / WPs

| Spec item | Verified by | Lives in WP |
| --- | --- | --- |
| FR-001 owned playlists | `test/domain/eligibility.test.ts`, `test/ports/playlists-loader-contract.test.ts` | WP04, WP05 |
| FR-002 collaborative-editable playlists | `test/domain/eligibility.test.ts` | WP04 |
| FR-003 Liked Songs pinned | `test/domain/view-models.test.ts`, `test/ui/LoadedView.test.tsx`, `test/ui/LikedSongsRow.test.tsx` | WP04, WP07 |
| FR-004 exclude non-eligible | `test/domain/eligibility.test.ts` | WP04 |
| FR-005 row fields | `test/domain/view-models.test.ts`, `test/ui/PlaylistRow.test.tsx`, `test/ui/LikedSongsRow.test.tsx` | WP04, WP07 |
| FR-006 native order + Liked Songs first | `test/domain/ordering.test.ts`, `test/domain/view-models.test.ts`, `test/ui/LoadedView.test.tsx` | WP04, WP07 |
| FR-007 loading indicator | `test/ui/LoadingView.test.tsx` | WP07 |
| FR-008 failure + retry | `test/ui/FailedView.test.tsx`, `test/store/playlists-store.test.ts` | WP06, WP07 |
| FR-009 empty state | `test/ui/EmptyView.test.tsx`, `test/store/playlists-store.test.ts` | WP06, WP07 |
| FR-010 Hello World replaced | `test/ui/DedupPage.test.tsx`; manual run in WP08 | WP07, WP08 |
| FR-011 idle + trigger | `test/ui/IdleView.test.tsx`, `test/store/playlists-store.test.ts` | WP06, WP07 |
| FR-012 trigger one-shot | `test/ui/IdleView.test.tsx`, `test/store/playlists-store.test.ts` | WP06, WP07 |
| NFR-001 algorithmic efficiency | `test/adapters/spicetify-playlists-loader.test.ts` (no-redundant-calls assertions) | WP05 |
| NFR-002 1,000-playlist headroom | `test/store/playlists-store.test.ts` (boundary), `test/ui/LoadedView.test.tsx` (large-list render) | WP06, WP07 |
| NFR-003 UI responsive during load | manual verification at WP08 + `test/ui/LoadingView.test.tsx` non-blocking assertion | WP07, WP08 |
| NFR-004 failure transitions out of loading | `test/store/playlists-store.test.ts`, `test/domain/load-state.test.ts` | WP02, WP06 |
| C-001 read-only | `test/ports/playlists-loader-contract.test.ts` (mutation APIs stubbed, asserted zero calls) | WP05 |
| C-002 metadata only | architecture test (no track-enumeration imports), code review | WP01 |
| C-003 no selection affordances | review of `LoadedView`/`PlaylistRow` (no `onClick` triggering selection) | WP07 |
| C-004 no live refresh | review of store (no polling, no subscriptions) | WP06 |
| C-005 no cross-session persistence | review (no `Spicetify.LocalStorage` / `localStorage` calls) | WP06 |
| C-006 no auto-fetch on mount | `test/store/playlists-store.test.ts` initial-state assertion, `test/ui/IdleView.test.tsx` | WP06, WP07 |
| SC-1 completeness on trigger | `test/store/playlists-store.test.ts` + `test/domain/view-models.test.ts` | WP04, WP06 |
| SC-2 0 % non-eligible included | `test/domain/eligibility.test.ts` | WP04 |
| SC-3 glance-identifiable rows | `test/ui/PlaylistRow.test.tsx`, `test/ui/LikedSongsRow.test.tsx` | WP07 |
| SC-4 failure + retry visible | `test/ui/FailedView.test.tsx` | WP07 |
| SC-5 empty state distinct | `test/ui/EmptyView.test.tsx` | WP07 |
| SC-6 zero fetches before trigger | architecture test + `test/store/playlists-store.test.ts` initial-state + manual verification in WP08 (DevTools Network) | WP01, WP06, WP08 |

Every spec item is covered. No orphan tests; no orphan requirements.

---

## 4. Daily TDD recipe (per file)

```
1. Open the test file. Write the smallest failing test that exercises the next
   behavior. Save.
2. `npm run test:run -- --reporter=verbose <path-to-test>` — confirm it fails
   for the expected reason (not a typo, not a missing import).
3. Open the source file. Write the minimum code to turn the test green.
4. Save. Re-run the test. Green.
5. Refactor if needed (in either file). Re-run. Still green.
6. Repeat until the file's required behaviors are covered.
7. Run the full suite + coverage: `npm run test:run`. Confirm coverage is still
   100 % and no other test regressed.
8. Run `tsc --noEmit`. Confirm clean.
```

If a step ever fails for an unexpected reason, stop. Read the failure. Fix the test or the assumption, not the symptom. The charter's fail-loud philosophy applies to the dev loop too.
