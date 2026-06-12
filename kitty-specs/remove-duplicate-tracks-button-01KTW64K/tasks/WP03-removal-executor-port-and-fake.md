---
work_package_id: WP03
title: RemovalExecutor port + FakeRemovalExecutor
dependencies:
- WP01
requirement_refs:
- FR-003
- FR-010
- FR-012
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts for this feature were generated on main. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into main unless the human explicitly redirects the landing branch.
created_at: '2026-06-11T20:52:36Z'
subtasks:
- T009
- T010
- T011
agent: "claude:opus:reviewer:reviewer"
shell_pid: "33597"
history:
- timestamp: '2026-06-11T20:52:36Z'
  action: created
  actor: tasks-prompt-generator
authoritative_surface: src/ports/
execution_mode: code_change
owned_files:
- src/ports/removal-executor.ts
- src/adapters/fake-removal-executor.ts
- test/adapters/fake-removal-executor.test.ts
tags: []
---

# WP03 — `RemovalExecutor` port + `FakeRemovalExecutor`

## Objective

Define the single mutation port the whole feature deletes through, and a scripted in-memory
fake that lets the store (WP05) and UI (WP06) be built and fully tested without a live
Spotify client and without the live-verification gate that the real adapter (WP04) carries:

1. **`RemovalExecutor`** port interface (`src/ports/removal-executor.ts`).
2. **`FakeRemovalExecutor`** — a test double that returns scripted per-batch results
   (`ok` / partial-fail / throw), records every call it received (target, tracks, batch
   boundaries, progress emissions), and honours the `AbortSignal`.
3. Full tests for the fake.

100% line+branch on the fake; `tsc --noEmit` green. The port file is types/interface-only
(0/0 coverage expected).

## Context

This is the seam that satisfies `DIRECTIVE_036` (black-box integration testing): the store
and UI drive the **same port** the Spicetify adapter implements, so their tests exercise the
real plumbing — single-collection scope, partial-failure handling, concurrency — without
mocking internals. Read first:

- [`../contracts/removal-executor-port.md`](../contracts/removal-executor-port.md) — the
  authoritative port contract and the `FakeRemovalExecutor` script semantics (read fully).
- [`../data-model.md`](../data-model.md) §6 (port signature), §2 (`RemovalTarget`, `TrackRef`,
  `RemovalOutcome`, `RemovalProgressEvent`).
- `src/ports/tracks-enumerator.ts` and `src/adapters/fake-tracks-enumerator.ts` (existing) —
  mirror these for file layout, JSDoc density, and the "scripted + call-recorder" fake style.
- `src/domain/removal-types.ts` (WP01) — the value types the port references.
- `src/domain/removal-errors.ts` (WP01) — `RemovalError` (the fake's `throw` script uses it).

**Architectural constraint** (ADR-0001): `src/ports/` imports only `src/domain/`. The fake in
`src/adapters/` imports `src/ports/` + `src/domain/` only — no Spicetify, no store, no UI.

## Branch strategy

Planning base & merge target: **`main`**. Workspace/branch assigned by
`spec-kitty agent action implement WP03 --agent <name>` from `lanes.json`. Depends on **WP01**.

## Subtasks

### T009 — `RemovalExecutor` port interface (`src/ports/removal-executor.ts`, NEW)

**Purpose**: One interface, mirroring how `DetectionScanner` / `TracksEnumerator` are
declared (port = interface only, no implementation).

**Declare** (data-model §6 + contract §Interface), JSDoc every member:
```ts
import type {
  RemovalTarget, TrackRef, RemovalOutcome, RemovalProgressEvent,
} from '../domain/removal-types';

export interface RemovalExecutor {
  /**
   * Delete `tracks` from the single `target` collection. Resolves with a
   * per-track outcome (removed vs failed); rejects only for whole-operation
   * faults the adapter cannot attribute (e.g. host API absent → RemovalError
   * 'host-unavailable'). Honors `signal` between batches (AbortError).
   */
  remove(
    target: RemovalTarget,
    tracks: ReadonlyArray<TrackRef>,
    signal: AbortSignal,
    onProgress?: (event: RemovalProgressEvent) => void,
  ): Promise<RemovalOutcome>;
}
```

Document the post-conditions in JSDoc: `removed.length + failed.length === tracks.length`;
`removed`/`failed` disjoint; single-collection scope (one `target` per call); rejection is
reserved for unattributable whole-operation faults.

**Validation**: `tsc --noEmit` green; interface-only (0/0 coverage). Imports nothing outside
`src/domain/`.

**Files**: `src/ports/removal-executor.ts` (new, ~45 lines incl. JSDoc).

### T010 — `FakeRemovalExecutor` (`src/adapters/fake-removal-executor.ts`, NEW)

**Purpose**: A deterministic, scripted `RemovalExecutor` for store/UI tests. It does **not**
batch internally the way the real adapter does (it has no host); instead it maps the test's
**script** onto the `tracks` it receives, records the call, and synthesises a `RemovalOutcome`.

**Design** (contract §FakeRemovalExecutor):
- Constructor takes a script describing what the *next* `remove` call should do. A simple,
  total model that covers the scenarios WP05/WP06 need:
  ```ts
  export type FakeRemovalScript =
    | { kind: 'ok' }                              // all requested tracks removed
    | { kind: 'partial'; failUris: ReadonlyArray<string> } // these uris fail, rest removed
    | { kind: 'partial-uids'; failUids: ReadonlyArray<string> } // fail by uid (playlist)
    | { kind: 'throw'; error: unknown };          // reject the whole call
  ```
  Accept either a single script (used for every call) or a queue of scripts consumed
  per-call (`scripts: FakeRemovalScript[]`) — pick one and document it; a single default
  script with an optional per-call queue is the most flexible. Default when unscripted: `ok`.
- **`remove(target, tracks, signal, onProgress)`**:
  1. Record the call: push `{ target, tracks: [...tracks] }` onto a public `calls` array
     (copy the array so later mutation can't corrupt the record).
  2. If `signal.aborted` at entry → throw `new DOMException('aborted', 'AbortError')`.
  3. Resolve the script for this call. For `throw` → reject with `script.error`
     (so a `RemovalError` or any value can be injected).
  4. For `ok` → `removed = tracks`, `failed = []`.
     For `partial` → partition `tracks` by `failUris.includes(t.uri)`; failures become
     `{ track, reason: 'fake-fail' }`. For `partial-uids` → partition by `t.uid`.
  5. If `onProgress` provided → emit at least one `{ removedSoFar: removed.length,
     total: tracks.length }` (optionally emit incrementally so NFR-002 progress can be
     asserted; one terminal event is the minimum).
  6. Return `{ removed, failed }`.
- **Invariant the fake must uphold** (so tests catch contract drift):
  `removed.length + failed.length === tracks.length`; `removed`/`failed` disjoint.
- Optionally expose `batchBoundaries`/recorded progress events for assertions if cheap;
  keep the surface minimal and SRP-clean.

**Files**: `src/adapters/fake-removal-executor.ts` (new, ~110 lines incl. JSDoc).

### T011 — `FakeRemovalExecutor` tests (`test/adapters/fake-removal-executor.test.ts`, NEW)

**Purpose**: Prove the fake honours the port contract so downstream WPs can trust it.

**Tests**:
- `ok` script → `removed` equals the requested tracks, `failed` empty.
- `partial` script with `failUris: [u1]` → `u1` in `failed` with a `reason`, the rest in
  `removed`; `removed.length + failed.length === tracks.length`; disjoint.
- `partial-uids` script (playlist) → partitions by `uid`.
- `throw` script → `remove` rejects with the injected error (assert identity / `isRemovalError`
  when a `RemovalError` is injected).
- Pre-aborted `signal` → rejects with `AbortError` and records (or does not record — pick and
  test) the call. Document the chosen semantics.
- `calls` recorder → after two `remove` calls with different targets, `calls` has both, in
  order, with copied `tracks` (mutating the original array afterwards does not change `calls`).
- `onProgress` → invoked with a terminal `{ removedSoFar, total }`; absent callback is a no-op.
- Script queue (if implemented) → consecutive calls consume consecutive scripts; running past
  the queue falls back to the default `ok`.
- 100% line + branch.

**Files**: `test/adapters/fake-removal-executor.test.ts` (new, ~150 lines).

## Test strategy

TDD (`DIRECTIVE_034`): write a failing test (`ok` script returns all-removed), watch it fail,
implement the fake. No happy-dom (the fake is host/DOM-free). Coverage gate: 100% line+branch
on `fake-removal-executor.ts`. The port file is interface-only — 0/0 coverage, no test needed
for the interface itself. `test/architecture.test.ts` auto-discovers both new files and
asserts their import boundaries.

## Definition of Done

- [ ] `RemovalExecutor` port declared per data-model §6 with full JSDoc post-conditions;
      imports only `src/domain/`.
- [ ] `FakeRemovalExecutor` honours the port: `removed + failed === requested`, disjoint,
      single `target` per call, records calls (copied `tracks`), emits progress, honours abort,
      and supports `ok` / `partial` / `partial-uids` / `throw` scripts.
- [ ] Fake tests cover every script kind, the recorder, abort, and the invariant; 100%
      line+branch.
- [ ] `npm run test:run` and `tsc --noEmit` green; architecture test clean.
- [ ] No Spicetify / store / UI imports anywhere in this WP.

## Risks

| Risk | Mitigation |
|---|---|
| Fake diverging from the real port contract | Fake test asserts `removed.length + failed.length === requested.length` and disjointness — the same invariants WP04 must satisfy. |
| Recorder holding a live reference to the caller's `tracks` array | Copy `tracks` into `calls`; test mutates the original afterwards and asserts `calls` unchanged. |
| Over-building the fake (batching it doesn't need) | The fake has no host — it maps script→outcome directly; batching belongs to WP04 only. |

## Reviewer guidance

- Confirm the port is interface-only and lives in `src/ports/`.
- Confirm the fake's outcome always accounts for every requested track and never reports a
  track as both removed and failed.
- Confirm abort and `throw` paths are real (reject), not swallowed.
- Check JSDoc documents the port post-conditions (these are what WP04 will be reviewed against).

## Implementation command

```bash
spec-kitty agent action implement WP03 --agent <name>
```

## Activity Log
- 2026-06-12T13:55:12Z – claude:opus:implementer:implementer – shell_pid=27750 – Started implementation via action command
- 2026-06-12T14:00:59Z – claude:opus:implementer:implementer – shell_pid=27750 – Ready for review: RemovalExecutor port + scripted FakeRemovalExecutor, 100% line+branch, tsc clean, architecture green
- 2026-06-12T14:01:31Z – claude:opus:reviewer:reviewer – shell_pid=33597 – Started review via action command
- 2026-06-12T14:03:52Z – claude:opus:reviewer:reviewer – shell_pid=33597 – Review passed: port interface-only with full post-condition JSDoc matching data-model §6; FakeRemovalExecutor upholds total-accounting+disjointness across ok/partial/partial-uids, real abort+throw rejection, copied-tracks recorder, terminal onProgress, queue+default-ok fallback; 100% line+branch on fake, tsc clean, 983 tests green, imports respect domain/ports boundaries.
