---
work_package_id: WP06
title: Detection Store, Context, Route-Reset, Integration
dependencies:
- WP04
requirement_refs:
- FR-008
- FR-010
- FR-011
- FR-012
- FR-013
- NFR-005
- NFR-007
- NFR-009
- NFR-010
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts for this feature were generated on main. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into main unless the human explicitly redirects the landing branch.
base_branch: kitty/mission-duplicate-track-detection-01KTFH5H
base_commit: 3c497a11e757bfff3f1614a993ec92d14b4d462b
created_at: '2026-06-10T09:23:42.813698+00:00'
subtasks:
- T016
- T017
- T018
- T019
shell_pid: "43327"
agent: "claude:claude-sonnet-4-6:implementer:implementer"
history:
- timestamp: '2026-06-07T08:24:49Z'
  action: created
  actor: tasks-prompt-generator
authoritative_surface: src/store/
execution_mode: code_change
owned_files:
- src/store/detection-store.ts
- src/store/DetectionStoreContext.tsx
- src/store/RouteResetContext.tsx
- test/store/detection-store.test.ts
- test/store/DetectionStoreContext.test.tsx
- test/store/RouteResetContext.test.tsx
- test/integration/detection-end-to-end.test.ts
tags: []
---

# WP06 — Detection Store, Context, Route-Reset, Integration

## Objective

Wire the FSM + scanner port into a per-row Zustand store, hook route-reset to abort and clear on navigation, and prove the whole pipeline end-to-end with an integration test driven by the real store + composition adapter + fakes.

By the end of this WP:
1. `createDetectionStore(scanner)` owns per-row state + `AbortController`s; enforces atomic-replace on re-trigger; handles AbortError vs DetectionError correctly.
2. `DetectionStoreContext.tsx` exposes a `useDetectionStore` selector hook to UI components.
3. `RouteResetContext.tsx` resets BOTH the playlists store and the detection store on mount/unmount.
4. `test/integration/detection-end-to-end.test.ts` exercises a real-store + real-scanner + fake-ports stack to validate the contracts hold under composition.

## Context

The store is the only place that owns `AbortController` lifecycle. The FSM in `src/domain/detection-state.ts` (WP01) is a pure data transformation; the store wraps it with side-effect dispatch.

Read first:
- [`../data-model.md`](../data-model.md) §8 — store shape contract.
- [`../quickstart.md`](../quickstart.md) §§"How re-trigger works", "How route-reset works", "How parallel scans on different rows stay independent" — the prose narrative of the store's responsibilities.
- [`../research.md`](../research.md) §§R-002, R-003 — store separation and AbortSignal rationale.
- `src/store/playlists-store.ts` (existing) — the pattern this store mirrors (factory + bound hook + reset).
- `src/store/PlaylistsStoreContext.tsx` (existing) — the React context pattern.
- `src/store/RouteResetContext.tsx` (existing) — the file this WP extends.

Architectural constraints: `src/store/` may import from `src/domain/` + `src/ports/` only (NOT adapters). The integration test under `test/integration/` is unrestricted by `test/architecture.test.ts` (which scans `src/` only).

## Branch strategy

Planning base & merge target: **`main`**. Depends on WP04 (the composition adapter is used in the integration test). The store itself only needs the `DetectionScanner` port (from WP03) and the FSM (from WP01) — but WP04 is the gating dependency because the integration test cannot exist without `createDetectionScanner`.

## Subtasks

### T016 — Detection store (`src/store/detection-store.ts`)

**Purpose**: The vanilla Zustand store that owns per-row detection state and `AbortController` lifecycle.

**Public shape** (data-model §8):
```ts
export type DetectionRowState = DetectionState;

export type DetectionStoreState = {
  rows: Readonly<Record<string, DetectionRowState>>;
  scanCollection(collectionKey: string, request: ScanRequest): Promise<void>;
  cancelScan(collectionKey: string): void;
  reset(): void;
};

export function createDetectionStore(scanner: DetectionScanner): StoreApi<DetectionStoreState>;
export function bindDetectionHook(store: StoreApi<DetectionStoreState>): <T>(selector: (s: DetectionStoreState) => T) => T;
```

**Internal state** (held in closure, NOT in public state):
```ts
const controllers: Record<string, AbortController> = {};
```

**`scanCollection(key, request)` algorithm**:
1. Read current state; let `priorRow = rows[key]`.
2. If `controllers[key]` exists → call `controllers[key].abort()` (atomic-replace).
3. Allocate `const controller = new AbortController(); controllers[key] = controller;`
4. Dispatch `{ type: 'start' }` via `transition` — atomic with step 3 (use `set` once with the new state and update controllers map; the controller assignment can be a closure mutation since we don't need React to observe it).
5. `try { const result = await scanner.scan(request, controller.signal, ev => dispatchProgress(key, ev)); dispatchComplete(key, result); }`
6. `catch (e) { if (e instanceof DOMException && e.name === 'AbortError') { /* state already idle from cancel/reset */ return; } const reason = isDetectionError(e) ? e : new DetectionError('catalog-rejected', '…', { cause: e }); dispatchFail(key, reason); }`
7. `finally { if (controllers[key] === controller) delete controllers[key]; }`

Each dispatch helper calls `transition(rows[key] ?? { kind: 'idle' }, action)` and updates `rows[key]` immutably.

**`cancelScan(key)` algorithm**:
1. If `controllers[key]` exists → `controllers[key].abort(); delete controllers[key];`
2. Dispatch `{ type: 'cancel' }` (FSM transitions to `idle` if `scanning`, no-op otherwise).
3. No-op if no scan is in flight on that row.

**`reset()` algorithm**:
1. For each `key` in `controllers` → `controllers[key].abort()`.
2. Clear `controllers` (`Object.keys(controllers).forEach(k => delete controllers[k])`).
3. Set `rows: {}`.

**Test cases** (`test/store/detection-store.test.ts`):

Each test uses a stub `DetectionScanner` whose `scan` is a `vi.fn()` returning a controllable Promise (e.g. via `Promise.withResolvers()` or a manual `Promise` reference). This lets tests drive the scan to a specific moment, then assert.

| Case | Setup | Expected |
|---|---|---|
| Initial state | fresh store | `rows === {}` |
| `scanCollection` from idle | scanner resolves with a result | row transitions `idle → scanning(enumerating) → loaded(result)` |
| Progress events | scanner emits 3 events via `onProgress` | row's `scanning.progress` reflects the latest event |
| Re-trigger from `scanning` | first scan in flight, call `scanCollection` again | first controller aborted; second scan started; row is observed as `scanning` continuously (no `loaded` flash) |
| Re-trigger from `loaded` | row already `loaded`, call `scanCollection` again | atomic replace: row goes back to `scanning(enumerating)`; old result discarded |
| Re-trigger from `failed` | row `failed`, click button | atomic replace: row → `scanning(enumerating)` |
| Cancel from `scanning` | scan in flight, call `cancelScan` | controller aborted; row → `idle`; the scan's eventual AbortError is swallowed by the store's catch |
| Cancel from `idle` | no scan in flight | no-op (no abort, no state change) |
| Cancel from `loaded` | row `loaded`, call `cancelScan` | no controller to abort; FSM: `cancel` from `loaded` → `idle`; result discarded |
| `reset()` | 2 rows in `scanning`, 1 in `loaded` | all controllers aborted; `rows === {}` |
| Parallel rows | start scan on `'liked-songs'` then `'spotify:playlist:abc'`; second scan resolves while first still in flight | both rows independent; first row still `scanning`, second `loaded`; each gets its own `AbortController` |
| Parallel cancel | both rows scanning, `cancelScan('liked-songs')` | only `liked-songs` aborted; playlist row unaffected |
| AbortError catch | scanner throws `DOMException('aborted', 'AbortError')` | NO `fail` dispatch; row state determined by prior `cancel` (e.g. `idle`) |
| Non-DetectionError throw | scanner throws plain `Error('boom')` | wrapped as `DetectionError('catalog-rejected', …, { cause })`; row → `failed` |
| DetectionError pass-through | scanner throws `DetectionError('auth-token-expired')` | row → `failed` with same reason |
| Late callback after cancel | scanner resolves `complete` AFTER `cancelScan` | row stays in whatever state cancel set (`idle`); FSM ignores `complete` from `idle` |
| Double click within microtask | call `scanCollection` twice in `Promise.resolve()` chain | second call aborts first controller; race resolves cleanly (no orphan state) |

**Files**:
- `src/store/detection-store.ts` (new, ~200 lines).
- `test/store/detection-store.test.ts` (new, ~480 lines for the case matrix).

### T017 — Detection store context (`src/store/DetectionStoreContext.tsx`)

**Purpose**: React context bridge for the store, mirroring `PlaylistsStoreContext.tsx`.

**Signature**:
```ts
export function DetectionStoreProvider({ store, children }: {
  store: StoreApi<DetectionStoreState>;
  children: React.ReactNode;
}): React.ReactElement;

export function useDetectionStore<T>(selector: (state: DetectionStoreState) => T): T;
```

`useDetectionStore` throws if used outside a provider (fail-loud per the existing pattern).

**Tests** (`test/store/DetectionStoreContext.test.tsx`):
- Provider wraps children with the bound hook.
- `useDetectionStore` returns the selected slice.
- Selector receives the current state.
- Calling `useDetectionStore` outside a provider throws a descriptive `Error`.
- Two providers with different store instances stay independent.

**Files**:
- `src/store/DetectionStoreContext.tsx` (new, ~60 lines).
- `test/store/DetectionStoreContext.test.tsx` (new, ~120 lines).

### T018 — Extend `RouteResetContext.tsx`

**Purpose**: Add the detection-store reset to the existing route-reset bridge. After this change, `RouteResetProvider` resets BOTH stores on mount and unmount.

**Existing**: `RouteResetContext.tsx` calls `usePlaylistsStore((s) => s.reset)` inside a `useEffect`. Mount-time reset + cleanup unmount reset.

**Change**:
```tsx
export function RouteResetProvider({ children }) {
  const resetPlaylists = usePlaylistsStore((s) => s.reset);
  const resetDetection = useDetectionStore((s) => s.reset);
  useEffect(() => {
    resetPlaylists();
    resetDetection();
    return () => {
      resetPlaylists();
      resetDetection();
    };
  }, [resetPlaylists, resetDetection]);
  return <>{children}</>;
}
```

Both stores are reset in the same effect; order matters only insofar as the playlists store is reset first (preserves the existing observable behavior for existing tests).

**Tests** (`test/store/RouteResetContext.test.tsx`):
- Existing playlists-reset assertions remain green.
- New assertion: detection-store `reset` is called on mount.
- New assertion: detection-store `reset` is called on unmount.
- Throws if not wrapped in a `DetectionStoreProvider`.

**Files**:
- `src/store/RouteResetContext.tsx` (modified — adds detection import + reset wiring).
- `test/store/RouteResetContext.test.tsx` (modified or new — covers the detection-store branch).

### T019 — Integration test (`test/integration/detection-end-to-end.test.ts`)

**Purpose**: Black-box test of the whole pipeline. Uses the REAL `createDetectionStore` + REAL `createDetectionScanner` + FAKE enumerator + FAKE enricher (DIRECTIVE_036). Mounts a minimal React shell with the providers and dispatches via the public hook surface.

**Setup**:
```ts
const fakeEnumerator = new FakeTracksEnumerator({ tracks: fixtureTracks });
const fakeEnricher = new FakeCatalogEnricher({ catalog: fixtureCatalog });
const scanner = createDetectionScanner(fakeEnumerator, fakeEnricher, () => 1717_200_000_000);
const store = createDetectionStore(scanner);
```

**Test cases**:
- Happy path: `scanCollection('liked-songs', { kind: 'liked-songs' })` → state evolves `idle → scanning → loaded`; result matches fixture's expected duplicate groups.
- Empty collection: `tracks: []` → `loaded` with empty groups.
- Boundary: 2000 ms duration delta in fixture → 1 duplicate group.
- Re-trigger: call `scanCollection` twice in quick succession → second result lands; first scan's AbortError is silent.
- Cancel: `scanCollection` then `cancelScan` before resolution → row reverts to `idle`.
- Reset: `scanCollection` then `reset` → all controllers aborted, `rows: {}`.
- Parallel rows: two `scanCollection` calls on different keys → both produce independent results.
- Auth-expired propagation: `FakeCatalogEnricher` with `forceMode: 'auth-expired'` → row transitions `scanning → failed` with `reason.reason === 'auth-token-expired'`.

**Files**:
- `test/integration/detection-end-to-end.test.ts` (new, ~280 lines).

## Test strategy

TDD per `DIRECTIVE_034`. Recommended order:
1. T017 first (the smallest surface; depends only on the store factory signature).
2. T016 second (the store itself; build it test-first against the case matrix).
3. T018 third (RouteResetContext extension; the existing tests document the pattern).
4. T019 last (integration test — needs all of the above plus WP04's fakes/composition).

For T016, the controllable-Promise pattern (e.g. `let resolveScanner!: (r: DetectionResult) => void; scanner.scan = vi.fn(() => new Promise(r => { resolveScanner = r; }));`) is essential to drive scans to a specific moment.

For T018, the existing `test/store/RouteResetContext.test.tsx` (or wherever the existing reset test lives — locate it first) needs both stores' providers in its mount harness. Update test setup helpers accordingly.

Coverage gate: 100% line + branch on `detection-store.ts`, `DetectionStoreContext.tsx`, and the modifications in `RouteResetContext.tsx`. The integration test does not need its own coverage measurement (it's exercising other modules' code paths).

## Definition of Done

- [ ] `src/store/detection-store.ts`, `src/store/DetectionStoreContext.tsx` exist with JSDoc on every export.
- [ ] `src/store/RouteResetContext.tsx` resets both stores; existing playlists-reset tests stay green.
- [ ] `test/store/detection-store.test.ts` covers every case in the matrix.
- [ ] `test/integration/detection-end-to-end.test.ts` exercises the full pipeline via fakes.
- [ ] All `npm run test:run` cases green; 100% line + branch on the new store modules.
- [ ] `test/architecture.test.ts` reports no violations.
- [ ] No imports outside `src/{domain,ports}/` in any new file under `src/store/`.

## Risks

| Risk | Mitigation |
|---|---|
| AbortController leak: if `finally` block runs after a new scan replaces the entry, `delete controllers[key]` might delete the new controller | Guard `if (controllers[key] === controller) delete controllers[key];` — only delete if it's still ours. |
| Late `progress` callbacks after `cancel` | FSM ignores `progress` from `idle` (per data-model §5.3). Test case asserts. |
| Existing `RouteResetProvider` tests break because they don't wrap in `DetectionStoreProvider` | Test harness updated to wrap in both providers. Reviewer checks that helper. |
| Atomic-replace race: between `controllers[key].abort()` and `set(...)`, the prior scan's `await` could resolve | The prior scan's resolution dispatches `complete` from `scanning` (the prior state) — but the new `start` transitions are already pending. Order of operations: abort first, set new state, start new scan. Test case asserts the row is never observed `loaded` between two re-triggers. |
| `Object.freeze(rows)` would interfere with internal updates | Public state is `Readonly<Record<...>>` (type-level), not deeply frozen at runtime. Store update uses immutable object spread. |
| Parallel rows + `reset` mid-flight: ordering | `reset` aborts all controllers first, then clears the rows map. Each scan's catch sees AbortError and bails. Test case asserts no stray state remains. |

## Reviewer guidance

- Confirm the `if (controllers[key] === controller) delete controllers[key]` guard in the `finally` block.
- Confirm AbortError is distinguished from other thrown errors and does NOT dispatch `fail`.
- Confirm `cancelScan` from `loaded` state still clears the result (FSM `cancel` → `idle`).
- Confirm `reset` aborts ALL controllers, not just `scanning` rows.
- Confirm parallel-rows test exercises two distinct `AbortController` instances.
- Confirm the integration test exercises a real store + real composition adapter + fakes (not stubs of the store's internal helpers).
- Confirm the `RouteResetContext` modification preserves the existing playlists-reset behavior on mount AND unmount.

## Implementation command

```bash
spec-kitty agent action implement WP06 --agent <name>
```

(`finalize-tasks` resolves the lane base from the WP04 dependency.)

## Activity Log

- 2026-06-10T09:23:43Z – claude:claude-sonnet-4-6:implementer:implementer – shell_pid=19562 – Assigned agent via action command
- 2026-06-10T14:15:35Z – claude:claude-sonnet-4-6:implementer:implementer – shell_pid=19562 – Moved to planned
- 2026-06-10T14:16:17Z – claude:claude-sonnet-4-6:implementer:implementer – shell_pid=43327 – Started implementation via action command
