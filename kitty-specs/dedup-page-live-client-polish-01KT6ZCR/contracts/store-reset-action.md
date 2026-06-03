# Contract: Store `reset` action + narrowed `triggerLoad` precondition

**Mission**: `dedup-page-live-client-polish-01KT6ZCR`
**File (CHANGE, owned by WP-03 for `reset`; WP-05 for `triggerLoad` gate)**:
- `src/store/playlists-store.ts`
- `test/store/playlists-store.test.ts`

Supports: FR-007, FR-008, FR-009 (WP-03), FR-012, FR-013 (WP-05).

---

## 1. `reset` action (FR-007, FR-009)

### Signature

```ts
export type PlaylistsState = {
  loadState: LoadState<CollectionViewModel>;
  triggerLoad: () => Promise<void>;
  retry: () => Promise<void>;
  reset: () => void; // NEW
};
```

### Behavioral contract

| Property | Requirement |
|---|---|
| Totality | Defined for every value of `loadState.kind` (idle, loading, loaded, empty, failed). |
| Post-condition | `loadState === { kind: 'idle' }` after the call returns. |
| Loader isolation | Calling `reset()` MUST NOT invoke `loader.load()` directly or transitively. (FR-009) |
| Synchronicity | Returns `void`; no awaitable side effects. |
| Idempotence | Calling `reset()` from `idle` is a no-op (same state, no side effects). |
| Concurrency | Does not interact with an in-flight `triggerLoad` Promise; the in-flight `runLoad()` may still resolve and call `transition(idle, …)` which is then a no-op per the FSM. |

### Implementation sketch

```ts
return {
  loadState: { kind: 'idle' },
  // …triggerLoad / retry…
  reset() {
    set({ loadState: { kind: 'idle' } });
  },
};
```

### Tests (drive WP-03's TDD loop)

| # | Test | Asserts |
|---|------|---------|
| R-1 | `reset` from `idle` leaves state at `idle` and does not call loader | Totality + idempotence + FR-009 |
| R-2 | `reset` from `loading` (started by `triggerLoad`, not awaited) returns state to `idle` | Totality |
| R-3 | `reset` from `loaded` returns state to `idle` and does not re-call loader | FR-009 |
| R-4 | `reset` from `empty` returns state to `idle` | Totality |
| R-5 | `reset` from `failed` returns state to `idle` (does not call retry/loader) | Totality + FR-009 |
| R-6 | `reset` after `triggerLoad`'s in-flight `runLoad()` resolves leaves state at `idle` (the FSM ignores the late `transition` because the action is no longer matched from `idle`) | Concurrency |

R-6 is the trickiest; it ensures the "navigate away mid-load → return to idle" flow does not race a late `load-succeeded` action into reverting state. The test uses a controllable promise to delay the loader's resolution past the `reset()` call.

---

## 2. Narrowed `triggerLoad` precondition (FR-012)

### Before / After

See `data-model.md` §2 for code diff.

### Behavioral contract

| Property | Requirement |
|---|---|
| Gating | The action returns immediately if `loadState.kind !== 'idle'`. |
| State preservation | When the gate fires, `loadState` is unchanged (`===` equality, not deep equality). |
| Loader isolation | When the gate fires, `loader.load()` is NOT called. |
| From `idle` | Unchanged behavior: dispatches `trigger`, transitions to `loading`, runs the loader. |
| Symmetry | Mirrors the existing `retry` gate at lines 114–119 of the file. |

### Tests (drive WP-05's TDD loop — FR-013 requires one per non-idle state)

| # | Test | Source state | Asserts |
|---|------|------|---------|
| T-1 | `triggerLoad` from `loading` is a no-op | `loading` | State unchanged; `loader.callCount` unchanged |
| T-2 | `triggerLoad` from `loaded` is a no-op | `loaded` | State unchanged; `loader.callCount` unchanged |
| T-3 | `triggerLoad` from `empty` is a no-op | `empty` | State unchanged; `loader.callCount` unchanged |
| T-4 | `triggerLoad` from `failed` is a no-op | `failed` | State unchanged; `loader.callCount` unchanged |
| T-5 | `triggerLoad` from `idle` still triggers a load | `idle` | State → `loaded` (or `empty`/`failed`); `loader.callCount += 1` |

T-1 requires a controllable loader (the existing `FakePlaylistsLoader` doesn't easily expose "stay in loading"). WP-05's TDD step adds a small test-only loader variant with a controllable promise, mirroring the prior mission's retry test.

---

## 3. Cross-action invariants

- `reset` followed by `triggerLoad` from idle works normally (state → loading → loaded). Covered by an integration test in WP-03's surface.
- `triggerLoad` (in-flight) followed by `reset` followed by `triggerLoad` results in a single second load completing, no double-fetch race. Covered by R-6 + the symmetric WP-05 test.

---

## 4. Test file ownership

All tests in this contract live in `test/store/playlists-store.test.ts` (existing file, extended). Adding a new test file is not warranted — the file already groups action-level tests, and the existing `retry` no-op suite is the closest sibling.

---

## 5. Type-level invariants

The new `reset` action is purely additive to `PlaylistsState`. Existing consumers (`DedupPage`, `IdleView`, `FailedView`) do not require updates beyond the WP-03 wiring. The `usePlaylistsStore` hook's selector pattern accommodates the new action without type-system friction.
