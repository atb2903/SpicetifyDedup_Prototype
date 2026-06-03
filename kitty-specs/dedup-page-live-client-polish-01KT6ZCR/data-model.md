# Phase 1 Data Model — Dedup Page Live-Client Polish

**Mission**: `dedup-page-live-client-polish-01KT6ZCR`
**Date**: 2026-06-03

This mission introduces **no new domain entities**. It adds: one new store action, one narrowed store-action precondition, one expanded adapter URI-type acceptance, and one new port (navigation). All other domain types from `kitty-specs/load-dedupable-playlists-01KT3XW3/data-model.md` carry forward unchanged.

The prior mission's data-model file remains the authoritative reference for `CollectionKind`, `OwnerIdentity`, `RawCollection`, `LikedSongsSummary`, `CollectionViewModel`, `LoadState`, `LoadAction`, `transition`, and `PlaylistsLoaderError`. This file documents only the deltas.

---

## 1. Store `reset` action (NEW — FR-007, FR-009)

Added to `PlaylistsState` in `src/store/playlists-store.ts`.

```ts
export type PlaylistsState = {
  loadState: LoadState<CollectionViewModel>;
  triggerLoad: () => Promise<void>;
  retry: () => Promise<void>;
  reset: () => void; // NEW (FR-007)
};
```

### Semantics

- Sets `loadState` to `{ kind: 'idle' }` from **any** prior state. No state input is rejected — `reset` is total over the FSM.
- **MUST NOT** call `loader.load()` directly or transitively (FR-009). Asserted by a unit test that constructs the store with a loader whose `load` is a `vi.fn`, calls `reset`, and expects `callCount === 0`.
- **Idempotent**: calling `reset()` from `idle` yields `idle` and is a no-op observable side effect.
- **Synchronous**: returns `void`, not `Promise<void>` — there is nothing to await.

### Action shape rationale

`reset` is not a FSM action that flows through `transition`. The FSM's existing actions (`trigger`, `load-succeeded`, `load-completed-empty`, `load-failed`, `retry`) all describe outcomes the *runtime* observes; `reset` is a lifecycle-driven *override* originating from a navigation event, not a state-machine transition. Modeling it as a `transition` cell would require adding a `reset` action with cells for all five source states, all yielding `idle` — a weak fit. Treating it as a direct `set({ loadState: { kind: 'idle' } })` is the simpler, honest implementation.

This is consistent with the existing pattern: `triggerLoad` and `retry` use `transition` because they are user-driven moves through the FSM; `reset` is system-driven and bypasses the FSM by design.

---

## 2. Narrowed `triggerLoad` precondition (CHANGE — FR-012)

Existing in `src/store/playlists-store.ts`. The action's precondition is narrowed to `kind === 'idle'`.

### Before

```ts
async triggerLoad() {
  set({ loadState: transition(get().loadState, { type: 'trigger' }) });
  await runLoad();
},
```

### After

```ts
async triggerLoad() {
  const before = get().loadState;
  if (before.kind !== 'idle') return; // FR-012: no-op from non-idle states
  set({ loadState: transition(before, { type: 'trigger' }) });
  await runLoad();
},
```

### Semantics

- **From `idle`**: dispatches `trigger`, transitions FSM to `loading`, runs the loader. Unchanged externally observable behavior.
- **From `loading` / `loaded` / `empty` / `failed`**: returns immediately. FSM state is unchanged; `loader.load()` is **not** called. (FR-013 mandates one test per non-`idle` source state.)
- The FSM's `transition` function continues to ignore `trigger` from non-idle (current behavior). The store-level gate is defense-in-depth — if `transition` is ever loosened, the store still upholds FR-012.

---

## 3. Adapter URI-type acceptance (CHANGE — FR-010)

Existing in `src/adapters/spicetify-playlists-loader.ts`, line 141, inside `walkItems`.

### Accepted URI types (rootlist node `type` field)

| Value | Accepted by adapter? | Lands as |
|---|---|---|
| `'playlist'` | ✅ Yes | `RawCollection` |
| `'playlist-v2'` | ✅ Yes (NEW — FR-010) | `RawCollection` |
| `'folder'` | ✅ Recursed (existing behavior unchanged) | walks `node.items` |
| Anything else (`'show'`, `'episode'`, separators, future kinds) | ❌ Silently skipped (existing behavior unchanged) | — |

### Code change

```ts
// In walkItems (existing structure preserved)
if (type === 'playlist' || type === 'playlist-v2') {
  out.push(this.toRawCollection(node));
  continue;
}
```

### Fixture extension (FR-011)

Either extend `test/adapters/fixtures/rootlist-response.sample.json` with one `playlist-v2` node, OR add a `rootlist-response.with-v2.sample.json` sibling, depending on whether the existing fixture is used to assert "exact contents" elsewhere. WP-04 chooses the lower-churn path.

Required `playlist-v2` fixture node shape (carries the same fields as `'playlist'` per spec assumption §6.4):

```json
{
  "type": "playlist-v2",
  "uri": "spotify:playlist:v2-fixture-1",
  "name": "Future-rollout Playlist",
  "owner": { "displayName": "me" },
  "isOwnedBySelf": true,
  "canAdd": true,
  "canRemove": true,
  "totalLength": 7,
  "images": [{ "url": "https://example.com/cover.png" }],
  "collaborators": { "count": 0 }
}
```

If WP-04's live probe (`research.md` §5) reveals the fixture node's shape diverges from `'playlist'` (e.g. different field names), the plan surfaces the divergence and adjusts the fixture / `toRawCollection` per spec §6.4.

---

## 4. `NavigationPort` (NEW — supports FR-008)

New port at `src/ports/navigation.ts`. Adapter at `src/adapters/spicetify-navigation.ts`. Contract test at `test/ports/navigation-port-contract.test.ts`. ADR-0004 explains the decision.

### Port type

```ts
// src/ports/navigation.ts
/**
 * Subscription-based navigation port.
 *
 * The store layer subscribes when the React tree mounts and unsubscribes
 * on teardown. The adapter routes the subscription to the host's
 * navigation surface (Spicetify.Platform.History in production; an
 * in-memory event emitter in tests).
 */
export interface NavigationPort {
  /**
   * Subscribe to path changes. The listener is called with the new
   * pathname every time the host emits a navigation event. Returns an
   * idempotent unsubscribe function.
   */
  subscribe(listener: (path: string) => void): () => void;

  /**
   * The current pathname, read once at subscription time. Used by the
   * store to determine whether the initial mount is "already on the
   * dedup app" vs "navigated in from elsewhere".
   */
  currentPath(): string;
}
```

### Production adapter shape

```ts
// src/adapters/spicetify-navigation.ts
export class SpicetifyNavigation implements NavigationPort {
  subscribe(listener: (path: string) => void): () => void {
    const history = this.requireHistory();
    return history.listen((loc: { pathname: string }) => listener(loc.pathname));
  }
  currentPath(): string {
    return this.requireHistory().location.pathname;
  }
  private requireHistory(): {
    listen: (cb: (l: { pathname: string }) => void) => () => void;
    location: { pathname: string };
  } {
    // …host-availability check mirroring SpicetifyPlaylistsLoader.requirePlatform…
  }
}
```

### Fake adapter for tests

```ts
// test/adapters/fake-navigation.ts
export class FakeNavigation implements NavigationPort {
  private listeners = new Set<(path: string) => void>();
  private path = '/';
  setPath(p: string) { this.path = p; this.listeners.forEach(l => l(p)); }
  subscribe(listener: (path: string) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  currentPath() { return this.path; }
}
```

### Wiring (high-level — exact ownership at the file level is a tasks-phase concern)

- `src/app.tsx` constructs `productionNavigation = new SpicetifyNavigation()` alongside `productionStore`.
- A new `NavigationProvider` (or extending `PlaylistsStoreProvider`) accepts a `NavigationPort` prop, subscribes to it via `useEffect`, and calls `store.reset()` when the pathname leaves and returns to the dedup app's route (if the current state is not already `idle`).
- The architecture test's rules table grows: `src/store/` cannot import from `src/adapters/`, `src/ui/` cannot import from `src/ports/` (unchanged). Construction in `src/app.tsx` is the existing exception — confirmed allowed since `app.tsx` already constructs `SpicetifyPlaylistsLoader`.

### Contract assertions (test surface)

The contract test asserts, for any adapter:

1. `subscribe(l)` returns a callable that, when invoked, stops further calls to `l`.
2. Calling `subscribe` twice with two distinct listeners delivers events to both.
3. Calling the returned unsubscribe twice is a no-op (idempotent).
4. `currentPath()` returns a string; never null/undefined.

---

## 5. FSM transition table — no changes

The `LoadState` / `LoadAction` types and the `transition` function are unchanged. Reproduced here for cross-reference convenience; see `kitty-specs/load-dedupable-playlists-01KT3XW3/data-model.md` §6 for the authoritative table.

The five user-visible states (`idle`, `loading`, `loaded`, `empty`, `failed`) and five actions (`trigger`, `load-succeeded`, `load-completed-empty`, `load-failed`, `retry`) carry forward. The narrowed `triggerLoad` precondition (§2 above) sits **outside** the FSM — `transition` continues to permissively ignore `trigger` from non-idle.

---

## 6. Boundary tests (per charter)

The charter mandates min−1 / min / nominal / max / max+1 testing for every numeric bound. This mission introduces no new numeric bounds; existing bounds carry forward:

- `items.length` distinguishing `loaded` from `empty` — already covered by prior-mission tests.
- `trackCount` ≥ 0 in `RawCollection` / `LikedSongsSummary` — already covered by adapter tests.
- `NavigationPort` `subscribe` listener count: this mission adds a "two distinct listeners" test (§4 contract assertion #2) but otherwise has no numeric bound.

The FR-007 reset action introduces no numeric bound — it is a state-machine override over a discriminated union, not a count or threshold.

---

## 7. Module boundary contract (where validation lives) — unchanged

Per ADR-0001 and the prior mission's data-model §9:

- **Adapter** owns all host shape validation. The FR-010 change is a single branch widening that does not alter the validation surface structurally.
- **Domain** trusts its inputs.
- **Store** does not validate; FR-007's `reset` is an unconditional state override.
- **UI** never sees raw host shapes.

The `NavigationPort` adapter validates the host's history surface availability (`SpicetifyNavigation.requireHistory` throws on missing) — mirroring `SpicetifyPlaylistsLoader.requirePlatform`'s pattern. No new domain error type is introduced; navigation failures surface as fail-loud throws caught by the React error boundary.
