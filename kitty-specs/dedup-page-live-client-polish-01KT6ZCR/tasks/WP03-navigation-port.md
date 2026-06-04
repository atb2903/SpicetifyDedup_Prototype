---
work_package_id: WP03
title: Navigation Reset Port
dependencies:
- WP05
requirement_refs:
- FR-008
planning_base_branch: get_library
merge_target_branch: get_library
branch_strategy: Planning artifacts for this feature were generated on get_library. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into get_library unless the human explicitly redirects the landing branch.
subtasks:
- T014
- T015
- T016
- T017
- T018
- T019
- T020
- T021
agent: "claude:opus-4-7:implementer:implementer"
shell_pid: "293398"
history:
- timestamp: '2026-06-03T19:01:12Z'
  actor: tasks-generator
  note: Initial work package created from plan.md WP-03 (P3 navigation-aware reset).
authoritative_surface: src/ports/navigation
execution_mode: code_change
mission_slug: dedup-page-live-client-polish-01KT6ZCR
owned_files:
- src/ports/navigation.ts
- src/adapters/spicetify-navigation.ts
- src/store/NavigationContext.tsx
- src/app.tsx
- test/adapters/fake-navigation.ts
- test/adapters/spicetify-navigation.test.ts
- test/ports/navigation-port-contract.test.ts
- test/store/NavigationContext.test.tsx
- .claude/adr/0004-navigation-port.md
priority: P3-MEDIUM
tags: []
---

# WP-03 — Navigation Reset Port

**Closes**: spec §1 P3 (MEDIUM) — "Navigating away from the Dedup page mid-load and returning lands the user on the state they left."
**Requirements**: FR-008 (navigation-aware reset hook). Builds on WP-05's `reset()` action.
**Constitutional artifact**: introduces **ADR-0004** per DIRECTIVE_003.
**Acceptance test (independent)**: with the `NavigationProvider` wired and a `FakeNavigation` driving path changes, simulating navigate-away + navigate-back calls `store.reset()` if the store is not already in idle.

This WP introduces the navigation port + adapter + provider that keeps `Spicetify.Platform.History` access out of `src/ui/`. The `NavigationProvider` (in `src/store/`) subscribes to the port via `useEffect` and calls `store.reset()` when the user navigates back to the Dedup app from elsewhere.

**Critical dependency**: WP-05 must land first because `NavigationProvider` calls `s.reset` on the store. Without WP-05, the type errors and the test fails for the wrong reason.

---

## Branch Strategy

- **Planning base / merge target**: `get_library`.
- **This lane's workspace and branch**: assigned by `finalize-tasks` (see `lanes.json`).
- **Sequencing**: WP-03 depends on WP-05. Once WP-05 merges into `get_library`, WP-03 starts from the updated base.
- **Merge cadence**: lane merges back to `get_library` on done.

---

## Context — design summary (from contracts/navigation-port.md + research §3)

**Decision** (research §3): route-aware reset via a navigation port + adapter.

- `src/ports/navigation.ts` declares `NavigationPort.subscribe(listener: (path: string) => void): () => void` plus `currentPath(): string`.
- `src/adapters/spicetify-navigation.ts` wraps `Spicetify.Platform.History.listen` and `Spicetify.Platform.History.location.pathname`.
- `src/store/NavigationContext.tsx` exposes `NavigationProvider`, which subscribes in a `useEffect`, tracks whether the previous path was on the Dedup app, and calls `s.reset()` on navigate-back transitions.
- `src/app.tsx` wraps `<DedupPage>` in `<NavigationProvider navigation={new SpicetifyNavigation()}>`.

**Starting hypothesis** (research §3): Spicetify custom apps **stay mounted** across navigation, so mount-time `useEffect` cleanup is insufficient. T021's live probe confirms or revises this.

**Live probe (T021)**: paste research.md §3 snippet. If the probe surprises with unmount-on-navigation, the simpler `useEffect(() => () => store.reset(), [])` in `DedupPage` would also satisfy FR-008. The navigation port still ships (ADR-0004 captures the architectural reasoning), but the provider's reset trigger could fall back to mount-time. **The port + adapter scaffolding remains load-bearing regardless** because it keeps host access out of the UI layer.

**Architecture compliance** (research §3 + contracts/navigation-port.md §5):
- `src/store/` may import from `ports/` (already allowed by `test/architecture.test.ts`).
- `src/store/` must NOT import from `adapters/` (already forbidden).
- Adapter construction happens in `src/app.tsx` (existing exception point — see `SpicetifyPlaylistsLoader` precedent).
- No new architecture-test rules needed; the existing rules already cover the new files.

---

## Subtasks

### T014 — ADR-0004 (`.claude/adr/0004-navigation-port.md`)

**Purpose**: capture the architectural decision per DIRECTIVE_003.

**File**: `.claude/adr/0004-navigation-port.md` (NEW).

**Content outline**:
- **Title**: ADR-0004 — Navigation Port for In-Client Routing
- **Status**: Accepted
- **Context**: FR-008 needs in-client navigation awareness so the page resets to idle on return. `Spicetify.Platform.History` is the host API. ADR-0001 forbids `src/ui/` and `src/store/` from importing host adapters directly.
- **Decision**: introduce `NavigationPort` in `src/ports/`, `SpicetifyNavigation` in `src/adapters/`, and `NavigationProvider` in `src/store/`. Construction lives in `src/app.tsx`. Mirrors the existing `PlaylistsLoader` port + adapter pattern.
- **Consequences**: small extra port surface to maintain; future routing concerns flow through the same port; tests run against `FakeNavigation` without touching the host.
- **Alternatives considered**: mount-time reset only (rejected — relies on unmount happening); `document.visibilityState` listener (rejected — wrong signal); direct `Spicetify.Platform.History.listen` in `DedupPage` (rejected — violates ADR-0001).

**Validation**: file present at the documented path; reviewer can read and accept the decision in under 5 minutes.

---

### T015 — `src/ports/navigation.ts` — `NavigationPort` interface

**Purpose**: declare the port type per contract/navigation-port.md §1.

**File**: `src/ports/navigation.ts` (NEW).

**Content** (matches contract):
```ts
/**
 * Subscription-based navigation port.
 *
 * The host (Spicetify) exposes a history surface for in-client routing.
 * This port hides the host coupling so `src/store/` and `src/ui/`
 * remain testable as plain TypeScript / React (ADR-0001, ADR-0004).
 *
 * Implementations:
 *   - `SpicetifyNavigation` (production): wraps `Spicetify.Platform.History.listen`.
 *   - `FakeNavigation` (tests): in-memory event emitter.
 *
 * Both satisfy `navigation-port-contract.test.ts`.
 */
export interface NavigationPort {
  /** Subscribe to pathname changes. Returns an idempotent unsubscribe. */
  subscribe(listener: (path: string) => void): () => void;
  /** Read the current pathname synchronously. */
  currentPath(): string;
}
```

**Validation**: file imports nothing from `adapters/`, `store/`, or `ui/` (architecture test passes); typecheck clean.

---

### T016 — `test/adapters/fake-navigation.ts` — `FakeNavigation`

**Purpose**: provide the test-side `NavigationPort` implementation.

**File**: `test/adapters/fake-navigation.ts` (NEW).

**Content** (matches contract §3):
```ts
import type { NavigationPort } from '../../src/ports/navigation';

export class FakeNavigation implements NavigationPort {
  private listeners = new Set<(path: string) => void>();
  private path: string;
  constructor(initialPath: string = '/') { this.path = initialPath; }
  subscribe(listener: (path: string) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  currentPath(): string { return this.path; }
  /** Test helper — fires the event to every subscriber. */
  setPath(p: string): void {
    this.path = p;
    this.listeners.forEach((l) => l(p));
  }
}
```

**Validation**: typecheck clean.

---

### T017 — `test/ports/navigation-port-contract.test.ts` — parameterised contract test

**Purpose**: contract test for any `NavigationPort` implementation. Mirrors the existing `playlists-loader-contract.test.ts` pattern.

**File**: `test/ports/navigation-port-contract.test.ts` (NEW).

**Content sketch**: parametrize over `[{ name: 'FakeNavigation', factory: () => new FakeNavigation() }]`. For each implementation, assert C-1 through C-7 per contract §4:

- **C-1**: `subscribe(l1)` followed by `setPath('/x')` delivers `'/x'` to `l1`.
- **C-2**: the unsubscribe returned by `subscribe(l1)` stops further calls to `l1`.
- **C-3**: calling the unsubscribe a second time is a no-op (no throw).
- **C-4**: two distinct listeners both receive events; unsubscribing one does not affect the other.
- **C-5**: `currentPath()` returns the initial path before any `setPath` call.
- **C-6**: after `setPath('/y')`, `currentPath()` returns `'/y'`.
- **C-7**: `subscribe(l)` does NOT invoke `l` synchronously at subscription time (events fire only on *changes*).

C-7 matters for FR-008 — see contract §4 reasoning.

**Note on `SpicetifyNavigation`**: it does NOT join this parameterized suite (it has no `setPath` test helper). It gets a focused unit test in T018 that stubs `globalThis.Spicetify` and exercises the same shape.

**Validation**: all 7 assertions pass against `FakeNavigation`.

---

### T018 — `SpicetifyNavigation` adapter (TDD)

**Files**:
- `test/adapters/spicetify-navigation.test.ts` (NEW)
- `src/adapters/spicetify-navigation.ts` (NEW)

**Steps**:
1. Write failing tests in `spicetify-navigation.test.ts`:
   - `it('subscribes via Spicetify.Platform.History.listen and forwards pathname', …)` — stub `globalThis.Spicetify = { Platform: { History: { listen: vi.fn(...), location: { pathname: '/' } } } }`; assert calling `subscribe(l)` registers a listener that receives `loc.pathname` strings.
   - `it('returns the unsubscribe value from History.listen', …)`.
   - `it('currentPath() returns Spicetify.Platform.History.location.pathname', …)`.
   - `it('throws host-unavailable when Spicetify.Platform.History is missing', …)` — assert throws a recognizable error (per contract §2, choose `PlaylistsLoaderError('host-unavailable', …)` to keep the catalog unified OR introduce `NavigationPortError`; the WP picks the lower-churn path with a DoD note).
2. Run — must fail (file does not exist).
3. Implement `SpicetifyNavigation` in `src/adapters/spicetify-navigation.ts`. Mirror `SpicetifyPlaylistsLoader.requirePlatform`'s availability check.
4. Re-run — green.

**Architecture compliance**: `src/adapters/` may not import from `store/` or `ui/`. The new file imports only its port + a typed error from `src/domain/`.

**Decision note for DoD**: if a new `NavigationPortError` class lands, log that in the WP's commit message so future reviewers don't think the unified-class approach was followed.

---

### T019 — `NavigationProvider` (TDD)

**Files**:
- `test/store/NavigationContext.test.tsx` (NEW)
- `src/store/NavigationContext.tsx` (NEW)

**Steps**:
1. Write failing tests in `NavigationContext.test.tsx`:
   - `it('FR-008 — navigate-away + navigate-back calls store.reset()', …)`. Render `<NavigationProvider navigation={fakeNav}>` wrapped around a store seeded to `{ kind: 'loading' }` (or `loaded`). Call `fakeNav.setPath('/home')` then `fakeNav.setPath('/spicetify-dedup')`. Assert `s.reset` was called (use `vi.spyOn(store, 'reset')` or check `store.getState().loadState.kind === 'idle'`).
   - `it('FR-008 — navigate-away while idle + navigate-back stays idle (idempotent)', …)`. Same flow but starting from idle; assert no spurious state churn.
   - `it('FR-008 — navigate within the dedup app (sub-paths) does NOT reset', …)`. From `/spicetify-dedup` → `/spicetify-dedup/foo` should NOT trigger reset. Use the `startsWith(DEDUP_PATH_PREFIX)` check from contract §6.
   - `it('FR-008 — unmount cleans up subscription', …)`. Render + unmount; assert the fake has zero listeners afterward.
2. Run — must fail.
3. Implement `NavigationProvider` per contracts/navigation-port.md §6 sketch. Use `usePlaylistsStore((s) => s.reset)` to bind the action; `useEffect` subscribes and returns the unsubscribe as cleanup.
4. Re-run — green.

**Architecture compliance**: `src/store/` may import from `ports/`. The provider imports `NavigationPort` (type only) and `usePlaylistsStore` (existing). No import from `adapters/`.

**DEDUP_PATH_PREFIX**: derive from the existing `src/settings.json` route prefix (currently `/spicetify-dedup` per the scaffold) — read it at module-eval time to keep the prefix synchronized with the route registration.

---

### T020 — Wire `src/app.tsx`

**File**: `src/app.tsx` (existing — minor edit).

**Steps**:
1. Import `SpicetifyNavigation` from `./adapters/spicetify-navigation`.
2. Import `NavigationProvider` from `./store/NavigationContext`.
3. Construct `const productionNavigation = new SpicetifyNavigation();` next to `productionStore`.
4. Wrap `<DedupPage />` in `<NavigationProvider navigation={productionNavigation}> … </NavigationProvider>` inside the existing `<PlaylistsStoreProvider>`.
5. Update `app.tsx`'s JSDoc to note the navigation wiring (NFR-008).

**Validation**:
- `npm run typecheck` exits 0.
- `npm run build` exits 0.
- Existing `test/app.test.tsx` tests still pass (the wrap is transparent to non-navigation interactions).

---

### T021 — Live probe: confirm `History.listen` fires across navigate-away/back

**Purpose**: confirm the starting hypothesis (Spicetify stays-mounted across navigation) or revise it.

**Steps**:
1. Open Spotify with the latest build installed.
2. Open DevTools.
3. Paste the snippet from `research.md` §3 (live-probe checkpoint).
4. Navigate Dedup → Home → Dedup. Observe whether `[history]` log fires.
5. Add a temporary `console.log('[DedupPage] mounted', Date.now())` inside a one-off `useEffect(() => { console.log(...); }, [])` in `DedupPage.tsx` (revert before commit). Repeat the navigation. Observe whether the message appears once per session (stay-mounted) or per navigation (unmount-and-remount).
6. Capture the result into the WP's working notes.

**Outcome interpretation**:
- **Stay-mounted (expected)**: the navigation port + provider is the right mechanism; no further change required.
- **Unmount-and-remount (surprise)**: the simpler `useEffect(() => () => store.reset(), [])` in `DedupPage` would also satisfy FR-008. The port + adapter still ship (ADR-0004 stays), but T019's provider can be simplified to no-op on path changes and rely on cleanup instead. Update the WP DoD note and re-run the test suite to confirm both code paths still pass.

**Validation**: notes capture the observed behavior; no temporary instrumentation remains in the committed code.

---

## Definition of Done

This WP is done when **all** of the following hold:

1. ADR-0004 committed (T014).
2. T015..T020 lands; T021 probe captured in WP notes.
3. `npm run test:run` exits 0 with the new tests included.
4. `npm run typecheck` exits 0.
5. `npm run test:coverage` reports `lines: 100%` and `branches: 100%`.
6. Architecture test green — no new `ui` → `ports`/`adapters` imports; `store` → `adapters` still forbidden; `store` → `ports` still allowed.
7. JSDoc on every new export (NFR-008): `NavigationPort`, `SpicetifyNavigation`, `FakeNavigation`, `NavigationProvider`.
8. Per NFR-001: failing-test commits precede fix commits within this WP.
9. `npm run build` exits 0 (the production bundle includes the navigation adapter).

The implementing agent runs the spec-kitty handoff commands so the lane state advances and review begins.

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| T021 reveals `History.listen` does NOT fire on navigate-back | Fall back to mount-time cleanup. The port + adapter still ship (ADR-0004 captures the reasoning); the provider's reset logic simplifies. Update WP DoD note. |
| Path prefix `/spicetify-dedup` is wrong | Derive from `src/settings.json` at module load. If the scaffold uses a different route, the imported value is authoritative. |
| `NavigationContext.tsx` accidentally re-renders too often | The provider's `useEffect` deps are `[navigation, reset]`; both are stable references. Re-render storms are unlikely but if observed in the live probe, switch to a `useRef` for the previous-path latch. |
| Subscription leak under React StrictMode double-mount | The cleanup returned by `useEffect` is the unsubscribe; double-mount in StrictMode invokes cleanup correctly. Validate by enabling StrictMode in a test render. |
| `globalThis.Spicetify` shape changes across Spicetify versions | T018's host-unavailable test gates on this; if a future version moves `Platform.History`, the adapter throws a typed error and the React error boundary catches it. The mission accepts this fragility per ADR-0002 (production target is the current Spicetify release). |

---

## Reviewer Guidance

A reviewer should check:

1. **ADR-0004 present** at `.claude/adr/0004-navigation-port.md` with the four ADR sections (Context, Decision, Consequences, Alternatives).
2. **NFR-001**: failing-test commits precede fix commits per subtask.
3. **Architecture test green**: no rules added to `RULES`; existing rules cover the new files.
4. **No host access in `src/store/`**: grep `src/store/NavigationContext.tsx` for `Spicetify` — must be zero hits (only the adapter touches the host).
5. **Contract test C-1..C-7 pass** against `FakeNavigation`.
6. **`SpicetifyNavigation` adapter** has a host-availability check and throws a typed error on missing host.
7. **JSDoc** on every new export reflects FR-008 / FR-009 (NFR-008).
8. **`app.tsx` wiring**: `<NavigationProvider>` wraps `<DedupPage>` inside the existing `<PlaylistsStoreProvider>`.
9. **No temporary instrumentation** from T021 left in committed code.
10. **Coverage**: 100/100 (NFR-002).

---

## Out of Scope (do NOT do in this WP)

- The store `reset()` action itself — owned by WP-05.
- The `triggerLoad` idle-gate — owned by WP-05.
- Styling the page (covered by WP-01 / WP-02).
- Adapter changes for `playlist-v2` (covered by WP-04).
- Adding `Spicetify.URI.fromString` usage (rejected by spec §7).
- Polling navigation (rejected by research §3 alternatives).
- Architecture test rule additions (research + contract confirmed not needed).

## Activity Log

- 2026-06-04T09:17:02Z – claude:opus-4-7:implementer:implementer – shell_pid=293398 – Started implementation via action command
- 2026-06-04T09:27:43Z – claude:opus-4-7:implementer:implementer – shell_pid=293398 – Ready for review: navigation port + adapter + provider land FR-008/FR-009. All 421 tests pass with 100% line/branch coverage; production build succeeds; ADR-0004 captured.
