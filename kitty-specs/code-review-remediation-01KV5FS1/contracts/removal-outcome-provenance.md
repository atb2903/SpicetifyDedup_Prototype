# Contract: typed removal-outcome provenance — NFR-004, FR-003, FR-009

Replaces the `stalled:` / `executor-failed:` **string-prefix** protocol between
the store and `RemovalOutcomeView` with a typed discriminator on the domain type.

## Type (domain — pure)

```ts
type RemovalOutcomeProvenance =
  | 'host' | 'stalled' | 'executor-failed' | 'compute-failed';

type RemovalOutcome = {
  removed: ReadonlyArray<TrackRef>;
  failed: ReadonlyArray<{ track: TrackRef; reason: string }>;
  provenance: RemovalOutcomeProvenance;
};
```

## Producer rules (store)

| Situation | `provenance` | `removed` | `failed` | Notes |
|---|---|---|---|---|
| Executor resolved (full or boundary-abort partial) | `'host'` | host-confirmed | host-reported | passed through unchanged |
| Stall watchdog tripped | `'stalled'` | executor's confirmed-so-far (**may be non-empty**) | remainder | FR-003: never forced to `[]` |
| Executor rejected (whole-operation fault) | `'executor-failed'` | `[]` | requested RemoveSet tracks (real refs) | never synthesised from collection URI |
| `computeRemoveSet` threw | `'compute-failed'` | `[]` | `[]` | FR-009: **no fabricated track**, count 0 |

## Consumer rules (`RemovalOutcomeView`)

- Branch on `outcome.provenance`. **No `startsWith` anywhere.**
- `'stalled'` **and** `removed.length === 0` → "Removal timed out — no tracks were
  removed. You can try again."
- `'stalled'` **and** `removed.length > 0` → truthful partial: "Removed N; M
  couldn't be removed and are still present. You can try again."
- `'compute-failed'` → "Couldn't compute the removal." — names **no** track and
  **no** count (FR-009).
- `'executor-failed'` / `'host'` partial → existing partial-count copy.

## Forbidden

- No layer derives provenance from a `reason` string.
- No outcome counts a collection URI / `'liked-songs'` sentinel as a "track".

## Tests

- View renders correct copy for each `provenance` × (`removed` empty / non-empty).
- A `'compute-failed'` outcome renders zero-track copy (regression for Finding F).
- A static scan asserts no `startsWith('stalled:'|'executor-failed:')` remains.
