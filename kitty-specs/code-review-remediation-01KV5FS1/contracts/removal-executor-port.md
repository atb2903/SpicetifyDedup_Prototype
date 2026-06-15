# Contract: `RemovalExecutor.remove` (amended) — FR-003

Amends the canonical port contract for the boundary-abort case only. All other
post-conditions are unchanged.

## Signature (unchanged)

```ts
remove(
  target: RemovalTarget,
  tracks: ReadonlyArray<TrackRef>,
  signal: AbortSignal,
  onProgress?: (event: RemovalProgressEvent) => void,
): Promise<RemovalOutcome>;
```

## Behavioural delta

| Condition | Before | After (this pass) |
|---|---|---|
| `signal` aborted at a batch boundary | throws `DOMException('AbortError')`; accumulated `removed`/`failed` discarded | **resolves** with the accumulated `{ removed, failed, provenance: 'host' }` gathered so far |
| `host-unavailable` (API/method absent) | throws `RemovalError('host-unavailable')` before any mutation | unchanged |
| whole-operation fault mid-flight (e.g. `prepareBatch` malformed-batch throw) | rejects | unchanged (rejects) |
| per-track / per-batch failure | recorded in `failed` | unchanged |

## Post-conditions

- **Resolved outcome carries `provenance: 'host'`.** This is the executor's
  host-truth — full completion or a boundary-abort partial.
- **Total accounting (full run):** `removed.length + failed.length === tracks.length`.
- **Total accounting (boundary-abort partial):** `removed.length + failed.length
  <= tracks.length`; every accounted track appears in exactly one partition; no
  un-attempted track is invented into `failed`.
- **Disjointness, single-collection scope (C-003), per-batch `onProgress`** — unchanged.

## Why

The store's stall watchdog (FR-002) aborts on a no-progress batch; for FR-003 the
store must report the tracks **actually** removed. Only the executor knows which
`TrackRef`s were confirmed (per-track fallback breaks count-based reconstruction),
so the executor returns its partial rather than throwing it away. Provenance
(stall vs user-cancel) is decided by the store, not the executor.

## Both implementations

`SpicetifyRemovalExecutor` and `FakeRemovalExecutor` adopt the same boundary-abort
semantics. The fake's scripted hang/abort modes are repurposed to drive the
watchdog + partial-return tests.
