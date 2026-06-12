# Implementation Plan: Remove Duplicate Tracks Button

**Branch**: `main` (planning base & merge target) | **Date**: 2026-06-11 | **Spec**: [`spec.md`](./spec.md)
**Input**: Feature specification from `kitty-specs/remove-duplicate-tracks-button-01KTW64K/spec.md`

**Branch strategy summary**: Current branch at plan start: `main`. Planning/base branch for this feature: `main`. Completed changes merge into `main`. `branch_matches_target` = `true`.

## Summary

A scanned collection row (Liked Songs or a playlist) currently shows a read-only duplicate summary. This mission adds a per-row **"Remove duplicates"** action that appears only once that row is `loaded` with `removableTrackCount > 0` (FR-001/FR-002). Triggering it computes a **remove-set** — every duplicate-group member except the earliest (`defaultKeepIndex === 0`) — and, behind an explicit per-action confirmation that names the collection and exact count (FR-005), deletes those copies from **that one collection only** (FR-003/C-003). Removable counts above 25 require a second confirmation (FR-006). The acted row updates **in-client** from the already-known scan data minus the removed tracks — no re-fetch, no auto re-scan (FR-008/FR-009/A-2). Partial failures are surfaced and the still-present copies stay visible (FR-010). Nothing runs automatically (FR-011); an in-progress removal blocks a second overlapping removal of the same collection (FR-012).

**Technical approach.** Continue the **hexagonal / ports-and-adapters** layout enforced by `test/architecture.test.ts` (ADR-0001). The mutation surface is a single new **`RemovalExecutor`** port with a Spicetify adapter wrapping the two confirmed host primitives and an in-memory fake for tests. Two new **pure domain transforms** carry the logic: `computeRemoveSet` (DetectionResult → ordered list of track references to delete, paired with the `isRemovableResult` classifier per NFR-004) and `applyRemovalOutcome` (DetectionResult + RemovalOutcome → updated DetectionResult, the in-client refresh). Removal state lives as a **nested sub-state on the existing detection `loaded` state** (the answer to the planning interview) rather than a new store, because removal both reads and rewrites the same `DetectionResult` the row already holds. Confirmation is an **in-app React** component (interview decision) so the two-step >25 flow and the 24/25/26 boundary are fully exercisable under happy-dom and the 100%-coverage gate. Liked Songs and playlists differ only at the adapter: saved-track URIs are unique, so Liked Songs deletes by `{ uris }`; a playlist may repeat a URI, so each occurrence is addressed by its item `uid` (resolved by Phase-0 research — see below).

**Phase-0 research outcome (resolves deferred planning Q3).** The host removal primitives are confirmed (against a maintained community type definition; flagged for live verification per this repo's `ADR-0011` precedent):
- `Spicetify.Platform.LibraryAPI.remove({ uris: string[] })` — Liked Songs; URIs are unique there.
- `Spicetify.Platform.PlaylistAPI.remove(playlistUri, tracks: { uri; uid }[])` — playlists; `uid` disambiguates a repeated URI, and `PlaylistAPI.getContents` already returns `uid` per item.

Consequence: the enumerator must capture the playlist item **`uid`** (an additive field), a small, documented deviation from spec assumption **A-3** ("existing fields sufficient; no detection change"). The matching algorithm is untouched — only the data carried through enrichment widens. This is tracked as **ADR-0012**.

## Technical Context

**Language/Version**: TypeScript 6.x (strict, per existing `tsconfig.json`); ES2022+ target.
**Primary Dependencies**: React 19, Zustand 5 (vanilla store + bound hook factory), Spicetify Platform globals typed via `src/types/spicetify-platform.d.ts` (widened this mission for `PlaylistAPI.remove` / `LibraryAPI.remove`).
**Storage**: None. Removal state and the updated `DetectionResult` live in-memory in the detection store for the page-mount lifetime; route-reset discards them (existing `reset`). No disk/localStorage.
**Testing**: Vitest + happy-dom + @testing-library/react + @vitest/coverage-v8. Pure-domain transforms and the FSM test without happy-dom; React confirmation/button tests use happy-dom. Coverage gate 100% line + branch on every new module (NFR-003, charter Testing Standards). TDD mandatory (`DIRECTIVE_034`).
**Target Platform**: Spicetify custom app inside the Spotify desktop client (Linux/macOS/Windows). Bundled via `spicetify-creator`. Browser invocation is not a target (C-005).
**Project Type**: Single project — `src/` (production) + `test/` (mirrored). Hexagonal layout.
**Performance Goals**: `computeRemoveSet` and `applyRemovalOutcome` are `O(N)` over the scanned tracks (single pass, key-bucketed). Removal is `O(R/batch)` host calls where `R = removableTrackCount`. No hard wall-clock bound (memory `avoid-hard-time-cutoffs-in-nfrs`); NFR-002 is met by a `removing` state plus a removed/failed outcome, not a timer.
**Constraints**:
- No silent library mutation (C-001): every removal is gated by the FR-005 confirmation; `removable > 25` adds the FR-006 second confirmation. The confirmation copy states the collection name and the exact count.
- Single-collection scope (C-003): the `RemovalExecutor` is called with exactly one `RemovalTarget`; there is no cross-collection or global remove (out of scope).
- Explicit-trigger only / no auto-run (C-002 / FR-011): removal originates solely from the button `onClick` → confirm `onClick`. No store listener, mount effect, or scan-completion hook initiates removal.
- In-client update only (A-2 / FR-008 / FR-009): post-removal the row is refreshed by `applyRemovalOutcome` over the existing `DetectionResult`; no host re-read, no implicit re-scan.
- Keep-earliest is fixed (C-006): `computeRemoveSet` always retains `defaultKeepIndex === 0` and removes the rest; per-group override is out of scope.
- Local files stay excluded (C-004): detection already drops `spotify:local:…` before grouping, so they are never remove-set members; this mission does not touch that exclusion.
- Concurrency (FR-012): while a row's removal phase ∈ {`confirming`, `confirming2`, `removing`} the FSM ignores a second `removeRequest` and the UI disables the button.
- Fail-loud + classifier (NFR-004): `computeRemoveSet` throws a typed error on a malformed `DetectionResult` and ships `isRemovableResult` so callers pre-check.
- Boundary tests at **24 / 25 / 26** removable tracks (NFR-003): 25 → single confirm; 26 → double confirm ("greater than 25"). Plus the removal batch-size edges and the empty/all-failed/all-succeeded outcome cases.
- JSDoc on every export; README updated for the new user-facing action (charter Docs / `DIRECTIVE_003`).
- ADRs for load-bearing decisions (`DIRECTIVE_003`); three scheduled below.

**Scale/Scope**: A large library (~20k saved tracks) can surface a large `removableTrackCount`. Removal batches the remove-set so a transient failure isolates to a batch rather than the whole collection, and so the `removing` state can report progress on big collections (NFR-002).

## Charter Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Directive | Gate question | Pre-Phase-0 verdict | Post-Phase-1 verdict |
|---|---|---|---|
| **DIRECTIVE_001** (architectural integrity) | Named pattern declared; new code respects boundaries? | ✅ Hexagonal declared (§Summary); `test/architecture.test.ts` enforces the import graph and will catch the new port/adapter/domain/store/ui files. | ✅ §Project Structure + contracts/ place every new file in a folder that dictates its allowed imports. |
| **DIRECTIVE_003** (decision documentation) | Load-bearing decisions tracked as ADRs? | ✅ Three ADRs scheduled (0012–0014). | ✅ Subjects + inputs enumerated in §Project Structure. |
| **DIRECTIVE_010** (specification fidelity) | Plan traces to FR/NFR/Constraints? | ✅ §Constraints cites FR/NFR/C numbers. | ✅ data-model.md + contracts/ tag every type/method with the FR/NFR/C it serves. |
| **DIRECTIVE_030** (test+typecheck quality gate) | Gate forbids merge without 100% line/branch + passing types? | ✅ Existing Vitest coverage gate + `tsc --noEmit` + architecture test. | ✅ No carve-outs this mission. |
| **DIRECTIVE_034** (test-first development) | Every module via failing → green → refactor? | ✅ `/spec-kitty.tasks` will lock each WP to a failing-test gate. | n/a — re-validated at tasks time. |
| **DIRECTIVE_036** (black-box integration testing) | Black-box surface exercised without mocking internals? | ✅ `FakeRemovalExecutor` drives the store + UI through the same port the Spicetify adapter implements. | ✅ contracts/ specify that port surface. |

**Verdict**: PASS (pre-Phase-0). Re-evaluated post-Phase-1 below.

**Mission-specific safety gates** (charter Risk Boundaries):
- *No silent library mutations* — every `RemovalExecutor.remove` is reached only after the FR-005 confirmation resolves; the store has no path from data load to removal. ✅
- *Per-action confirmation showing exactly what will be removed* — the in-app dialog renders the target collection name and `removableTrackCount` before any host call (FR-005 / NFR-001). ✅
- *Bulk-delete second confirmation (>25)* — FSM `confirming2` phase gates removal when `removableTrackCount > 25` (FR-006); boundary-tested at 24/25/26. ✅
- *Cross-collection operations require explicit scope* — N/A: scope is a single collection per action (C-003); cross-collection removal is out of scope. ✅
- *No auto-run on launch / route change / scan completion* — removal entry point is button `onClick` only; no effect or subscription triggers it (FR-011 / C-002). ✅

**Post-Phase-1 re-check**: PASS. Design introduces one spec deviation (capturing playlist `uid`, deviating from A-3); it is additive, does not change detection semantics, and is documented in ADR-0012 and `research.md` §3. No charter gate is weakened. See §Complexity Tracking.

## Project Structure

### Documentation (this feature)

```
kitty-specs/remove-duplicate-tracks-button-01KTW64K/
├── plan.md              # This file
├── research.md          # Phase 0 — host API resolution, decisions, alternatives, live-verify items
├── data-model.md        # Phase 1 — new/changed types, the extended FSM, error taxonomy
├── quickstart.md        # Phase 1 — developer + live-client end-to-end story
├── contracts/           # Phase 1 — contract docs
│   ├── removal-executor-port.md
│   ├── remove-set-transform.md
│   ├── removal-state-fsm.md
│   └── removal-confirmation-ui.md
├── spec.md              # Approved mission spec (present)
└── meta.json            # Mission metadata
```

### Source Code (repository root)

The codebase already uses hexagonal / ports-and-adapters with the import graph enforced by `test/architecture.test.ts` (ADR-0001). New and changed files slot into the existing folders:

```
src/
├── domain/
│   ├── remove-set.ts            # NEW — RemoveSet/TrackRef types, computeRemoveSet, isRemovableResult (NFR-004)
│   ├── apply-removal-outcome.ts # NEW — pure in-client refresh: DetectionResult + RemovalOutcome → DetectionResult (FR-008)
│   ├── removal-types.ts         # NEW — RemovalTarget, TrackRef, RemovalOutcome, RemovalProgressEvent
│   ├── detection-state.ts       # CHANGED — `loaded` carries `removal: RemovalState`; new removal actions + transitions
│   ├── detection-types.ts       # CHANGED — RawTrack/EnrichedTrack gain optional `uid` (ADR-0012)
│   └── removal-errors.ts        # NEW — typed RemovalError taxonomy (malformed result, executor failure)
├── ports/
│   └── removal-executor.ts      # NEW — RemovalExecutor port interface
├── adapters/
│   ├── spicetify-removal-executor.ts # NEW — LibraryAPI.remove / PlaylistAPI.remove, batching, outcome aggregation
│   ├── fake-removal-executor.ts      # NEW — scripted outcomes (success/partial/throw) for store+UI tests
│   └── spicetify-tracks-enumerator.ts# CHANGED — capture `uid` for playlist items (ADR-0012)
├── store/
│   └── detection-store.ts       # CHANGED — requestRemoval / confirmRemoval / cancelRemoval + execute via RemovalExecutor; concurrency lock (FR-012)
├── ui/
│   ├── RemoveDuplicatesButton.tsx        # NEW — gated button (FR-001/FR-002)
│   ├── RemoveDuplicatesButton.module.scss# NEW
│   ├── RemovalConfirmDialog.tsx          # NEW — one-step + >25 two-step confirm (FR-005/FR-006/NFR-001)
│   ├── RemovalConfirmDialog.module.scss  # NEW
│   ├── RemovalOutcomeView.tsx            # NEW — partial-failure / done messaging (FR-010/AS-8)
│   ├── DetectionLoadedSummary.tsx        # CHANGED — host the button + outcome view under the summary
│   ├── PlaylistRow.tsx / LikedSongsRow.tsx # CHANGED only if wiring needs the collection displayName/target down
├── types/
│   └── spicetify-platform.d.ts  # CHANGED — declare PlaylistAPI.remove / LibraryAPI.remove (+ contains/getEvents as used)
└── app.tsx                      # CHANGED — construct SpicetifyRemovalExecutor and inject into the detection store

test/                            # mirrors src/ — one spec per new/changed module; architecture.test.ts updated for new files
.claude/adr/
├── 0012-capture-playlist-uid-for-occurrence-removal.md  # NEW
├── 0013-removal-substate-on-detection-loaded.md          # NEW
└── 0014-removal-executor-port-and-partial-failure.md     # NEW
```

**Structure Decision**: Single hexagonal project. Mutation is isolated to one port (`RemovalExecutor`) and one Spicetify adapter; all decision logic (what to remove, how the row looks afterward) is pure domain code that tests exercise without a host. Removal state extends the existing detection `loaded` state rather than adding a store, keeping one source of truth per row.

**ADR roadmap**:
- **ADR-0012** — Capture playlist item `uid` in enumeration to address repeated-URI occurrences for `PlaylistAPI.remove`; documents the additive deviation from spec A-3 and why Liked Songs needs no `uid`.
- **ADR-0013** — Model removal as a nested `RemovalState` on the detection `loaded` state (chosen over a separate removal store), with the extended FSM action set and transition table.
- **ADR-0014** — `RemovalExecutor` port + Spicetify adapter: per-collection-kind dispatch, batching, and the partial-failure detection strategy (and its live-verification dependency).

## Complexity Tracking

*Fill ONLY if Charter Check has violations that must be justified.*

| Deviation | Why needed | Simpler alternative rejected because |
|-----------|------------|--------------------------------------|
| Spec A-3 deviation: enumerator captures playlist `uid` | Keep-earliest removal of a **repeated URI** in a playlist requires addressing the specific later occurrences; `PlaylistAPI.remove` targets them by `uid` (Phase-0 research). Without `uid`, removing by URI alone would delete every copy including the one to keep. | "Remove by URI only" cannot keep exactly one occurrence of a repeated URI. "Position/index-based remove" was not supported by the confirmed `PlaylistAPI.remove` signature. The `uid` is already present on `getContents` items, so capture is additive and leaves the detection algorithm unchanged. |
