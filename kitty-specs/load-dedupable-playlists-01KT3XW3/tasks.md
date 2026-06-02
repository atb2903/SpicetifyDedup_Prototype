# Tasks: Load Dedup-able Playlists

**Mission slug**: `load-dedupable-playlists-01KT3XW3`
**Mission ID**: `01KT3XW3AWY8W0YJKCE9TYNQKX`
**Branch**: `get_library` (planning base = merge target)
**Generated**: 2026-06-02
**Inputs**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/playlists-loader-port.md](contracts/playlists-loader-port.md), [quickstart.md](quickstart.md)

## Overview

The feature replaces the Dedup page's Hello World placeholder with an idle landing surface that, on explicit user activation, lists the user's dedup-eligible collections (owned playlists, collaborative-editable playlists, Liked Songs pinned first). The implementation follows a hexagonal architecture (ADR `0001`), uses Spicetify Platform APIs (ADR `0002`), and manages load-state through a Zustand store (ADR `0003`). All work is read-only. TDD is mandatory; 100 % line + branch coverage is enforced at the runner.

**9 work packages, 38 subtasks.** Each WP is independently implementable, has a single cohesive goal, and respects file-level SRP. Dependency graph:

```
WP01 ─┬─ WP02 ──────────────────────── WP06 ─┬─ WP07 ─┐
      └─ WP03 ── WP04 ── WP05 ────────────┘  └─ WP08 ─┴── WP09
```

Parallel opportunities: WP02 + WP03 after WP01; WP07 + WP08 after WP06.

## Subtask Index (reference only — not a tracking surface)

| ID | Description | WP | Parallel |
|----|-------------|----|----------|
| T001 | Install `zustand` runtime dep | WP01 | |
| T002 | Add `@vitest/coverage-v8` + configure thresholds | WP01 | [P] |
| T003 | Architecture import-graph test | WP01 | [P] |
| T004 | Ambient types for Platform.RootlistAPI + LibraryAPI | WP01 | [P] |
| T005 | TDD load-state FSM types + transition fn | WP02 | |
| T006 | Boundary tests for FSM (items.length 0/1/N) | WP02 | |
| T007 | TDD PlaylistsLoaderError class + classifier | WP02 | [P] |
| T008 | Test every PlaylistsLoaderErrorReason value | WP02 | |
| T009 | TDD eligibility predicate | WP03 | [P] |
| T010 | TDD ordering rule (identity, extensible) | WP03 | [P] |
| T011 | Define domain types in view-models module | WP03 | |
| T012 | TDD toViewModels happy path | WP03 | |
| T013 | Test view-model edge cases (placeholder, long names, owner variants) | WP03 | |
| T014 | TDD isRawCollection classifier predicate | WP03 | [P] |
| T015 | Define PlaylistsLoader port interface | WP04 | |
| T016 | Implement FakePlaylistsLoader | WP04 | |
| T017 | Write cross-implementation contract test | WP04 | |
| T018 | Verify fake adapter passes contract suite | WP04 | |
| T019 | Capture Platform.RootlistAPI live fixture | WP05 | |
| T020 | Capture Platform.LibraryAPI Liked Songs fixture | WP05 | |
| T021 | TDD SpicetifyPlaylistsLoader (validation + normalization) | WP05 | |
| T022 | Test every PlaylistsLoaderError reason via stubGlobal | WP05 | |
| T023 | Verify production adapter passes contract suite | WP05 | |
| T024 | TDD createPlaylistsStore factory (initial state) | WP06 | |
| T025 | Test triggerLoad happy path (idle → loading → loaded) | WP06 | |
| T026 | Test triggerLoad empty/failure + wrapping | WP06 | |
| T027 | Test retry from failed re-enters loading | WP06 | |
| T028 | TDD IdleView (trigger button) | WP07 | [P] |
| T029 | TDD LoadingView (non-blocking indicator) | WP07 | [P] |
| T030 | TDD EmptyView (distinct empty copy) | WP07 | [P] |
| T031 | TDD FailedView (reason explanation + retry) | WP07 | [P] |
| T032 | TDD PlaylistRow (owner labels, placeholder cover) | WP08 | [P] |
| T033 | TDD LikedSongsRow (system row) | WP08 | [P] |
| T034 | TDD LoadedView (iterates view models, pins Liked Songs) | WP08 | |
| T035 | Wire singleton store + replace Hello World in app.tsx | WP09 | |
| T036 | TDD DedupPage routing (LoadState.kind → view) | WP09 | |
| T037 | Delete Hello World smoke test; verify 100 % coverage | WP09 | |
| T038 | Update README + manual verification in live Spotify client | WP09 | |

---

## Phase 1 — Setup & Foundation

### WP01 — Scaffolding & Gates

**Goal**: Stand up the project gates that every subsequent WP relies on — new runtime dependency (Zustand), coverage tooling configured to the charter's 100 % threshold, the hexagonal architecture import-graph test, and the ambient Platform type declarations.

**Priority**: Must-have (blocks all subsequent WPs).

**Independent test**: After WP01, `npm run test:run` reports 100 % coverage (trivially, since no `src/` code outside types exists yet), `tsc --noEmit` is clean, the architecture test runs green (no violations to flag), and `zustand` is importable from a fresh `src/store/_dummy.ts` (deleted before commit).

**Estimated prompt size**: ~350 lines.

**Included subtasks**:

- [ ] T001 Install `zustand` as a runtime dependency
- [ ] T002 Add `@vitest/coverage-v8` and configure 100 % thresholds in `vitest.config.ts`
- [ ] T003 Write architecture import-graph test at `test/architecture.test.ts`
- [ ] T004 Create ambient typings for `Spicetify.Platform.RootlistAPI` + `LibraryAPI` at `src/types/spicetify-platform.d.ts`

**Prompt**: [`tasks/WP01-scaffolding-and-gates.md`](tasks/WP01-scaffolding-and-gates.md)

**Dependencies**: none.
**Parallel within WP**: T002, T003, T004 are independent and can run in parallel after T001 lands. T001 must land first because `tsc --noEmit` will fail with missing `zustand` types until it does.
**Requirement refs**: (gates only — no direct FR/NFR coverage)

---

## Phase 2 — Pure Domain

### WP02 — Domain: Load-State FSM & Errors

**Goal**: Land the pure-TypeScript foundation that the store and adapter both depend on: the load-state finite state machine (`LoadState`, `LoadAction`, `transition`) and the typed error class (`PlaylistsLoaderError`, `isPlaylistsLoaderError`). Zero React, zero Spicetify, zero Zustand imports.

**Priority**: Must-have (blocks WP06).

**Independent test**: After WP02, `test/domain/load-state.test.ts` and `test/domain/errors.test.ts` are green, contributing 100 % coverage of both source files; `tsc --noEmit` clean.

**Estimated prompt size**: ~400 lines.

**Included subtasks**:

- [ ] T005 TDD `src/domain/load-state.ts` — types + pure `transition(state, action)` fn
- [ ] T006 Boundary tests for FSM: items.length at 0, 1, 2, and 1,000
- [ ] T007 TDD `src/domain/errors.ts` — `PlaylistsLoaderError` class + `isPlaylistsLoaderError` classifier
- [ ] T008 Test error construction for every `PlaylistsLoaderErrorReason` union member

**Prompt**: [`tasks/WP02-domain-load-state-and-errors.md`](tasks/WP02-domain-load-state-and-errors.md)

**Dependencies**: WP01.
**Parallel within WP**: T007/T008 are independent of T005/T006 — both can be developed simultaneously by one engineer alternating files.
**Requirement refs**: NFR-004 (failure exits loading state).

---

### WP03 — Domain: Eligibility, Ordering, View Models

**Goal**: Land the three pure-domain modules that drive what gets rendered: the eligibility predicate, the ordering rule, and the view-model transform that produces `CollectionViewModel[]` for the rendered list. Establishes domain types (`RawCollection`, `LikedSongsSummary`, `OwnerIdentity`, `CollectionViewModel`) and the `isRawCollection` classifier the adapter consumes.

**Priority**: Must-have (blocks WP04).

**Independent test**: After WP03, `test/domain/{eligibility,ordering,view-models}.test.ts` are green; 100 % coverage on each source file; `tsc --noEmit` clean.

**Estimated prompt size**: ~500 lines.

**Included subtasks**:

- [ ] T009 TDD `src/domain/eligibility.ts` — truth table over (`isOwnedByMe`, `isCollaborative`, `canEdit`)
- [ ] T010 TDD `src/domain/ordering.ts` — order-preserving function with extension point for future iterations
- [ ] T011 Define domain types in `src/domain/view-models.ts` (`RawCollection`, `LikedSongsSummary`, `OwnerIdentity`, `CollectionViewModel`, `CollectionKind`)
- [ ] T012 TDD `toViewModels(eligible, likedSongs)` — happy path with Liked Songs pinned
- [ ] T013 Test view-model edge cases — placeholder image when `imageUrl === null`, very long names, owner identity variants (`'self'` / `'other'` / `'system-library'`)
- [ ] T014 TDD `isRawCollection(x): x is RawCollection` classifier predicate

**Prompt**: [`tasks/WP03-domain-eligibility-ordering-view-models.md`](tasks/WP03-domain-eligibility-ordering-view-models.md)

**Dependencies**: WP01.
**Parallel within WP**: T009 and T010 are independent; T011–T014 are sequenced (types → transform → edge cases → classifier).
**Requirement refs**: FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, SC-2.

---

## Phase 3 — Port & Adapters

### WP04 — Port + Fake Adapter + Contract Test

**Goal**: Define the `PlaylistsLoader` port interface, implement the in-memory `FakePlaylistsLoader` used by store and UI tests, and write the cross-implementation contract test that BOTH adapters must pass. This WP unblocks the store (WP06) and prepares the contract surface that the production adapter (WP05) implements against.

**Priority**: Must-have (blocks WP05 and WP06).

**Independent test**: After WP04, `test/ports/playlists-loader-contract.test.ts` is green when parameterized with the fake adapter; 100 % coverage on `src/ports/playlists-loader.ts` and `src/adapters/fake-playlists-loader.ts`; `tsc --noEmit` clean.

**Estimated prompt size**: ~350 lines.

**Included subtasks**:

- [ ] T015 Define `PlaylistsLoader` interface in `src/ports/playlists-loader.ts`
- [ ] T016 Implement `FakePlaylistsLoader` in `src/adapters/fake-playlists-loader.ts` (in-memory; success and `throws` variants)
- [ ] T017 Write `test/ports/playlists-loader-contract.test.ts` — shared test suite parameterized over any `PlaylistsLoader`
- [ ] T018 Run the contract suite against the fake; cover every `PlaylistsLoaderError` reason via failure-mode fixtures

**Prompt**: [`tasks/WP04-port-fake-adapter-contract-test.md`](tasks/WP04-port-fake-adapter-contract-test.md)

**Dependencies**: WP03 (port returns `RawCollection[]` and `LikedSongsSummary` from WP03).
**Parallel within WP**: Sequential (each subtask builds on the previous).
**Requirement refs**: C-001 (read-only verified via mutation-API zero-call assertion).

---

### WP05 — Spicetify Production Adapter

**Goal**: Implement the production `SpicetifyPlaylistsLoader` against the live `Spicetify.Platform.RootlistAPI` + `LibraryAPI`. This WP requires a live Spotify desktop client with the extension loaded so the implementer can capture real Platform response shapes into fixtures before writing the adapter. The adapter normalizes the host shape to `RawCollection`/`LikedSongsSummary`, validates fail-loud on shape drift, and throws typed `PlaylistsLoaderError`.

**Priority**: Must-have (required for runtime).

**Independent test**: After WP05, `test/adapters/spicetify-playlists-loader.test.ts` and the contract test (re-parameterized with the production adapter, using `vi.stubGlobal('Spicetify', …)` fixtures) both pass; 100 % coverage on the adapter; `tsc --noEmit` clean.

**Estimated prompt size**: ~500 lines.

**Included subtasks**:

- [ ] T019 Open the running Spotify client; capture `Platform.RootlistAPI` response shape into `test/adapters/fixtures/rootlist-response.sample.json`
- [ ] T020 Capture `Platform.LibraryAPI` Liked Songs summary shape into `test/adapters/fixtures/liked-songs-response.sample.json`
- [ ] T021 TDD `src/adapters/spicetify-playlists-loader.ts` — host-availability checks, shape validation, normalization to domain types
- [ ] T022 Test every `PlaylistsLoaderError` reason via `vi.stubGlobal`-driven fixture variants
- [ ] T023 Re-run the contract suite from WP04 against the production adapter; verify mutation APIs (`.add`, `.remove`) are stubbed and asserted zero-call

**Prompt**: [`tasks/WP05-spicetify-production-adapter.md`](tasks/WP05-spicetify-production-adapter.md)

**Dependencies**: WP04 (implements the port; reuses the contract test).
**Parallel within WP**: T019/T020 are parallelizable (both are DevTools captures). T021–T023 are sequential.
**Requirement refs**: NFR-001 (no redundant calls — adapter test asserts), C-001 (mutation APIs not called).

---

## Phase 4 — Store

### WP06 — Zustand Load-State Store

**Goal**: Implement `createPlaylistsStore(loader: PlaylistsLoader)` — a Zustand factory that owns the load-state FSM and exposes `triggerLoad()` and `retry()` actions. The factory accepts an injected loader so tests use the fake adapter; the production singleton (created in WP09) wires the real adapter. The store catches non-`PlaylistsLoaderError` throws and wraps them per the port contract.

**Priority**: Must-have (blocks WP07 and WP08).

**Independent test**: After WP06, `test/store/playlists-store.test.ts` is green; 100 % coverage; `tsc --noEmit` clean. The store can be exercised in pure TypeScript via `createStore(...)` with no React renderer.

**Estimated prompt size**: ~400 lines.

**Included subtasks**:

- [ ] T024 TDD `src/store/playlists-store.ts` — `createPlaylistsStore(loader)` factory; initial state `{ loadState: { kind: 'idle' } }`; no port calls before `triggerLoad`
- [ ] T025 Test `triggerLoad` happy path: `idle → loading → loaded` with non-empty items
- [ ] T026 Test `triggerLoad` empty path (zero eligible) and failure path; non-`PlaylistsLoaderError` is wrapped into `'rootlist-fetch-failed'` with `cause`
- [ ] T027 Test `retry` from `failed` re-enters `loading` and dispatches the next outcome

**Prompt**: [`tasks/WP06-zustand-load-state-store.md`](tasks/WP06-zustand-load-state-store.md)

**Dependencies**: WP02, WP04. (WP02 supplies the FSM types + transition; WP04 supplies the port interface and fake adapter for tests.)
**Parallel within WP**: Sequential — each test extends the same store factory.
**Requirement refs**: FR-008, FR-009, FR-011, FR-012, NFR-002 (boundary), NFR-004, C-006, SC-1.

---

## Phase 5 — UI

### WP07 — UI: State Views (Idle / Loading / Empty / Failed)

**Goal**: Implement the four non-list views that the page renders during the FSM's non-`loaded` states. Each is a small, presentational React component consuming only the store hook; none import the port or adapter directly. The Idle view's button click is the sole entry point into the loading state (FR-011, C-006).

**Priority**: Must-have for end-to-end.

**Independent test**: After WP07, the four view test files are green; 100 % coverage; `tsc --noEmit` clean. The Idle view's button-click test verifies the store action is dispatched (using `createPlaylistsStore` wired to a fake loader).

**Estimated prompt size**: ~450 lines.

**Included subtasks**:

- [ ] T028 TDD `src/ui/IdleView.tsx` + test — Load button dispatches `triggerLoad`; no port calls before click; ARIA labels present
- [ ] T029 TDD `src/ui/LoadingView.tsx` + test — non-blocking indicator with `role="status"` and an accessible label
- [ ] T030 TDD `src/ui/EmptyView.tsx` + test — distinct empty-state copy ("No dedup-eligible collections in your library"); not a spinner, not a failure
- [ ] T031 TDD `src/ui/FailedView.tsx` + test — explanation derived from `PlaylistsLoaderError.reason` via a small lookup table; retry button dispatches `retry`

**Prompt**: [`tasks/WP07-ui-state-views.md`](tasks/WP07-ui-state-views.md)

**Dependencies**: WP06 (store hook + actions).
**Parallel within WP**: All four subtasks are independent (different files, different concerns). Can be split across multiple engineers or done sequentially.
**Requirement refs**: FR-007, FR-008, FR-009, FR-011, NFR-003, SC-4, SC-5.

---

### WP08 — UI: Collection Views (PlaylistRow / LikedSongsRow / LoadedView)

**Goal**: Implement the three views that render the loaded list itself: the playlist-row component, the pinned Liked-Songs-row variant, and the LoadedView that iterates `CollectionViewModel[]` and dispatches to the right row variant per `kind`. Each row presents name, owner identity, track count, and cover (or placeholder).

**Priority**: Must-have for end-to-end.

**Independent test**: After WP08, the three view test files are green; 100 % coverage; `tsc --noEmit` clean. The LoadedView test verifies ordering preservation and Liked Songs pinning.

**Estimated prompt size**: ~400 lines.

**Included subtasks**:

- [ ] T032 TDD `src/ui/PlaylistRow.tsx` + test — name, owner labels (`self` / `other`), track count, cover with placeholder, long-name handling
- [ ] T033 TDD `src/ui/LikedSongsRow.tsx` + test — fixed "Liked Songs" / "Your Library" copy, distinct styling from playlist rows
- [ ] T034 TDD `src/ui/LoadedView.tsx` + test — iterates view models; dispatches to row variant by `kind`; preserves order; pins Liked Songs first

**Prompt**: [`tasks/WP08-ui-collection-views.md`](tasks/WP08-ui-collection-views.md)

**Dependencies**: WP06 (consumes `CollectionViewModel` from the store).
**Parallel within WP**: T032 and T033 are independent. T034 depends on both since it dispatches to them.
**Requirement refs**: FR-003, FR-005, FR-006, SC-3.

---

## Phase 6 — Wiring & Polish

### WP09 — Page Wiring, Hello World Cleanup, README

**Goal**: Replace `src/app.tsx`'s Hello World with `<DedupPage />`; create `DedupPage` that routes the store's `LoadState.kind` to the right view; wire the production singleton store with `SpicetifyPlaylistsLoader`; delete the now-superseded Hello World smoke test; verify 100 % coverage holds; update README to reflect the new page behavior; perform manual end-to-end verification in a live Spotify client.

**Priority**: Must-have (closes the mission).

**Independent test**: After WP09, the full suite passes with 100 % coverage; `tsc --noEmit` clean; in the live Spotify client the Dedup page mounts in idle state with zero outbound calls (verified in DevTools Network), the Load button triggers a successful load against the real library, and a temporarily force-thrown Platform call surfaces the failure state with a working retry.

**Estimated prompt size**: ~400 lines.

**Included subtasks**:

- [ ] T035 Wire singleton store with production adapter; replace `src/app.tsx` Hello World with `<DedupPage />`
- [ ] T036 TDD `src/ui/DedupPage.tsx` + test — routes `LoadState.kind` to the right view (Idle/Loading/Loaded/Empty/Failed)
- [ ] T037 Delete `test/app.test.tsx` (Hello World smoke test, superseded by DedupPage test); confirm coverage still 100 %
- [ ] T038 Update `README.md` + perform manual verification in a running Spotify client (zero pre-trigger fetches, happy path, failure path, retry)

**Prompt**: [`tasks/WP09-page-wiring-and-readme.md`](tasks/WP09-page-wiring-and-readme.md)

**Dependencies**: WP05, WP07, WP08. (WP05 supplies the production adapter; WP07 the state views; WP08 the collection views.)
**Parallel within WP**: T036 happens before T035 (TDD: DedupPage test must exist before it can route). T037 and T038 are independent after T036 lands.
**Requirement refs**: FR-010, FR-011, NFR-002, NFR-003, SC-6.

---

## Parallelization Map

- **After WP01**: WP02 and WP03 can run in parallel (different files, no shared state).
- **After WP04**: WP05 and WP06 are sequentially independent — but in practice WP05 needs a live client for fixture capture and WP06 only needs the port + fake. They can be split across two engineers if both are available.
- **After WP06**: WP07 and WP08 can run in parallel (different UI files, both consume the store).
- **WP09**: serializes everything (it wires the singleton and verifies end-to-end).

For a single engineer working sequentially, the order is: WP01 → WP02 → WP03 → WP04 → WP05 → WP06 → WP07 → WP08 → WP09. Estimated effort assuming TDD discipline: ~10–15 focused hours total, dominated by WP05's DevTools fixture capture and WP07/WP08's view-by-view ceremony.

## MVP Scope

This entire mission is the MVP for the next user-facing iteration of the extension. There is no smaller useful subset — without WP09 the page still shows Hello World; without WP07/WP08 there's nothing to look at; without the domain or store there's no behavior. Ship all 9 WPs together.

## Definition of Done (mission-level)

- All 9 work packages closed; per-WP definitions of done satisfied.
- `npm run test:run` reports 100 % line and 100 % branch coverage across `src/`.
- `tsc --noEmit` clean.
- Three ADRs present at `.claude/adr/0001-*.md`, `0002-*.md`, `0003-*.md`.
- Live verification in a running Spotify client (see WP09 T038).
- README current.

## Notes

- **No git operations performed by agents.** Per `.claude/CLAUDE.md`, git is the user's responsibility — `finalize-tasks` will commit the WP planning artifacts automatically, but no agent commits implementation work; the user pulls each WP into a commit when satisfied.
- **TDD-first is non-negotiable** (DIRECTIVE_034). Each subtask labelled "TDD …" means: failing test → watch it fail → minimum code → green. No skipping the watch-it-fail step.
- **Charter gates apply to every WP** — TypeScript strict, 100 % coverage, file-level SRP, fail-loud at module boundaries, JSDoc on every export.
