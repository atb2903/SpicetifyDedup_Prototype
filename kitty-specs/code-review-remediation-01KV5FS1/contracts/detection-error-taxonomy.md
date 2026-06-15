# Contract: detection error taxonomy — FR-004, FR-005, FR-008, NFR-002

## Reachable reason set (after)

```ts
type DetectionErrorReason =
  | 'auth-token-expired'
  | 'enumerator-failed'
  | 'host-unavailable'   // NEW — NFR-002
  | 'internal-error'     // NEW — FR-004
  | 'aborted';           // type-only defensive fallback
```

Removed (no live producer — ADR-0011): `rate-limit-unparseable`,
`network-failure`, `malformed-enrichment-payload`, `catalog-rejected`.

## Producer map (invariant)

| Reason | Sole live producer(s) |
|---|---|
| `auth-token-expired` | enumerator `fetchPage` catch via `looksLikeHostAuthExpired` |
| `enumerator-failed` | enumerator precheck / page-shape / item-shape validation / non-auth host reject |
| `host-unavailable` | enumerator `requirePlatform` (host/API/method absent), before any host call |
| `internal-error` | `detection-store.scanCollection` wrapping a non-`DetectionError` throw |
| `aborted` | *(none — store swallows `AbortError` → `idle`; UI fallback only)* |

## UI message map (`DetectionFailedView`, exhaustive via `never`)

| Reason | Copy intent |
|---|---|
| `auth-token-expired` | sign back in and retry (FR-006/FR-007 guidance) |
| `enumerator-failed` | couldn't read the collection contents; retry |
| `host-unavailable` | Spotify client not ready (matches removal/playlists wording — SC-007) |
| `internal-error` | honest internal-error; **no** catalog/Spotify-rejection wording (FR-004) |
| `aborted` | "Scan cancelled." (defensive) |

## FR-008 — status suffix

No reason renders a `(status N)` suffix unless a status value is actually present
on the error. With `catalog-rejected` removed, the phantom-suffix path is deleted.
If any future message keeps a status suffix it MUST gate on a present value.

## Tests

- Static/grep: zero non-test producers of any removed reason.
- `never` exhaustiveness compiles with exactly the after-set.
- `internal-error` copy contains no "catalog"/"Spotify rejected" substring.
- `host-unavailable` reached through the scan path renders the dedicated copy
  (SC-007 parity with removal + playlists).
