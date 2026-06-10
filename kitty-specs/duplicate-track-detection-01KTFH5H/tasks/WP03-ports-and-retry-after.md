---
work_package_id: WP03
title: Ports & Retry-After Parser
dependencies:
- WP01
requirement_refs:
- FR-002
- FR-008
- FR-010
- NFR-004
- NFR-007
- NFR-008
- NFR-009
- NFR-010
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts for this feature were generated on main. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into main unless the human explicitly redirects the landing branch.
base_branch: kitty/mission-duplicate-track-detection-01KTFH5H
base_commit: 3c497a11e757bfff3f1614a993ec92d14b4d462b
created_at: '2026-06-10T09:23:20.649443+00:00'
subtasks:
- T007
- T008
- T009
- T010
shell_pid: "19178"
agent: "claude:claude-sonnet-4-6:implementer:implementer"
history:
- timestamp: '2026-06-07T08:24:49Z'
  action: created
  actor: tasks-prompt-generator
authoritative_surface: src/ports/
execution_mode: code_change
owned_files:
- src/ports/tracks-enumerator.ts
- src/ports/catalog-enricher.ts
- src/ports/detection-scanner.ts
- src/adapters/retry-after.ts
- test/adapters/retry-after.test.ts
tags: []
---

# WP03 — Ports & Retry-After Parser

## Objective

Define the three port interfaces every adapter implements, and ship the standalone `parseRetryAfter` parser + classifier with full boundary coverage.

1. `TracksEnumerator` — the seam between host-bound enumeration and the rest of the pipeline.
2. `CatalogEnricher` — the seam between catalog HTTP calls and the algorithm.
3. `DetectionScanner` — the orchestrating port the store consumes.
4. `parseRetryAfter` + `isRetryAfterParseError` — small parser, three input forms (integer / fractional / HTTP-date), fail-loud with paired classifier.

By the end of this WP, WP04 (fakes + composition adapter) and WP05 (Spicetify adapters) can begin in parallel.

## Context

The three port files are small (type declarations + JSDoc — no runtime logic). The retry-after parser is where the real boundary-testing happens.

Read first:
- [`../contracts/tracks-enumerator-port.md`](../contracts/tracks-enumerator-port.md) — the verbatim port shape.
- [`../contracts/catalog-enricher-port.md`](../contracts/catalog-enricher-port.md) — port shape including `EnrichmentSlot`.
- [`../contracts/detection-scanner-port.md`](../contracts/detection-scanner-port.md) — port shape and the composition contract.
- [`../research.md`](../research.md) §R-009 — Retry-After supported forms and rationale.
- `src/ports/playlists-loader.ts` (existing) — the pattern these mirror.

Architectural constraints (from ADR-0001 / `test/architecture.test.ts`):
- `src/ports/` may import from `src/domain/` only.
- `src/adapters/` may import from `src/domain/` + `src/ports/` (and `src/adapters/` siblings — for cross-adapter reuse like `retry-after.ts`).

## Branch strategy

Planning base & merge target: **`main`**. Depends on WP01 (uses `RawTrack`, `ScanRequest`, `EnrichedTrack`, `ProgressEvent`, `DetectionError`, `DetectionResult`). `finalize-tasks` computes the lane and worktree.

## Subtasks

### T007 — Tracks enumerator port (`src/ports/tracks-enumerator.ts`)

**Purpose**: One file declaring the `TracksEnumerator` interface verbatim from the contract.

**What to declare** (from `contracts/tracks-enumerator-port.md`):
```ts
import type { RawTrack, ScanRequest, ProgressEvent } from '../domain/detection-types';

export interface TracksEnumerator {
  enumerate(
    request: ScanRequest,
    signal: AbortSignal,
    onProgress: (event: ProgressEvent) => void,
  ): Promise<ReadonlyArray<RawTrack>>;
}
```

**JSDoc requirements**:
- Method-level JSDoc covers `@param` for each argument, `@returns`, and `@throws` enumerating every error reason the contract permits.
- File-level JSDoc names the layer (`src/ports/`) and points to the contract markdown for the full semantic surface.

**Files**:
- `src/ports/tracks-enumerator.ts` (new, ~40 lines including JSDoc).

### T008 — Catalog enricher port (`src/ports/catalog-enricher.ts`)

**Purpose**: Declares `CatalogEnricher` plus the port-local `EnrichmentSlot` discriminated union.

**What to declare** (from `contracts/catalog-enricher-port.md`):
```ts
import type { EnrichedTrack, ProgressEvent, RawTrack } from '../domain/detection-types';

export type EnrichmentSlot =
  | { kind: 'enriched'; track: EnrichedTrack }
  | { kind: 'unenriched'; position: number; rawUri: string };

export interface CatalogEnricher {
  enrich(
    tracks: ReadonlyArray<RawTrack>,
    signal: AbortSignal,
    onProgress: (event: ProgressEvent) => void,
  ): Promise<ReadonlyArray<EnrichmentSlot>>;
}
```

**JSDoc requirements**:
- Method JSDoc covers the empty-input invariant (`tracks.length === 0` → `[]`, no host call).
- `@throws` enumerates the error reasons relevant to the catalog (auth-token-expired, rate-limit-unparseable, network-failure, malformed-enrichment-payload, catalog-rejected).

**Files**:
- `src/ports/catalog-enricher.ts` (new, ~50 lines including JSDoc).

### T009 — Detection scanner port (`src/ports/detection-scanner.ts`)

**Purpose**: Declares `DetectionScanner`, the port the store consumes.

**What to declare** (from `contracts/detection-scanner-port.md`):
```ts
import type {
  DetectionResult,
  ProgressEvent,
  ScanRequest,
} from '../domain/detection-types';

export interface DetectionScanner {
  scan(
    request: ScanRequest,
    signal: AbortSignal,
    onProgress: (event: ProgressEvent) => void,
  ): Promise<DetectionResult>;
}
```

**JSDoc requirements**:
- Method JSDoc covers pass-through error behavior (re-throws what the underlying ports throw; adds only `AbortError` semantics).
- File JSDoc points to the contract markdown for the 9-step composition shape.

**Files**:
- `src/ports/detection-scanner.ts` (new, ~40 lines).

### T010 — Retry-After parser (`src/adapters/retry-after.ts`)

**Purpose**: A standalone parser + classifier (charter Input Validation pattern). Used by `SpicetifyCatalogEnricher` (WP05).

**What to declare**:
```ts
export class RetryAfterParseError extends Error {
  readonly headerValue: string | undefined;
  constructor(headerValue: string | undefined, message: string);
}

export function isRetryAfterParseError(x: unknown): x is RetryAfterParseError;

/**
 * Parse a `Retry-After` HTTP header into a millisecond delay.
 * Accepts integer seconds, fractional seconds, or RFC-7231 HTTP-date.
 * Past HTTP-dates clamp to 0 ms.
 * @throws RetryAfterParseError on undefined / empty / negative / non-numeric non-date input.
 */
export function parseRetryAfter(headerValue: string | undefined, now?: () => number): number;
```

The optional `now` parameter (defaults to `Date.now`) is for test injection — the HTTP-date branch needs a deterministic clock.

**Supported header forms** (research §R-009):
- **Integer seconds** (`'0'` to `'86400'`): parse via `Number()`; if `Number.isFinite(n) && n >= 0 && Number.isInteger(n)`, return `n * 1000`. (Note: explicit integer check; fractional path is separate to avoid double-counting.)
- **Fractional seconds** (`'0.5'`, `'1.25'`): parse via `Number()`; if `Number.isFinite(n) && n >= 0` and `!Number.isInteger(n)`, return `Math.ceil(n * 1000)`. (Round up to nearest ms — avoid retrying earlier than the server allowed.)
- **HTTP-date** (RFC 7231 `IMF-fixdate`, e.g. `'Mon, 06 Jun 2026 12:00:00 GMT'`): parse via `Date.parse()`; if `Number.isFinite(date)`, return `Math.max(0, date - now())`.
- **Invalid** (`undefined`, `''`, `'-1'`, `'abc'`, malformed date): throw `RetryAfterParseError(headerValue, message)`.

**Boundary tests** (`test/adapters/retry-after.test.ts`):

| Header value | Expected | Notes |
|---|---|---|
| `undefined` | throws | per spec — missing header is unparseable |
| `''` | throws | empty string |
| `'0'` | 0 ms | boundary — don't wait |
| `'1'` | 1000 ms | nominal lower edge |
| `'0.5'` | 500 ms | fractional path |
| `'1.25'` | 1250 ms | fractional path |
| `'3600'` | 3_600_000 ms | nominal upper |
| `'86400'` | 86_400_000 ms | large upper bound |
| `'-1'` | throws | negative not allowed |
| `'-0.5'` | throws | negative fractional |
| `'abc'` | throws | non-numeric, not date |
| `'1e3'` | throws | scientific notation rejected (Number() would accept it; we don't) |
| `'Mon, 06 Jun 2026 13:00:00 GMT'` with `now() = 2026-06-06T12:00:00Z` (1 hour future) | 3_600_000 ms | HTTP-date future path |
| `'Mon, 06 Jun 2026 11:00:00 GMT'` with same now | 0 ms | HTTP-date past → clamped |
| `'not a date'` | throws | non-numeric, malformed date |
| classifier `isRetryAfterParseError(thrown)` | true | predicate pairing |
| classifier `isRetryAfterParseError(new Error())` | false | non-instance |
| classifier `isRetryAfterParseError({})` | false | non-Error |

**Files**:
- `src/adapters/retry-after.ts` (new, ~70 lines).
- `test/adapters/retry-after.test.ts` (new, ~200 lines).

## Test strategy

TDD per `DIRECTIVE_034`. Order:
1. T007, T008, T009 — port files first. These are type-only; `tsc --noEmit` is the green-light gate. No runtime tests needed (per the contract — interfaces are exercised through implementations).
2. T010 — retry-after parser with boundary tests. Write the boundary tests first (red), then implement.

For T010, use `vi.useFakeTimers()` only if your test happens to need the date branch with `now` controlled — the parser accepts an injected `now` callback, so most tests can simply pass a literal `now: () => 1717...` value.

Coverage gate: 100% line + branch on `retry-after.ts`. Port files are types-only and contribute nothing executable; coverage tooling skips them.

## Definition of Done

- [ ] `src/ports/tracks-enumerator.ts`, `src/ports/catalog-enricher.ts`, `src/ports/detection-scanner.ts` exist with JSDoc on every interface method.
- [ ] `src/adapters/retry-after.ts` exports `parseRetryAfter`, `RetryAfterParseError`, `isRetryAfterParseError`.
- [ ] `test/adapters/retry-after.test.ts` covers every boundary in the table above and reaches 100% line + branch.
- [ ] `npm run test:run` and `npm run typecheck` green.
- [ ] `test/architecture.test.ts` reports no violations.
- [ ] No imports outside the allowed layer in any new file.

## Risks

| Risk | Mitigation |
|---|---|
| `Number('1e3')` would silently parse as 1000 if we use bare `Number()` | Explicit numeric regex check before `Number()`; test case `'1e3'` → throws asserts this. |
| `Date.parse('not a date')` returns `NaN`, not throws | Test `Number.isFinite(date)` and throw if not — covered by test case. |
| Fractional second causes silent off-by-one ms (retry too early) | `Math.ceil` rounds up — server's hint is "wait at least this long". |
| `Number()` accepts whitespace (`Number(' 1 ') === 1`) | If we want strict rejection, trim before parsing; test cases pin the choice. Recommendation: trim and accept (matches HTTP header laxness). |

## Reviewer guidance

- Confirm port files contain `interface` only — no runtime values.
- Confirm `EnrichmentSlot` is exported from the catalog-enricher port (per data-model / contract).
- For `retry-after.ts`, confirm every row in the boundary table has a corresponding `it()` case.
- Confirm the classifier `isRetryAfterParseError` pairs with the thrown error (NFR-008).
- Confirm scientific-notation strings (`'1e3'`) throw rather than parsing as 1000 — this is the strict-parse decision.

## Implementation command

```bash
spec-kitty agent action implement WP03 --agent <name>
```

## Activity Log

- 2026-06-10T09:23:21Z – claude:claude-sonnet-4-6:implementer:implementer – shell_pid=19178 – Assigned agent via action command
- 2026-06-10T14:13:06Z – claude:claude-sonnet-4-6:implementer:implementer – shell_pid=19178 – Ready for review (recovered: agent committed code but timed out before admin steps)
