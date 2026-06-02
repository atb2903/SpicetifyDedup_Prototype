# Implementation Plan: Load Dedup-able Playlists

**Mission slug**: `load-dedupable-playlists-01KT3XW3`
**Mission ID**: `01KT3XW3AWY8W0YJKCE9TYNQKX`
**Branch**: `get_library` (planning base = merge target = `get_library`; `branch_matches_target = true`)
**Date**: 2026-06-02
**Spec**: [spec.md](spec.md)

## Summary

The Dedup page (currently a Hello World placeholder) is replaced with an idle landing surface offering a single load-trigger affordance. When the user activates the trigger, the page fetches the user's full library, computes the dedup-eligible set (owned playlists + collaborative playlists with edit rights + Liked Songs), and renders them in a vertical list with Liked Songs pinned on top. The fetch issues zero network traffic until the user clicks the trigger. The page exposes idle / loading / loaded / empty / failed states; failure surfaces a retry affordance that re-enters the loading state on click. The entire iteration is read-only.

Architecturally, the feature uses a **hexagonal** layout: a host-agnostic domain (eligibility predicate, ordering rule, view-model transform, load-state FSM) sits behind a `PlaylistsLoader` port; a Spicetify Platform adapter implements the port in production; a fake adapter implements it for unit and component tests. State is managed in a single Zustand store whose actions wire the port to the FSM. The Platform surface used in production is `Spicetify.Platform.RootlistAPI` (for the playlist tree) plus `Spicetify.Platform.LibraryAPI` (for the Liked Songs row's track count). GraphQL is deliberately deferred — Platform APIs cover everything this iteration needs.

## Technical Context

| Field | Value |
| --- | --- |
| **Language/Version** | TypeScript 5.x (strict mode), targeting ES2017 per existing `tsconfig.json` |
| **Primary Dependencies** | React 19.2 (already installed), `spicetify-creator` 1.0.17 (build), `@testing-library/react` 16.3 (tests), `happy-dom` 20.9 (DOM env). **New runtime dependency:** `zustand` (latest 5.x, ~1 KB gzipped, zero peer deps beyond React). |
| **Storage** | None. Constraint **C-005** forbids cross-session persistence. The load result lives in the Zustand store for the lifetime of the page only. |
| **Testing** | Vitest 4.1 + happy-dom (configured in `vitest.config.ts`); 100 % line + branch coverage enforced by the runner (per charter); TDD mandatory (DIRECTIVE_034); boundary tests for every numeric bound (per charter); `vi.stubGlobal('Spicetify', …)` for adapter tests; in-memory fake `PlaylistsLoader` for store + UI tests. |
| **Target Platform** | Spotify desktop client (Chromium-based) via Spicetify CLI 2.43+, hosting a Custom App registered as `spicetify-dedup` with sidebar label "Dedup". |
| **Project Type** | Single TypeScript project; hexagonal module layout (see "Project Structure" below). Not a monorepo, not a web app, not split front/back. |
| **Performance Goals** | Algorithmic efficiency only — no wall-clock budget (per spec NFR-001 / SC-1). Concretely: (a) the rootlist is fetched in one call where possible, paged otherwise; (b) no redundant per-collection fetch happens during a single load; (c) the eligibility filter and ordering run in a single pass over the rootlist. |
| **Constraints** | TypeScript strict mode (no implicit any; no `any` leaking from adapters into domain); SOLID with strict file-level SRP (one responsibility per file); named architectural pattern declared (hexagonal — see ADR `0001`); fail-loud parsing at the adapter boundary (`Result`/`throws` on shape drift) with paired classifier predicate; no library mutations of any kind (spec C-001); no host fetches before the user activates the trigger (spec C-006). |
| **Scale/Scope** | One Custom App page (the Dedup page); one Zustand store; one port; one production adapter + one test fake; ~15 files under `src/`; ~12 test files; one new dependency (`zustand`); three ADRs at `.claude/adr/0001-…`, `0002-…`, `0003-…`. |

No `[NEEDS CLARIFICATION]` markers — every planning question was resolved during the interrogation (architecture: hexagonal; API surface: Platform; state: Zustand; retry: manual-only). The remaining unknown — exact field names on `Spicetify.Platform.RootlistAPI` — is an implementation-time discovery, not a planning blocker; the port interface in `contracts/playlists-loader-port.md` defines the *domain* contract, and the adapter's specific call shapes are flagged for TDD-driven refinement in [research.md](research.md).

## Charter Check

The charter (`/home/alex/Documents/repos/SpicetifyDedup_Prototype/.kittify/charter/charter.md`) is present. Gates evaluated below; all pass.

| Gate | Source | Status | Notes |
| --- | --- | --- | --- |
| **Named architectural pattern declared** | Charter: "At the start of any module-layout work, the plan declares the named architectural pattern (MVC, hexagonal, layered)" | ✅ | Hexagonal (ports + adapters). Captured in ADR `.claude/adr/0001-hexagonal-load-dedupable-playlists.md`. |
| **TypeScript strict mode** | Charter quality gate | ✅ | Already enabled in `tsconfig.json`. Plan adds no opt-outs. |
| **SOLID with file-level SRP** | Charter quality gate | ✅ | Project Structure section below assigns exactly one responsibility per file. |
| **TDD-first** | DIRECTIVE_034, charter | ✅ | Work-package ordering in [quickstart.md](quickstart.md) puts failing test before implementation in every WP. |
| **100 % line + branch coverage** | DIRECTIVE_030, charter | ✅ | Vitest already configured. Coverage tool (`@vitest/coverage-v8`) to be added as a dev dependency in WP01. Domain modules are pure → trivially coverable; adapter coverage achieved via `vi.stubGlobal`; UI coverage achieved via `@testing-library/react` against the fake adapter. |
| **Boundary tests for numeric bounds** | Charter | ✅ | Numeric bounds in this iteration: rootlist page size (if pagination required), eligibility decision count (0, 1, many), Liked Songs track count (0, 1, large). Each is tested at min−1 / min / nominal / max / max+1 where the bound applies. |
| **Fail-loud input validation at module boundaries** | Charter | ✅ | The Spicetify adapter is the sole module boundary that touches an untyped host API. It validates the shape of each Platform response and throws a typed `PlaylistsLoaderError` on drift; a paired classifier (`isPlatformLikeRootlistResponse(x): boolean`) lets the domain pre-check. Domain modules trust their input types (per "trust internal types"). |
| **No silent library mutations** | Charter risk boundary | ✅ | This iteration is strictly read-only (spec C-001). No mutation surface exposed. |
| **No auto-run on Spotify launch / no auto-fetch on page mount** | Charter risk boundary + spec C-006 / FR-011 / FR-012 / SC-6 | ✅ | The FSM's initial state is `idle`; the only entry into `loading` is user activation of the load trigger. Verified by an integration test that mounts the page, asserts no port methods were called, then triggers and asserts the call. |
| **README current per user-facing change** | Charter docs gate | ✅ | README update is the final WP. Updates the description from Hello World status to "load dedup-able playlists" status, including the new explicit-trigger UX. |
| **JSDoc on every exported function/type** | Charter docs gate | ✅ | Each new file's exports carry JSDoc. Enforced by review (no automated linter yet). |
| **ADRs for load-bearing decisions** | Charter docs gate + DIRECTIVE_003 | ✅ | Three ADRs at `.claude/adr/`: `0001` hexagonal architecture, `0002` Spicetify Platform APIs over GraphQL, `0003` Zustand for load-state. |
| **Gates absolute on `main`; only `spike/*` exception** | Charter | ✅ | Mission targets `get_library` (a feature branch), not `main`. All gates honored anyway. |

Re-evaluation after Phase 1 design: ✅ No new gate violations introduced by the data model, port contract, or UI structure. See "Charter Re-check (post-design)" at the end of this document.

## Project Structure

### Documentation (this feature)

```
kitty-specs/load-dedupable-playlists-01KT3XW3/
├── plan.md                                  # this file
├── spec.md                                  # already written; the source of truth
├── meta.json                                # mission identity
├── research.md                              # Phase 0 output (decisions + alternatives + open discoveries)
├── data-model.md                            # Phase 1 output (domain types + FSM)
├── quickstart.md                            # Phase 1 output (work-package walkthrough + TDD recipe)
├── contracts/
│   └── playlists-loader-port.md             # Phase 1 output (port contract: types, methods, error shape)
├── checklists/
│   └── requirements.md                      # spec-quality checklist (passes pass 2)
└── tasks/                                   # populated by /spec-kitty.tasks
    └── README.md
```

### Source Code (repository root)

Hexagonal layout. Each file = one responsibility (strict file-level SRP).

```
src/
├── app.tsx                                  # entry; renders <DedupPage> wrapped in any necessary providers
├── settings.json                            # sidebar registration (already present)
├── domain/                                  # pure TypeScript; no React, no Spicetify, no global state
│   ├── load-state.ts                        # LoadState discriminated union + transition fn (reducer-style)
│   ├── eligibility.ts                       # eligibility predicate: (RawCollection) → boolean
│   ├── ordering.ts                          # ordering rule: places Liked Songs first; preserves rootlist order
│   ├── view-models.ts                       # CollectionViewModel type + transform from raw + Liked Songs summary
│   └── errors.ts                            # typed PlaylistsLoaderError class + classifier predicate
├── ports/
│   └── playlists-loader.ts                  # PlaylistsLoader interface + raw DTO types it returns
├── adapters/
│   ├── spicetify-playlists-loader.ts        # production impl; calls Spicetify.Platform.{RootlistAPI,LibraryAPI}
│   └── fake-playlists-loader.ts             # in-memory test double for store + UI tests
├── store/
│   └── playlists-store.ts                   # Zustand store; wires port → load-state transitions → actions
├── ui/
│   ├── DedupPage.tsx                        # routes the store's LoadState.kind to the right view
│   ├── IdleView.tsx                         # initial state; renders the load-trigger button
│   ├── LoadingView.tsx                      # non-blocking loading indicator
│   ├── LoadedView.tsx                       # list of rows; iterates view models
│   ├── EmptyView.tsx                        # empty-state message
│   ├── FailedView.tsx                       # failure reason + retry button
│   ├── PlaylistRow.tsx                      # one playlist row (name, owner, track count, cover/placeholder)
│   └── LikedSongsRow.tsx                    # pinned variant for Liked Songs
├── types/
│   ├── spicetify.d.ts                       # already present (mirrored from spicetify/cli)
│   ├── spicetify-platform.d.ts              # NEW: narrow ambient typings for Platform.RootlistAPI + LibraryAPI
│   └── css-modules.d.ts                     # already present
└── css/
    ├── app.module.scss                      # already present
    └── icon.svg                             # already present (sidebar icon)

test/
├── setup.ts                                 # already present (@testing-library/jest-dom matchers + cleanup)
├── domain/
│   ├── load-state.test.ts                   # FSM transitions; idle→loading→loaded/empty/failed; failed→loading via retry
│   ├── eligibility.test.ts                  # truth table over (owned, collaborative, canEdit, isLikedSongs)
│   ├── ordering.test.ts                     # Liked Songs always first; rootlist order preserved otherwise
│   ├── view-models.test.ts                  # raw → view-model transform; placeholder cover; long names
│   └── errors.test.ts                       # PlaylistsLoaderError construction + classifier round-trips
├── adapters/
│   └── spicetify-playlists-loader.test.ts   # vi.stubGlobal('Spicetify', …) drives the adapter; shape-drift cases throw
├── store/
│   └── playlists-store.test.ts              # given a fake loader, the store walks the FSM correctly; retry re-enters loading
└── ui/
    ├── DedupPage.test.tsx                   # routing: each LoadState.kind renders the correct view
    ├── IdleView.test.tsx                    # trigger button click → store action; no fetch until clicked
    ├── LoadingView.test.tsx                 # indicator visible; not empty/broken
    ├── LoadedView.test.tsx                  # ordering, pinning, owner label rendering
    ├── EmptyView.test.tsx                   # distinct empty message
    └── FailedView.test.tsx                  # explanation + retry click re-enters loading
```

**Structure Decision**: Single TypeScript project (Spicetify Custom App) with a hexagonal module layout. `domain/` and `ports/` are pure and host-agnostic. `adapters/` implements ports against external systems (the only external system in this iteration is Spicetify itself). `store/` is the React-state seam (Zustand) that holds the FSM and exposes actions. `ui/` is the presentational layer; it reads from the store and dispatches actions, never touches the port directly. Tests mirror `src/` directory-for-directory. The existing `src/app.tsx` and `test/app.test.tsx` from the Hello World iteration are replaced by `DedupPage` + its test in WP07 (page wiring).

## Phase 0 — Research

See [research.md](research.md) for the consolidated decision log. Headline:

- **Decision 1 — Hexagonal architecture.** Adopted. Rationale: SRP-at-file-level + 100 % coverage are easier to hit when the host API surface is mockable behind a port; domain logic (eligibility, ordering, view-model transform, FSM) is independently testable in pure TypeScript with no React and no Spicetify. Alternatives (layered, feature-folder) rejected — see ADR `0001`.
- **Decision 2 — Spicetify Platform APIs over internal GraphQL.** Adopted. Rationale: `Platform.RootlistAPI` covers playlist enumeration and `Platform.LibraryAPI` covers Liked Songs; both are immune to the `/v1/me/tracks` 502 (different gateway path); the data-porter reference impl uses them; no auth/persisted-query handling needed. GraphQL deferred until a later iteration proves Platform insufficient (likely never, for read-only metadata). See ADR `0002`.
- **Decision 3 — Zustand for state.** Adopted. Rationale: one cohesive FSM with a small action surface (`triggerLoad`, `retry`) maps onto a single store cleanly; selectors prevent unrelated re-renders; testable in pure TypeScript via `createStore()`; ~1 KB cost. Jotai's atomic granularity is over-engineered for this case. See ADR `0003`.
- **Deferred to implementation (not a clarification).** Exact field names on `Spicetify.Platform.RootlistAPI` (e.g. `getContents` vs `getRootlist`, what an "owned" vs "collaborative" item looks like in its response). The port interface (`contracts/playlists-loader-port.md`) is the stable contract; the adapter's specific method calls and validation will be discovered during TDD against `vi.stubGlobal('Spicetify', …)`-shaped fixtures, with real shapes captured from DevTools when WP05 runs against the live client.

## Phase 1 — Design & Contracts

See:

- [data-model.md](data-model.md) — domain types (`RawCollection`, `LikedSongsSummary`, `CollectionViewModel`, `LoadState`, `LoadAction`), the FSM transition table, validation predicates.
- [contracts/playlists-loader-port.md](contracts/playlists-loader-port.md) — the `PlaylistsLoader` port: methods, parameters, return shape, error contract.
- [quickstart.md](quickstart.md) — implementation walk-through: ordered work-package list, TDD recipe per WP, definition of done.

## Charter Re-check (post-design)

Re-evaluated after Phase 1. No new gate violations.

- **Architectural integrity (DIRECTIVE_001).** Hexagonal boundary holds: domain has zero imports of `react`, `zustand`, or `Spicetify`; ports has zero imports of adapters; adapters has zero imports of UI; UI imports only the store. Verified by a per-folder import-graph test in WP01 (`test/architecture.test.ts`).
- **Decision documentation (DIRECTIVE_003).** Three ADRs (`0001`, `0002`, `0003`) cover the three load-bearing choices.
- **Specification fidelity (DIRECTIVE_010).** Every FR/NFR/C/SC maps to a WP in [quickstart.md](quickstart.md) traceability table. SC-6 ("zero host fetches before trigger") is verified by a dedicated test.
- **Test+typecheck quality gate (DIRECTIVE_030).** Vitest runner enforces 100 % coverage; `tsc --noEmit` is a CI-equivalent gate run from `npm run test:run` chained with `tsc`.
- **Test-first (DIRECTIVE_034).** Every WP starts with a failing test.
- **Black-box integration testing (DIRECTIVE_036).** Store-level tests treat the port as a black box (use the fake adapter). UI tests treat the store as a black box.

## Complexity Tracking

No charter violations to track. The plan picks the simplest defensible structure that satisfies the charter; no exceptions or justified-violations are required.

## Sign-off

This plan is ready for `/spec-kitty.tasks`. The task command should produce work packages roughly along the ordering in [quickstart.md](quickstart.md): scaffolding (deps, coverage tool, architecture test, ambient types) → domain (load-state, eligibility, ordering, view-models, errors) → port + fake → adapter → store → UI (one view per WP) → page wiring → README update. Each WP independently passes the test gate before the next begins.
