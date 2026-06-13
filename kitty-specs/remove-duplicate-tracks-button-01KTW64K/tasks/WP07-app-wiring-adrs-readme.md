---
work_package_id: WP07
title: App wiring, row props, ADRs, README
dependencies:
- WP04
- WP05
- WP06
requirement_refs:
- FR-001
- FR-003
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts for this feature were generated on main. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into main unless the human explicitly redirects the landing branch.
created_at: '2026-06-11T20:52:36Z'
subtasks:
- T024
- T025
- T026
- T027
agent: "claude:opus:reviewer:reviewer"
shell_pid: "7301"
history:
- timestamp: '2026-06-11T20:52:36Z'
  action: created
  actor: tasks-prompt-generator
authoritative_surface: src/app.tsx
execution_mode: code_change
owned_files:
- src/app.tsx
- src/ui/PlaylistRow.tsx
- src/ui/LikedSongsRow.tsx
- test/app.test.tsx
- test/ui/PlaylistRow.test.tsx
- test/ui/LikedSongsRow.test.tsx
- README.md
- .claude/adr/0012-capture-playlist-uid-for-occurrence-removal.md
- .claude/adr/0013-removal-substate-on-detection-loaded.md
- .claude/adr/0014-removal-executor-port-and-partial-failure.md
tags: []
---

# WP07 — App wiring, row props, ADRs, README

## Objective

Final integration — turn the under-test slices into the shipping feature:

1. **App wiring** — construct `SpicetifyRemovalExecutor` and inject it into the production
   detection store in `app.tsx`, keeping module load side-effect-free.
2. **Row props** — thread `target` + `displayName` (+ `collectionKey`) from `PlaylistRow` /
   `LikedSongsRow` into `DetectionLoadedSummary` so the removal surface mounts.
3. **ADRs** — write ADR-0012, ADR-0013, ADR-0014 for the three load-bearing decisions.
4. **README** — document the new Remove-duplicates action for users.

Full `npm run test` + `npm run typecheck` green; `test/app.test.tsx` imports `src/app.tsx`
without Spicetify globals.

## Context

This WP depends on the production adapter (WP04), the store actions (WP05), and the UI (WP06).
Read first:

- `src/app.tsx` (existing) — the construction-order + "side-effect-free at module load" contract.
  You add the `SpicetifyRemovalExecutor` construction and pass it as the optional second arg to
  `createDetectionStore`.
- `src/ui/PlaylistRow.tsx` / `src/ui/LikedSongsRow.tsx` (existing) — they render
  `<DetectionLoadedSummary result={rowState.result} />`. You add `collectionKey`, `target`,
  `displayName` to that call (WP06 made those props optional; now supply them).
- `src/adapters/spicetify-removal-executor.ts` (WP04) — the class you construct.
- `src/store/detection-store.ts` (WP05) — `createDetectionStore(scanner, removalExecutor?)`.
- [`../plan.md`](../plan.md) §ADR roadmap + §Complexity Tracking — the ADR subjects + rationale.
- [`../research.md`](../research.md) — source material for the ADRs (esp. §2, §3, §4, §5).
- Existing ADRs under `.claude/adr/` (e.g. `0011-*`) — match their structure/format.

**Architectural constraint** (ADR-0001): `app.tsx` is the **only** place authorized to
instantiate production adapters; rows import the store context + domain types only (no
adapters/ports). Construction must not touch `Spicetify.*` at module load (verified by
`test/app.test.tsx`).

## Branch strategy

Planning base & merge target: **`main`**. Workspace/branch assigned by
`spec-kitty agent action implement WP07 --agent <name>` from `lanes.json`. Depends on **WP04**,
**WP05**, **WP06** — this is the last WP and integrates all three.

## Subtasks

### T024 — App wiring (`src/app.tsx`)

**Purpose**: Inject the production removal executor.

**Changes**:
- Import `SpicetifyRemovalExecutor` from `./adapters/spicetify-removal-executor`.
- Construct it side-effect-free (no `Spicetify.*` at construction — the adapter reads
  `globalThis.Spicetify.Platform` lazily, same as `SpicetifyTracksEnumerator`):
  `const removalExecutor = new SpicetifyRemovalExecutor();`
- Pass it as the **second** argument:
  `const productionDetectionStore = createDetectionStore(detectionScanner, removalExecutor);`
- Update the header JSDoc to note the removal executor is now constructed and injected, and that
  it remains side-effect-free at module load.

**Tests** (`test/app.test.tsx`, extend existing): the existing test imports `src/app.tsx` with no
Spicetify globals and asserts it does not throw at import. Confirm it still passes with the new
construction; add an assertion that importing the module performs no `Spicetify.*` access (the
existing test's guarantee must hold).

**Files**: `src/app.tsx` (changed, +~3 lines); `test/app.test.tsx` (changed if needed).

### T025 — Row props (`src/ui/PlaylistRow.tsx`, `src/ui/LikedSongsRow.tsx`)

**Purpose**: Supply the removal props so `DetectionLoadedSummary` mounts the removal surface
(WP06 left them optional).

**Changes**:
- `LikedSongsRow`: pass to `<DetectionLoadedSummary>`:
  - `collectionKey={LIKED_SONGS_KEY}` (`'liked-songs'`)
  - `target={{ kind: 'liked-songs' }}`
  - `displayName="Liked Songs"`
  alongside the existing `result={rowState.result}`.
- `PlaylistRow`: pass:
  - `collectionKey={collectionKey}` (the playlist URI, `row.key`)
  - `target={{ kind: 'playlist', playlistUri: collectionKey }}`
  - `displayName={row.displayName}`
- Import `RemovalTarget` type from `src/domain/removal-types` if an explicit annotation helps
  (the object literals are inferable; keep imports minimal and architecture-clean — domain types
  are allowed).

**Tests** (`PlaylistRow.test.tsx`, `LikedSongsRow.test.tsx`, extend existing): with a seeded
`loaded` row carrying `removableTrackCount > 0`, assert the Remove-duplicates button appears in
the row (it did not before this wiring). Drive `requestRemoval` via the button and assert the
confirm dialog appears for that row. Confirm the existing row tests (scanning/loaded/failed/idle
rendering) still pass. Single-collection scope: clicking Playlist A's button does not surface a
dialog on Liked Songs (separate store rows).

**Files**: `PlaylistRow.tsx`, `LikedSongsRow.tsx` (changed, +~3 lines each); their tests (changed).

### T026 — ADRs 0012 / 0013 / 0014 (`.claude/adr/`, NEW) [P]

**Purpose**: Record the three load-bearing decisions (`DIRECTIVE_003`). Match the existing ADR
format (context / decision / consequences / alternatives). Source material in `plan.md`,
`research.md`.

- **ADR-0012 — Capture playlist `uid` for occurrence removal.** Why removing a repeated playlist
  URI requires addressing the specific later occurrences by `uid`; why Liked Songs needs none
  (URIs unique there); the additive deviation from spec **A-3**; matching algorithm untouched.
  Source: research §1.2, §2; plan §Complexity Tracking.
- **ADR-0013 — Removal sub-state on the detection `loaded` state.** Why removal nests on `loaded`
  (reads + rewrites the same `DetectionResult`) rather than a separate `RemovalStore`; the
  extended FSM action set; the rejected separate-store alternative. Source: research §3;
  data-model §5.
- **ADR-0014 — `RemovalExecutor` port + partial-failure strategy.** The single mutation port;
  per-kind dispatch; batched partial-failure aggregation; the live-verification dependency and
  its outcome (record what WP04/T015 found — `BATCH_SIZE`, atomicity, A-5, client-UI sync).
  Source: research §1, §4, §5; contract `removal-executor-port.md`. **Update this ADR with the
  actual T015 live-verification results** captured during WP04.

**Files**: three new files under `.claude/adr/`.

### T027 — README (`README.md`, CHANGED) [P]

**Purpose**: Document the user-facing action (charter Docs / `DIRECTIVE_003`).

**Changes**: add a short "Remove duplicates" section describing:
- After a scan, a per-row **Remove duplicates** button appears when the collection has removable
  duplicates; it keeps the earliest copy of each group and removes the rest from **that
  collection only**.
- The confirmation names the collection and the exact count; removals over 25 require a second
  confirmation; nothing runs automatically.
- Partial failures are surfaced and unremoved copies stay visible; the row updates in-client (no
  automatic re-scan).
Keep it concise and consistent with the README's existing voice/structure.

**Files**: `README.md` (changed).

## Test strategy

TDD (`DIRECTIVE_034`) for T024/T025: failing test first (e.g. the Remove button appears in a
seeded `loaded` row), watch it fail, wire it. The full gate runs here: `npm run typecheck`,
`npm run test` (100% line/branch maintained across the now-integrated modules), and the
architecture test (auto-discovers everything). ADRs/README are docs — no coverage, but they are
hard DoD items. `test/app.test.tsx` remains the guard that `app.tsx` is import-safe without a host.

## Definition of Done

- [ ] `app.tsx` constructs `SpicetifyRemovalExecutor` and injects it as the second arg to
      `createDetectionStore`; module load stays side-effect-free; `test/app.test.tsx` green.
- [ ] `PlaylistRow`/`LikedSongsRow` pass `collectionKey`/`target`/`displayName` to the summary;
      the Remove button now appears in a seeded `loaded` row; existing row tests still pass.
- [ ] ADR-0012/0013/0014 written in the repo ADR format; ADR-0014 records the WP04/T015 live
      results (`BATCH_SIZE`, atomicity, A-5, UI sync).
- [ ] README documents the Remove-duplicates action (gating, confirmation, >25, partial failure,
      in-client refresh, single-collection scope).
- [ ] Full `npm run test` + `npm run typecheck` green; architecture test clean; 100% line/branch
      preserved.

## Risks

| Risk | Mitigation |
|---|---|
| `app.tsx` construction touching `Spicetify.*` at module load | Adapter reads `globalThis.Spicetify` lazily; `test/app.test.tsx` asserts import-without-host stays green. |
| Row wiring breaking existing row tests | Add to existing call sites only; re-run the full row suites; new props are additive. |
| ADR-0014 written before live results exist | It depends on WP04 — record the actual T015 findings; do not merge with placeholder atomicity claims. |

## Reviewer guidance

- Confirm `app.tsx` injects the real executor and stays side-effect-free (no `Spicetify.*` at
  import); `test/app.test.tsx` still green.
- Confirm both rows pass the correct `target`/`collectionKey`/`displayName` and the button now
  renders in a loaded row.
- Confirm the three ADRs match the repo format and ADR-0014 reflects the live-verification
  results, not the provisional plan.
- Confirm the README change is accurate and user-facing.

## Implementation command

```bash
spec-kitty agent action implement WP07 --agent <name>
```

## Activity Log
- 2026-06-12T20:27:03Z – claude:opus:implementer:implementer – shell_pid=80690 – Started implementation via action command
- 2026-06-13T08:32:07Z – claude:opus:implementer:implementer – shell_pid=80690 – T024 app wiring + T025 row props + T026 ADRs(0012/13/14) + T027 README done; typecheck clean; 1087 tests pass at 100% line/branch/func coverage
- 2026-06-13T08:32:15Z – claude:opus:reviewer:reviewer – shell_pid=7301 – Started review via action command
- 2026-06-13T08:34:02Z – claude:opus:reviewer:reviewer – shell_pid=7301 – Review passed: app.tsx injects SpicetifyRemovalExecutor as 2nd arg to createDetectionStore, side-effect-free at load (test asserts platformSpy not called + headless import resolves); both rows pass collectionKey/target/displayName mounting the removal surface (button+confirm dialog tests added, single-collection scope verified); ADR-0012/0013/0014 present in repo format, 0014 records live T015 results (BATCH_SIZE=100, atomic reject-whole, A-5, UI self-sync); README documents gating/keep-earliest/single-collection/exact-count/>25 second confirm/no auto-run/partial-failure/in-client refresh. typecheck clean; 1087 tests pass; 100% coverage (875/875 stmt, 658/658 branch, 164/164 func, 787/787 line). Scope clean: 7 owned files only.
