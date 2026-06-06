# Implementation Plan: Duplicate Track Detection

**Branch**: `main` (planning base & merge target) | **Date**: 2026-06-06 | **Spec**: [`spec.md`](./spec.md)
**Input**: Feature specification from `kitty-specs/duplicate-track-detection-01KTFH5H/spec.md`

**Branch strategy summary**: Current branch at plan start: `main`. Planning/base branch for this feature: `main`. Completed changes merge into `main`. `branch_matches_target` = `true`.

## Summary

When the user clicks a row's dedup button on the Dedup page, the system enumerates that collection's non-local tracks via the host's library/playlist APIs, enriches each with the catalog metadata required for matching (`duration_ms`, region-relinked canonical URI), and produces a typed list of duplicate groups exposed against that row.

The detection algorithm is the JMPerez upstream rule (`dedup/deduplicator.ts:15-57`) — same Spotify ID, or same normalized name + first-artist (case-insensitive) within a ±2000 ms duration window (inclusive on 2000) — ported as a **pure** TypeScript module so the matching logic can be exhaustively unit-tested without any host, DOM, or network. The result shape carries a `defaultKeep` marker on the earliest member of each group so the next mission's review UI can build atop it without backfilling.

Technical approach: continue the **hexagonal / ports-and-adapters** layout already enforced by `test/architecture.test.ts` (ADR-0001). Add three new ports (`TracksEnumerator`, `CatalogEnricher`, `DetectionScanner`) and their Spicetify + in-memory-fake adapters. Add a **separate** `detection-store.ts` (vanilla Zustand) keyed by canonical collection URI so per-row state is independent of the page-level load FSM. Cancellation is plumbed via **`AbortSignal`**; re-trigger and route-reset call `abort()` on the prior signal before starting a fresh scan. The scanning state surfaces **stage + counts** progress (`enumerating | enriching | matching`, `processed`, `total | null`) via an injected `onProgress` callback so long scans on large libraries remain observable without the user wondering if they're stuck. Catalog enrichment runs **sequentially** — one 50-ID batch in flight per scan — with `Retry-After` parsed and slept locally inside the enricher, so rate-limit pressure stays gentle and the adapter stays trivial.

## Technical Context

**Language/Version**: TypeScript 6.0.3 (strict mode, per existing `tsconfig.json`); ES2022+ target.
**Primary Dependencies**: React 19.2.6, Zustand 5.0.14 (vanilla + bound hook factory), Spicetify Platform globals (typed via `src/types/spicetify-platform.d.ts`), `Spicetify.CosmosAsync` for the catalog endpoint.
**Storage**: None. Detection results live in-memory in the Zustand store for the lifetime of the page mount; route-reset discards them (FR-012, C-003). No disk, no localStorage, no extension-storage API.
**Testing**: Vitest 4.1.7 + happy-dom 20 + @testing-library/react 16 + @vitest/coverage-v8. Pure-domain tests run without happy-dom; React tests use happy-dom. Coverage gate at the runner is 100% line + branch on every new module (NFR-009, charter Testing Standards). TDD is mandatory per `DIRECTIVE_034`.
**Target Platform**: Spicetify custom app running inside the Spotify desktop client (Linux/macOS/Windows). Browser/web invocation is not a target (A-005). Bundled via `spicetify-creator`.
**Project Type**: Single project — `src/` (production) + `test/` (mirrored structure). Hexagonal layout under `src/`.
**Performance Goals**: Algorithm is `O(N)` over the input collection (single pass, key-bucketed). Enrichment is `O(N/50)` sequential HTTP round-trips. No hard wall-clock bound — per memory `avoid-hard-time-cutoffs-in-nfrs`, the spec deliberately constrains *algorithmic* behavior, not wall-clock, since the catalog endpoint's latency is host-controlled. The stage + counts progress signal keeps long scans tolerable.
**Constraints**:
- Detection algorithm MUST be pure (NFR-002): no host calls, no DOM, no global state. Implementable in a Node process under Vitest with no `happy-dom` cell.
- Mutation MUST NOT occur in this mission (C-001); the port surface for detection has no delete/remove method.
- Explicit-trigger only (C-004 / FR-010): no auto-fetch on page mount, no listener that scans on store mutation, no implicit re-scan on enrichment-cache refresh.
- Route-reset MUST abort every in-flight scan (FR-012); the store's `reset` calls `abort()` on each tracked signal and clears state synchronously.
- Re-trigger on the same row MUST atomically replace the prior result (FR-011); the store enforces this by aborting the prior scan's signal before transitioning the row back into `scanning`.
- The dedup button MUST be disabled while a row's scan is in flight (FR-013, C-005); the row's view-model selector exposes a `scanInFlight` boolean to the UI.
- Boundary tests at 1999 / 2000 / 2001 ms (NFR-003) are mandatory and executable; the boundary table also includes batch-size edges (49 / 50 / 51 IDs) and the empty / all-local / all-unenrichable collection cases.
- JSDoc on every export (NFR-010 / charter Quality Gates).
- ADRs for load-bearing design decisions (C-007 / `DIRECTIVE_003`); four are scheduled below.

**Scale/Scope**: Target library size is ~20k saved tracks (the original motivating constraint that broke the web app's `GET /v1/me/tracks` path). The detector and enricher must scale linearly with collection size; no quadratic comparisons, no full-library materialization.

## Charter Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Directive | Gate question | Pre-Phase-0 verdict | Post-Phase-1 verdict |
|---|---|---|---|
| **DIRECTIVE_001** (architectural integrity) | Is a named pattern declared, and does new code respect existing boundaries? | ✅ Hexagonal / Ports & Adapters declared in §Summary; `test/architecture.test.ts` already enforces the import graph and will catch violations as new files land. | ✅ confirmed by §Project Structure and contracts/ — every new file's folder dictates its allowed imports. |
| **DIRECTIVE_003** (decision documentation) | Are load-bearing design decisions tracked as ADRs? | ✅ Four ADRs scheduled (§Project Structure → ADR roadmap). | ✅ ADRs 0006–0009 enumerated with subjects and inputs. |
| **DIRECTIVE_010** (specification fidelity) | Does the plan trace back to FRs / NFRs / Constraints? | ✅ Technical Context §Constraints cites the FR / NFR / C numbers; data-model.md will list per-type FR coverage. | ✅ contracts/ and data-model.md tag every type and method with the FR / NFR / C it serves. |
| **DIRECTIVE_030** (test+typecheck quality gate) | Does the gate forbid merge without 100% line / branch + passing types? | ✅ Vitest coverage gate already enforces 100% line + branch; `tsc --noEmit` runs in CI; `test/architecture.test.ts` enforces import boundaries. | ✅ no carve-outs in this mission. |
| **DIRECTIVE_034** (test-first development) | Will every new module land via failing test → green test → refactor? | ✅ Mission's tasks decomposition (next stage) will lock each WP to a failing test gate. | n/a — re-validated at `/spec-kitty.tasks` time. |
| **DIRECTIVE_036** (black-box integration testing) | Is there a black-box surface to exercise without mocking internals? | ✅ Fake adapters (`FakeTracksEnumerator`, `FakeCatalogEnricher`) drive the store + UI through the same port surface the production adapters implement; integration tests do not reach into private fields. | ✅ contracts/ specify the port surface that integration tests target. |

**Verdict**: PASS (pre-Phase-0). Re-evaluated post-Phase-1 below.

**Mission-specific safety gates** (from charter Risk Boundaries):
- *No silent library mutations* — Detection has zero mutation surface (C-001). The `DetectionScanner` port is read-only. ✅
- *Per-action confirmation for deletes* — N/A this mission (deletion is OOS, next mission). ✅
- *Bulk-delete second confirmation* — N/A this mission. ✅
- *Cross-playlist operations require explicit scope acknowledgment* — N/A; cross-collection detection is OOS (C-002). ✅
- *No auto-run on Spotify launch / page mount* — Enforced by FR-010 / C-004; the store's `scanCollection(uri)` is the only entry point and is wired solely to the row's button onClick. ✅

## Project Structure

### Documentation (this feature)

```
kitty-specs/duplicate-track-detection-01KTFH5H/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions + rationale + alternatives
├── data-model.md        # Phase 1 — every new type, FSM, error taxonomy
├── quickstart.md        # Phase 1 — developer end-to-end story
├── contracts/           # Phase 1 — port contract docs
│   ├── tracks-enumerator-port.md
│   ├── catalog-enricher-port.md
│   └── detection-scanner-port.md
├── spec.md              # Approved mission spec (already present)
└── meta.json            # Mission metadata
```

### Source Code (repository root)

The codebase already uses hexagonal / ports-and-adapters with the import graph enforced by `test/architecture.test.ts` (rules table mirrors ADR-0001). New files for this mission slot into the existing folders:

```
src/
├── domain/                         # Pure TS; no React, Zustand, Spicetify, or
│   │                                 # network. Trusted-input transforms only.
│   ├── load-state.ts               # (existing)
│   ├── view-models.ts              # (existing)
│   ├── eligibility.ts              # (existing)
│   ├── ordering.ts                 # (existing)
│   ├── errors.ts                   # (existing — PlaylistsLoaderError)
│   ├── detection-errors.ts         # NEW — DetectionError + isDetectionError
│   ├── detection-state.ts          # NEW — DetectionState FSM + transition()
│   ├── detection-types.ts          # NEW — RawTrack, EnrichedTrack,
│   │                                 #       DuplicateGroup, DetectionResult,
│   │                                 #       ProgressEvent type union
│   ├── duplicate-key.ts            # NEW — normalize(name) + composeKey(name,artist)
│   ├── duplicate-detector.ts       # NEW — pure algorithm port from upstream
│   └── enriched-track-parser.ts    # NEW — isEnrichedTrack + asEnrichedTrack
│                                     #       (fail-loud + classifier per NFR-008)
│
├── ports/                          # Pure interfaces; may import from domain/.
│   ├── playlists-loader.ts         # (existing)
│   ├── tracks-enumerator.ts        # NEW — per-collection paged enumeration
│   ├── catalog-enricher.ts         # NEW — 50-ID batched catalog lookup
│   └── detection-scanner.ts        # NEW — orchestrating scan port
│
├── adapters/                       # Host-boundary impls; may import from
│   │                                 # domain/ + ports/.
│   ├── spicetify-playlists-loader.ts        # (existing)
│   ├── fake-playlists-loader.ts             # (existing)
│   ├── spicetify-tracks-enumerator.ts       # NEW — Platform.LibraryAPI /
│   │                                          #       PlaylistAPI wrapper
│   ├── fake-tracks-enumerator.ts            # NEW — in-memory test double
│   ├── spicetify-catalog-enricher.ts        # NEW — CosmosAsync
│   │                                          #       GET /v1/tracks?ids=…
│   ├── fake-catalog-enricher.ts             # NEW — in-memory test double
│   ├── detection-scanner.ts                 # NEW — composes enumerator +
│   │                                          #       enricher + algorithm
│   │                                          #       (a thin adapter; no
│   │                                          #       host calls of its own)
│   └── retry-after.ts                       # NEW — parse(headerValue): ms
│                                              #       (fail-loud + classifier)
│
├── store/                          # Zustand; may import from domain/ + ports/.
│   ├── playlists-store.ts          # (existing)
│   ├── PlaylistsStoreContext.tsx   # (existing)
│   ├── RouteResetContext.tsx       # (existing — extends to call detection
│   │                                 #            store's reset)
│   ├── detection-store.ts          # NEW — vanilla Zustand store keyed by
│   │                                 #       canonical collection URI
│   └── DetectionStoreContext.tsx   # NEW — React context binding
│
├── ui/                             # React; may import from domain/ + store/.
│   ├── (existing files)
│   ├── ScanningView.tsx            # NEW — stage + counts presentational view
│   ├── DetectionLoadedSummary.tsx  # NEW — N groups + M tracks-to-remove,
│   │                                 #       or "No duplicates found"
│   ├── DetectionFailedView.tsx     # NEW — typed-error → label lookup
│   ├── ScanningView.module.scss
│   ├── DetectionLoadedSummary.module.scss
│   └── DetectionFailedView.module.scss
│
└── (other existing files unchanged)

test/                               # Mirrors src/; one *.test.ts per module.
├── architecture.test.ts            # (existing — picks up new folders automatically)
├── domain/
│   ├── (existing tests)
│   ├── detection-state.test.ts
│   ├── detection-errors.test.ts
│   ├── duplicate-key.test.ts
│   ├── duplicate-detector.test.ts        # ← boundary cases 1999/2000/2001 ms live here
│   └── enriched-track-parser.test.ts     # ← malformed-payload + classifier coverage
├── ports/
│   └── (none — interfaces are types, exercised through implementations)
├── adapters/
│   ├── (existing tests)
│   ├── spicetify-tracks-enumerator.test.ts
│   ├── fake-tracks-enumerator.test.ts
│   ├── spicetify-catalog-enricher.test.ts        # ← 49/50/51-ID batch boundary,
│   │                                               #   429+Retry-After, 401, abort
│   ├── fake-catalog-enricher.test.ts
│   ├── detection-scanner.test.ts                 # ← orchestration + abort + progress
│   └── retry-after.test.ts                       # ← parser + classifier boundaries
├── store/
│   ├── (existing tests)
│   └── detection-store.test.ts                   # ← parallel-rows, re-trigger,
│                                                   #   route-reset abort, FSM gates
├── ui/
│   └── (one test per new view component)
└── integration/                                  # New folder if not present.
    └── detection-end-to-end.test.ts              # ← row click → result via fakes
```

**Structure Decision**: Continue **hexagonal / ports-and-adapters** as declared in ADR-0001. The detection slice lives entirely in the existing folder grid; no new top-level folders. `test/architecture.test.ts` already enforces import boundaries for `src/domain/`, `src/ports/`, `src/adapters/`, `src/store/`, `src/ui/` — new files inherit those rules automatically. The matching algorithm itself sits in `src/domain/duplicate-detector.ts` so it can be exhaustively unit-tested without happy-dom or any host shim (NFR-002).

### ADR roadmap

Four ADRs land alongside the implementation (numbering continues from existing 0001–0005):

| ADR | Subject | Driving constraint |
|---|---|---|
| **0006** | Separate `detection-store` (alongside `playlists-store`) instead of extending the page store | Charter strict file-level SRP; user choice |
| **0007** | `AbortSignal` as the single cancellation primitive across `TracksEnumerator`, `CatalogEnricher`, and `DetectionScanner` | FR-011 atomic replace + FR-012 route-reset cancel; user choice; pairs natively with `CosmosAsync` |
| **0008** | Progress signal shape: `stage + processed + total` via injected `onProgress` callback | NFR-006 + user choice; alternative "binary scanning" was the smallest port surface but loses observability on long scans |
| **0009** | Catalog enrichment runs sequentially (1 batch in flight per scan); `Retry-After` is parsed and slept locally inside the enricher | NFR-004 + user choice; alternative "bounded parallel" defers to a future mission only if wall-clock proves unacceptable |

## Phase 0 — Outline & Research

Output: [`research.md`](./research.md).

Open unknowns going into Phase 0 (and how Phase 0 closed each):

1. *Which Spicetify Platform API yields paged playlist tracks?* — `Spicetify.Platform.LibraryAPI.getTracks({ limit, offset })` for Liked Songs; playlists need a separate API surface. Research confirms the candidate methods and the inline shape (lacks `duration_ms` and `linked_from`, hence the enrichment step).
2. *Which catalog endpoint, batch size, and rate-limit semantics?* — `GET /v1/tracks?ids=…`, up to 50 IDs/request, returns `null` per array slot for unknown/removed IDs, uses `429` + `Retry-After` (seconds) for rate limits, `401 "The access token expired"` for auth.
3. *Exact algorithm semantics from upstream?* — JMPerez `dedup/deduplicator.ts:15-57`: same canonical ID OR same normalized `name` + first-artist (case-insensitive) within ±2000 ms. Boundary is *inclusive* on 2000.
4. *Region-relinked tracks?* — Use `linked_from.uri` as canonical when present, else the track URI (FR-004).
5. *Local files?* — Skip URIs under `spotify:local:` (FR-003).
6. *Cancellation semantics?* — `AbortSignal`; one signal per scan; aborting before a Retry-After wait completes still aborts promptly because the enricher awaits a `setTimeout` Promise that resolves on either timeout *or* `AbortSignal.reason`.

No NEEDS CLARIFICATION marker is required — every Phase 0 unknown closed during interrogation + research.

## Phase 1 — Design & Contracts

Output: [`data-model.md`](./data-model.md), [`contracts/`](./contracts/), [`quickstart.md`](./quickstart.md).

**data-model.md** enumerates every new type and FSM:
- `RawTrack` (output of enumeration), `EnrichedTrack` (output of enrichment), `DuplicateGroup`, `DetectionResult`, `ProgressEvent`.
- `DetectionState` discriminated union: `idle` | `scanning` ({ stage, processed, total }) | `loaded` ({ result }) | `failed` ({ reason: DetectionError }) — with a pure `transition(state, action)`.
- `DetectionError` reason taxonomy: `'auth-token-expired'` | `'rate-limit-unparseable'` | `'network-failure'` | `'malformed-enrichment-payload'` | `'enumerator-failed'` | `'catalog-rejected'` | `'aborted'`. `aborted` is non-user-visible — the store treats it as a state revert, not a `failed` transition.
- `DuplicateKey` normalization rule (lowercased name, trimmed whitespace, joined with first-artist via a separator that cannot appear in either input).
- Per-type FR coverage table mapping every type and method back to spec IDs.

**contracts/** specifies three port docs, each covering: signature, `AbortSignal` semantics, `onProgress` shape (where applicable), atomicity / order guarantees, error modes (which `DetectionError` reasons can surface and on what host conditions), and fail-loud + classifier predicate pairings.

**quickstart.md** is a developer-facing end-to-end walkthrough: how a row click traverses store → scanner → enumerator + enricher → algorithm → result, with the four ADRs cited at the relevant junctions.

## Post-Phase-1 Charter Re-check

| Directive | Re-evaluation |
|---|---|
| DIRECTIVE_001 | ✅ Every new file's folder is fixed; `test/architecture.test.ts` rules apply automatically. |
| DIRECTIVE_003 | ✅ Four ADRs scheduled with subjects + driving constraints. |
| DIRECTIVE_010 | ✅ Every type, port method, and FSM cell traces back to a spec ID. |
| DIRECTIVE_030 | ✅ Coverage gate + `tsc --noEmit` + architecture test apply without carve-out. |
| DIRECTIVE_034 | ✅ Implementation tasks (Phase 2 / `/spec-kitty.tasks`) will lock TDD on each WP. |
| DIRECTIVE_036 | ✅ Fake enumerator + fake enricher drive the store + UI through the same port surface as production. Integration test does not reach into private fields. |

**Verdict**: PASS (post-Phase-1). No complexity exceptions required.

## Complexity Tracking

No charter violations. Table intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| (none) | — | — |
