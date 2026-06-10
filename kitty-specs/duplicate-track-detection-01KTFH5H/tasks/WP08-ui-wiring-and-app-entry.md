---
work_package_id: WP08
title: UI Wiring & Production App Entry
dependencies:
- WP05
- WP06
- WP07
requirement_refs:
- FR-009
- FR-010
- FR-013
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts for this feature were generated on main. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into main unless the human explicitly redirects the landing branch.
base_branch: kitty/mission-duplicate-track-detection-01KTFH5H
base_commit: 3c497a11e757bfff3f1614a993ec92d14b4d462b
created_at: '2026-06-10T09:23:58.779703+00:00'
subtasks:
- T023
- T024
- T025
shell_pid: "91614"
agent: "claude:claude-sonnet-4-6:implementer:implementer"
history:
- timestamp: '2026-06-07T08:24:49Z'
  action: created
  actor: tasks-prompt-generator
authoritative_surface: src/ui/
execution_mode: code_change
owned_files:
- src/ui/DedupButton.tsx
- src/ui/PlaylistRow.tsx
- src/ui/LikedSongsRow.tsx
- src/ui/dedup-click-log.ts
- src/app.tsx
- test/ui/DedupButton.test.tsx
- test/ui/PlaylistRow.test.tsx
- test/ui/LikedSongsRow.test.tsx
- test/ui/dedup-click-log.test.ts
- test/app.test.tsx
tags: []
---

# WP08 — UI Wiring & Production App Entry

## Objective

Replace the diagnostic-only dedup button click handler with the real `scanCollection` dispatch, render per-row detection state inside the existing row components, and assemble the production singletons in `app.tsx`.

By the end of this WP:
1. `DedupButton` dispatches `useDetectionStore(s => s.scanCollection)(collectionKey, request)` and is `disabled` while the row is `scanning`.
2. `PlaylistRow` and `LikedSongsRow` render `<ScanningView />`, `<DetectionLoadedSummary />`, or `<DetectionFailedView />` based on the per-row state.
3. `app.tsx` constructs `SpicetifyTracksEnumerator` + `SpicetifyCatalogEnricher` + `createDetectionScanner` + `createDetectionStore` and wraps the existing tree with `<DetectionStoreProvider>`.

This is the WP that makes the feature visible to users.

## Context

The existing `DedupButton` uses `logDedupClick` for diagnostic logging. That helper becomes orphan after this WP — delete it (and its test) if no other consumer remains. If a consumer remains, leave it alone.

`LikedSongsRow.tsx` currently hardcodes `playlistUri="spotify:collection:tracks"` for the dedup button. The store contract (data-model §8) uses the sentinel `'liked-songs'` as the collection key for Liked Songs. Reconcile: pass `collectionKey: 'liked-songs'` and `request: { kind: 'liked-songs' }` for the Liked Songs row; pass `collectionKey: row.key` and `request: { kind: 'playlist', playlistUri: row.key }` for playlist rows.

Read first:
- [`../data-model.md`](../data-model.md) §8 — `ScanRequest` shape.
- [`../quickstart.md`](../quickstart.md) §"One click — full flow" — the prose of the wiring.
- `src/ui/DedupButton.tsx` (existing) — the current shape.
- `src/ui/PlaylistRow.tsx`, `src/ui/LikedSongsRow.tsx` (existing).
- `src/app.tsx` (existing) — the production wiring this WP extends.

Architectural constraints: `src/ui/` may import `src/domain/` + `src/store/` (via the context hook). `src/app.tsx` may import everything (it's the composition root).

## Branch strategy

Planning base & merge target: **`main`**. Depends on WP05 (Spicetify adapters for production wiring), WP06 (detection store + context), and WP07 (view components). `finalize-tasks` computes the lane base.

## Subtasks

### T023 — Refactor `DedupButton.tsx`

**Purpose**: Connect the button to the detection store instead of the diagnostic logger.

**New props**:
```ts
export type DedupButtonProps = {
  /** Canonical key for the store row (e.g. `'liked-songs'` or a playlist URI). */
  collectionKey: string;
  /** Discriminated payload for the scanner. */
  request: ScanRequest;
  /** Display name — used for the aria-label. */
  displayName: string;
};
```

**Body**:
```tsx
export function DedupButton({ collectionKey, request, displayName }: DedupButtonProps) {
  const scanCollection = useDetectionStore((s) => s.scanCollection);
  const isScanning = useDetectionStore((s) => s.rows[collectionKey]?.kind === 'scanning');
  return (
    <button
      type="button"
      className={styles.button}
      aria-label={`Dedup ${displayName}`}
      disabled={isScanning}
      onClick={() => { void scanCollection(collectionKey, request); }}
    >
      Dedup
    </button>
  );
}
```

Drop the import of `logDedupClick`. If `dedup-click-log.ts` has no remaining consumers, delete both the source and its test file in this subtask (declared in `owned_files`).

**Tests** (`test/ui/DedupButton.test.tsx`): rewrite from scratch (the prior `logDedupClick` assertions no longer apply).
- Click dispatches `scanCollection(collectionKey, request)`.
- `disabled` is `true` when `rows[key].kind === 'scanning'`.
- `disabled` is `false` from `idle`, `loaded`, or `failed`.
- `disabled` is `false` when `rows[key]` is undefined (idle by default).
- `aria-label` matches `Dedup ${displayName}`.
- Used outside `DetectionStoreProvider` → hook throws (existing fail-loud behavior).

**Files**:
- `src/ui/DedupButton.tsx` (modified).
- `src/ui/dedup-click-log.ts` (deleted if no remaining consumer).
- `test/ui/DedupButton.test.tsx` (rewritten).
- `test/ui/dedup-click-log.test.ts` (deleted alongside the source).

### T024 — Wire per-row detection state into `PlaylistRow.tsx` and `LikedSongsRow.tsx`

**Purpose**: Render the appropriate view component (`ScanningView` / `DetectionLoadedSummary` / `DetectionFailedView`) below or alongside the row's primary content, conditional on `useDetectionStore((s) => s.rows[collectionKey])`.

**`PlaylistRow.tsx`** modifications:
- Compute `collectionKey = row.key` (the playlist URI).
- `const rowState = useDetectionStore((s) => s.rows[collectionKey]);`
- Pass `collectionKey`, `request: { kind: 'playlist', playlistUri: row.key }`, `displayName: row.displayName` to `<DedupButton />`.
- Render below the existing row cells:
  - `rowState?.kind === 'scanning'` → `<ScanningView progress={rowState.progress} />`.
  - `rowState?.kind === 'loaded'` → `<DetectionLoadedSummary result={rowState.result} />`.
  - `rowState?.kind === 'failed'` → `<DetectionFailedView reason={rowState.reason} />`.
  - `rowState === undefined` or `rowState.kind === 'idle'` → nothing extra.

**`LikedSongsRow.tsx`** modifications: same pattern, but `collectionKey = 'liked-songs'` and `request: { kind: 'liked-songs' }`. Pass `displayName: 'Liked Songs'`.

**Tests** (`test/ui/PlaylistRow.test.tsx`, `test/ui/LikedSongsRow.test.tsx`) — extend existing tests:
- Idle row (no store entry) → no extra content beyond the existing row cells.
- Scanning row → `<ScanningView />` mounted; assert by `role="status"`.
- Loaded row → group count visible (or "No duplicates found").
- Failed row → reason label visible.
- Liked Songs row: collection key is `'liked-songs'` (assert via the dispatched scanCollection call).
- Playlist row: collection key is `row.key`; request kind is `'playlist'` with the playlist URI.

Each row test mounts inside a `<DetectionStoreProvider store={testStore} />` with a controlled store instance.

**Files**:
- `src/ui/PlaylistRow.tsx` (modified).
- `src/ui/LikedSongsRow.tsx` (modified).
- `test/ui/PlaylistRow.test.tsx` (modified).
- `test/ui/LikedSongsRow.test.tsx` (modified).

### T025 — Production wiring in `src/app.tsx`

**Purpose**: Construct the production singletons and wrap the existing tree with `<DetectionStoreProvider>`.

**Modifications**:
```tsx
import { SpicetifyTracksEnumerator } from './adapters/spicetify-tracks-enumerator';
import { SpicetifyCatalogEnricher } from './adapters/spicetify-catalog-enricher';
import { createDetectionScanner } from './adapters/detection-scanner';
import { createDetectionStore } from './store/detection-store';
import { DetectionStoreProvider } from './store/DetectionStoreContext';

const productionPlaylistsStore = createPlaylistsStore(new SpicetifyPlaylistsLoader());

const detectionScanner = createDetectionScanner(
  new SpicetifyTracksEnumerator(),
  new SpicetifyCatalogEnricher(),
);
const productionDetectionStore = createDetectionStore(detectionScanner);

const App = () => (
  <PlaylistsStoreProvider store={productionPlaylistsStore}>
    <DetectionStoreProvider store={productionDetectionStore}>
      <RouteResetProvider>
        <DedupPage />
      </RouteResetProvider>
    </DetectionStoreProvider>
  </PlaylistsStoreProvider>
);

export default App;
```

Provider order: `PlaylistsStoreProvider` → `DetectionStoreProvider` → `RouteResetProvider` → page. `RouteResetProvider` (modified in WP06) reads from both stores' contexts, so both providers must be above it.

**Side-effect contract**: constructing `SpicetifyTracksEnumerator` / `SpicetifyCatalogEnricher` MUST NOT touch `Spicetify.Platform` or `Spicetify.CosmosAsync` (matches `SpicetifyPlaylistsLoader` precedent). Module-load happens in non-Spicetify test environments via `test/app.test.tsx`; if construction touches the host globals, the test crashes.

**Tests** (`test/app.test.tsx`) — extend existing:
- App renders without throwing.
- No `Spicetify.*` global access at module load (existing assertion extended).
- Both store providers are present (e.g. `useDetectionStore` inside a child component does not throw).

**Files**:
- `src/app.tsx` (modified).
- `test/app.test.tsx` (modified).

## Test strategy

TDD per `DIRECTIVE_034`. Order:
1. T023 first — `DedupButton` is the foundational change; T024 depends on its new prop shape.
2. T024 second — depends on T023 (DedupButton props) plus WP06 (`useDetectionStore`) plus WP07 (view components).
3. T025 last — depends on T024 plus WP05's adapters.

For T024, the test harness needs both `PlaylistsStoreProvider` and `DetectionStoreProvider`; build a helper in the test file (e.g. `renderRow(row, { detectionState })`).

For T025, the test environment does not have `Spicetify.*` globals. The adapter constructors must default-construct safely without those globals (they accept a `platform?` / `cosmos?` parameter — when undefined, they capture `globalThis.Spicetify?.Platform` etc. at *call time*, not at construction time). This preserves the test environment's ability to import `src/app.tsx` without crashing.

Coverage gate: 100% line + branch on all modified files. Where coverage previously included `dedup-click-log.ts`, the deletion removes the file from the coverage scope automatically.

## Definition of Done

- [ ] `DedupButton.tsx` dispatches `scanCollection`; `disabled` derives from `useDetectionStore`.
- [ ] `PlaylistRow.tsx` and `LikedSongsRow.tsx` render per-row state via the three view components.
- [ ] `app.tsx` wires `DetectionStoreProvider` into the tree above `RouteResetProvider`.
- [ ] `dedup-click-log.ts` and its test are deleted (if no remaining consumer).
- [ ] All UI test files green; 100% line + branch on modified components.
- [ ] `test/app.test.tsx` green; no `Spicetify.*` access at module load.
- [ ] `test/architecture.test.ts` reports no violations.
- [ ] `npm run build-local` builds successfully.

## Risks

| Risk | Mitigation |
|---|---|
| `Spicetify.*` access at adapter construction would crash `test/app.test.tsx` | Adapters defer host access to method-call time, not constructor; existing `SpicetifyPlaylistsLoader` already follows this convention. |
| Provider order mismatch (RouteResetProvider above DetectionStoreProvider) → context throws on mount | Test in `test/store/RouteResetContext.test.tsx` already requires both providers be present; reviewer eyeballs `app.tsx` provider order. |
| Existing playlist-row tests break because they don't mount `DetectionStoreProvider` | Test harness updates to mount both providers. Update helpers in test files; deduplicate via a shared `renderWithProviders` if it's not already extracted. |
| `dedup-click-log.ts` has remaining consumers (e.g. import from elsewhere) | Grep for `dedup-click-log` before deleting; if other consumers exist, leave the file alone and just unwire it from `DedupButton`. |
| Re-render storms: every `progress` event re-renders the whole row | Acceptable — React's reconciliation handles this; the view components are cheap. If performance becomes an issue, memoize at the row level. |

## Reviewer guidance

- Confirm `DedupButton` reads `disabled` from the store, not a prop.
- Confirm `LikedSongsRow` uses the literal sentinel `'liked-songs'` as the collection key (NOT `'spotify:collection:tracks'`).
- Confirm `PlaylistRow` uses `row.key` (the playlist URI) as the collection key.
- Confirm provider order in `app.tsx`: `Playlists → Detection → RouteReset → Page`.
- Confirm no Spicetify global access at module load (`test/app.test.tsx` is the gate).
- Confirm `dedup-click-log` deletion is complete (no orphan imports).
- Verify the row tests use `<DetectionStoreProvider>` in their mount harness.

## Implementation command

```bash
spec-kitty agent action implement WP08 --agent <name>
```

## Activity Log

- 2026-06-10T09:23:59Z – claude:claude-sonnet-4-6:implementer:implementer – shell_pid=19847 – Assigned agent via action command
- 2026-06-10T14:15:37Z – claude:claude-sonnet-4-6:implementer:implementer – shell_pid=19847 – Moved to planned
- 2026-06-10T14:16:19Z – claude:claude-sonnet-4-6:implementer:implementer – shell_pid=43451 – Started implementation via action command
- 2026-06-10T20:25:51Z – claude:claude-sonnet-4-6:implementer:implementer – shell_pid=43451 – Moved to planned
- 2026-06-10T20:40:03Z – claude:claude-sonnet-4-6:implementer:implementer – shell_pid=91614 – Started implementation via action command
