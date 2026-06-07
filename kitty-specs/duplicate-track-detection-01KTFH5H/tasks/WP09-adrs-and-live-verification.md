---
work_package_id: WP09
title: ADRs & Live Verification
dependencies:
- WP08
requirement_refs:
- FR-009
- FR-010
- FR-011
- FR-012
- NFR-006
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning base and merge target are both `main`. Execution worktree/branch are assigned by `finalize-tasks`; enter the assigned workspace before editing. Final merge target is `main`.
subtasks:
- T026
- T027
- T028
- T029
- T030
history:
- timestamp: '2026-06-07T08:24:49Z'
  action: created
  actor: tasks-prompt-generator
authoritative_surface: kitty-specs/duplicate-track-detection-01KTFH5H/
execution_mode: planning_artifact
owned_files:
- .claude/adr/0006-separate-detection-store.md
- .claude/adr/0007-abort-signal-cancellation.md
- .claude/adr/0008-progress-signal-shape.md
- .claude/adr/0009-sequential-enrichment-and-retry-after.md
- kitty-specs/duplicate-track-detection-01KTFH5H/live-verification/**
tags: []
---

# WP09 — ADRs & Live Verification

## Objective

Close the governance and acceptance loop:

1. Capture the four load-bearing design decisions as ADRs (`DIRECTIVE_003` / charter §Docs).
2. Execute the full manual-verification flow against a real Spicetify client and attach the loaded-summary screenshot as the live-verification artefact (memory `spec-kitty-live-verification-required`).

This WP closes the mission's Definition of Done.

## Context

The four ADRs codify decisions already made and captured in [`../research.md`](../research.md). The ADRs are short — the "why" is in research.md; the ADR just pins the decision for future contributors.

`.claude/adr/` is gitignored per CLAUDE.md, but the files MUST still exist on disk — they're load-bearing for charter compliance.

Live verification is the second time this repo has needed it; memory `spec-kitty-live-verification-required` flags a prior incident where it was skipped and a CRITICAL defect shipped. The screenshot is a non-skippable artefact.

Read first:
- [`../research.md`](../research.md) §§R-002, R-003, R-004, R-005, R-009, R-010 — the source material for each ADR.
- [`../quickstart.md`](../quickstart.md) §"Manual verification" — the step-by-step verification flow.
- `.claude/adr/0001-…`, `.claude/adr/0005-…` — the existing ADR format to follow.

## Branch strategy

Planning base & merge target: **`main`**. Depends on WP08 — live verification requires the production-wired extension to be running.

## Subtasks

### T026 — ADR-0006: Separate detection-store

**File**: `.claude/adr/0006-separate-detection-store.md`

**Sections**:
- **Status**: Accepted.
- **Context**: The detection feature needs per-row state (scanning/loaded/failed) keyed by collection URI. The existing `playlists-store` owns page-level load-state (idle / loading / loaded / failed). The question: extend `playlists-store` or create a separate `detection-store`?
- **Decision**: Create `src/store/detection-store.ts` as a separate vanilla Zustand store keyed by canonical collection URI.
- **Consequences**:
  - Strict file-level SRP (charter Quality Gates) — two unrelated FSMs live in two separate files.
  - Symmetric reset wiring: each store owns its `reset`; `RouteResetContext` calls both.
  - Page-level FSM invariants never have to consider per-row scan state, and vice versa.
  - Slightly more boilerplate (two providers in `app.tsx`), but the boilerplate is identical to the existing pattern.
- **Alternatives considered**: Extend `playlists-store` with a `detection: Record<canonicalUri, DetectionState>` field — rejected because it couples two unrelated FSMs in one file.
- **References**: `kitty-specs/duplicate-track-detection-01KTFH5H/research.md` §R-002; `src/store/detection-store.ts`; `src/store/RouteResetContext.tsx`.

**Length**: ~50 lines.

### T027 — ADR-0007: AbortSignal as the cancellation primitive

**File**: `.claude/adr/0007-abort-signal-cancellation.md`

**Sections**:
- **Status**: Accepted.
- **Context**: The detection pipeline needs cancellation for re-trigger (FR-011) and route-reset (FR-012). Options: `AbortSignal`, scan-id "stale-result" guards, or both.
- **Decision**: Use `AbortSignal` as the single cancellation primitive across `TracksEnumerator`, `CatalogEnricher`, and `DetectionScanner`.
- **Consequences**:
  - Native to the JS platform; no extra dependency.
  - Pairs natively with `CosmosAsync` and any future `fetch`-based adapter.
  - Single mechanism for re-trigger and route-reset.
  - Stops network work — a stale scan doesn't keep issuing requests.
  - Requires an abort-aware sleep helper in the enricher to make cancellation prompt during `Retry-After` waits (ADR-0007's cousin pattern from research §R-010).
- **Alternatives considered**: scan-id "stale-result" check — rejected because it doesn't stop network work. Both AbortSignal + stale-id guard — kept as possible future hardening, not in scope.
- **References**: `kitty-specs/duplicate-track-detection-01KTFH5H/research.md` §§R-003, R-010; `src/store/detection-store.ts`; `src/adapters/spicetify-catalog-enricher.ts`.

**Length**: ~50 lines.

### T028 — ADR-0008: Progress signal shape

**File**: `.claude/adr/0008-progress-signal-shape.md`

**Sections**:
- **Status**: Accepted.
- **Context**: NFR-006 requires the scanning state to be distinguishable from idle and loaded. Options: binary scanning state, stage-labeled progress, stage + counts, push-based observable.
- **Decision**: Use `ProgressEvent = { stage: 'enumerating' | 'enriching' | 'matching'; processed: number; total: number | null }` with an injected `onProgress(event)` callback alongside `AbortSignal`.
- **Consequences**:
  - Users on large libraries see quantitative progress ("Enriching 23 of 478…").
  - Single-callback port surface — no event bus, no observable abstraction.
  - Emission cadence is documented and bounded (one event per page / per batch / two per scan for matching).
  - The store reflects the latest event into `DetectionState.scanning.progress`; the view component renders it.
- **Alternatives considered**: Binary scanning state — rejected (no user signal on long libraries). Stage-only labels — rejected (loses quantitative reassurance). Push-based observable / async iterable — rejected (over-engineered for a single subscriber).
- **References**: `kitty-specs/duplicate-track-detection-01KTFH5H/research.md` §R-004; `src/domain/detection-types.ts`; `src/ui/ScanningView.tsx`.

**Length**: ~50 lines.

### T029 — ADR-0009: Sequential enrichment + local Retry-After honoring

**File**: `.claude/adr/0009-sequential-enrichment-and-retry-after.md`

**Sections**:
- **Status**: Accepted.
- **Context**: Catalog enrichment batches 50 IDs per request against `GET /v1/tracks?ids=…`. Per-scan concurrency choices: sequential (1 in flight), bounded parallel, unbounded parallel. Retry-After handling: parse and sleep locally in the enricher, or surface to the scanner / store.
- **Decision**: Sequential — one 50-ID batch in flight per scan. `Retry-After` is parsed and slept locally inside the enricher between batches. Cross-row scheduling is independent (each scan has its own Promise chain and AbortController).
- **Consequences**:
  - Gentlest on rate limits; no coordinated pause logic.
  - Adapter stays trivial — a `for` loop awaiting each chunk.
  - Slower on large libraries than bounded-parallel, but per spec NFR-004 (avoid hard wall-clock cutoffs) and the existing progress signal (ADR-0008), the slower-but-clearly-progressing scan is acceptable.
  - Future bounded-parallel adapter is a swap, not a redesign — port shape is unchanged.
  - `Retry-After` is honored exactly per NFR-004; no client-side jitter, no max-retry cap.
- **Alternatives considered**: Bounded parallelism (~4 in flight) — deferred. Unbounded parallel (JMPerez upstream) — rejected (would sustain 429s on the 20k-track target).
- **References**: `kitty-specs/duplicate-track-detection-01KTFH5H/research.md` §§R-005, R-009; `src/adapters/spicetify-catalog-enricher.ts`; `src/adapters/retry-after.ts`.

**Length**: ~60 lines.

### T030 — Live verification

**Artefacts**: a directory `kitty-specs/duplicate-track-detection-01KTFH5H/live-verification/` containing:
- `screenshot-loaded.png` — screenshot of the loaded-summary state on a row that has duplicates.
- `screenshot-no-duplicates.png` (optional) — screenshot of "No duplicates found" on a row that does not.
- `notes.md` — short narrative of the run: which collection was scanned, the displayed count, anything surprising.

**Execution steps** (per `quickstart.md` §Manual verification):

1. `npm run build-local` — confirm the extension bundle builds clean.
2. `spicetify config custom_apps spicetify-dedup` (if not already configured).
3. `spicetify apply` — installs the bundle into the local Spotify client.
4. Open Spotify desktop; navigate to the Dedup page.
5. Click "Load library"; verify the rows render (existing behavior — regression check).
6. **Verify FR-013 (button gating)**: confirm dedup buttons are visible on rows.
7. **Happy path (AS-1, AS-2)**: click the dedup button on Liked Songs or a playlist known to contain duplicates.
   - Verify `idle → scanning → loaded` transition is visible.
   - Verify the displayed group count + tracks-to-remove count is plausible (manual sanity check — does the user agree?).
   - Capture `screenshot-loaded.png`.
8. **No-duplicates path (AS-1)**: click dedup on a playlist with no duplicates (or a small playlist you've curated).
   - Verify "No duplicates found" appears.
   - Capture `screenshot-no-duplicates.png` if available.
9. **Atomic replace (AS-10)**: re-click the same row's dedup button while it's `loaded`.
   - Verify the row transitions back to `scanning` (no stale `loaded` visible mid-transition).
   - Verify the new result lands.
10. **Parallel rows (AS-11)**: click dedup on Liked Songs and a playlist within 1 second of each other.
    - Verify both rows show `scanning` independently.
    - Verify both rows reach `loaded` (or one of them fails for a known reason).
11. **Route-reset (AS-9 / FR-012)**: while a scan is in flight, navigate away from the Dedup page (e.g. to Home), then back.
    - Verify rows are idle on return (no stale `scanning` state).
12. **Failure surface (AS-8, optional)**: if you can trigger one (e.g. by disabling network briefly), verify the failed view renders with a non-empty label.
13. Write `notes.md` summarizing the run and any deviations from expected behavior.

**Definition of Done for live verification**: at least `screenshot-loaded.png` and `notes.md` exist; the implementer signs off that AS-1, AS-2, AS-10, AS-11, and FR-012 were observed end-to-end on a real client.

## Test strategy

This WP is documentation + manual verification. No new unit tests. No coverage gate (ADRs are markdown; live-verification is an artefact, not code).

The existing `npm run test:run` and `npm run typecheck` must remain green from WP08's state — this WP MUST NOT break the test suite.

## Definition of Done

- [ ] Four ADR files exist in `.claude/adr/` with the structure described above.
- [ ] `kitty-specs/duplicate-track-detection-01KTFH5H/live-verification/` directory exists.
- [ ] At least `screenshot-loaded.png` and `notes.md` are present in the live-verification dir.
- [ ] The implementer's review confirms AS-1, AS-2, AS-10, AS-11, FR-012 were observed on a real client.
- [ ] Existing test suite remains green (`npm run test:run`).
- [ ] WP transitions to `done` via the implement-review-merge lifecycle.

## Risks

| Risk | Mitigation |
|---|---|
| Live verification skipped (prior incident per memory) | Reviewer rejects the WP if `screenshot-loaded.png` is missing or `notes.md` doesn't describe an end-to-end run. |
| ADR numbering collision (e.g. 0006 already exists in flight) | Implementer greps `.claude/adr/` for any existing 0006-0009 before creating; if a collision exists, renumbers the new ADRs. |
| `.claude/` is gitignored — the artefacts are untracked. A future contributor may not see the ADRs | Documented in CLAUDE.md; charter explicitly chooses this trade-off. The mission's `quickstart.md` references the ADRs by number, so any future contributor reading the planning will know to look there. |
| Live verification depends on a real Spotify account with a real library; the implementer may not have one with duplicates | Implementer creates a test playlist with intentional duplicates (e.g. add the same song twice from search). Capture against that. |
| Spicetify is not installed in the dev environment | Document the install steps in `notes.md`; if Spicetify cannot be installed (e.g. CI environment), defer to a teammate's manual run and record the handoff. |

## Reviewer guidance

- Verify each ADR has Status, Context, Decision, Consequences, Alternatives, References sections.
- Verify ADR numbering is 0006, 0007, 0008, 0009 (no collisions with existing 0001-0005).
- Verify `screenshot-loaded.png` actually shows a duplicate-loaded summary (not a placeholder).
- Verify `notes.md` describes which acceptance scenarios were observed.
- Verify the implementer ran `npm run build-local` and `spicetify apply` (mentioned in notes).
- If live verification cannot be completed (Spicetify unavailable), the WP CANNOT close — escalate to the user.

## Implementation command

```bash
spec-kitty agent action implement WP09 --agent <name>
```
