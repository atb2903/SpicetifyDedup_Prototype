# Research: Code Review Remediation Pass

Phase 0 output. Resolves the load-bearing decisions behind the 14 findings.
Each decision records **Decision / Rationale / Alternatives considered**, plus
the concrete reachability evidence the remediation depends on. ADRs (C-005) are
written during implementation; this file is their input.

---

## R-1 — Per-batch stall model + faithful partial reporting (Finding B → FR-002, FR-003) — **ADR-worthy**

**Evidence (current behaviour).**
`detection-store.ts:460` wraps the *entire* `removalExecutor.remove(...)` call in
a single `raceStallCeiling(work, STALL_CEILING_MS=30_000, …)`. The executor
(`spicetify-removal-executor.ts`) internally batches into runs of `BATCH_SIZE=100`,
performs per-track fallback on an atomic-reject batch, and emits
`onProgress({ removedSoFar, total })` **once per batch**. On a ceiling trip the
store: (a) `controller.abort()`s, (b) the executor throws `AbortError` from its
next batch-boundary check — **discarding every track it already removed** — and
(c) the store's catch builds an **all-failed** outcome (`removed: []`) tagged with
a `stalled:` string prefix. Two defects fall out:
- A genuinely-progressing large removal (many batches, each well under 30 s, total
  > 30 s) trips purely on elapsed wall-clock → aborted while progressing (FR-002).
- Even when batches deleted tracks, the outcome says `removed: []` → the UI shows
  *"Removal timed out — no tracks were removed"* though deletions occurred (FR-003).

**Decision.**
1. **Per-batch progress watchdog (FR-002).** Replace the single whole-call
   `raceStallCeiling` with a watchdog the store resets on **every** `onProgress`
   callback (each completed batch is "progress"). The window is
   `STALL_CEILING_MS = 30_000`, re-scoped from *whole-removal* to *time since last
   batch progress*. It trips only when a single batch makes no progress for the
   window — a genuine hang — and never merely because the whole removal is long.
2. **Executor returns its accumulated partial on a boundary-abort (FR-003).** The
   `RemovalExecutor.remove` contract changes so that when `signal` is aborted at a
   batch boundary, the call **resolves with the accumulated `{ removed, failed }`**
   gathered so far, rather than throwing `AbortError`. The store therefore always
   receives the host-truthful partial. Provenance (stall vs user-cancel) is decided
   by the store (R-3), not by the executor.

**Rationale.** The executor is the only component that knows which TrackRefs were
actually removed (per-track fallback means cumulative count is *not* a clean
prefix of the RemoveSet, so the store cannot reconstruct the removed set from the
count alone). Having the executor surface its partial is the only faithful source
for FR-003. Resetting the watchdog on progress is the minimal change that makes
"long but progressing" safe while keeping the hang guard (ADR-0017's resilience
goal) intact. Reusing `30_000` keeps the existing boundary-test shape.

**Boundary tests (C-001).** Per-batch window at **29 999 / 30 000 / 30 001 ms**
(no-progress duration): under → batch continues; at `= ms` → trips (deadline wins
the tie, matching the corrected R-6 doc); over → trips. Plus: a multi-batch
removal whose *total* exceeds 30 000 ms but whose *every inter-progress gap* is
< 30 000 ms must complete (the FR-002 regression case).

**Alternatives considered.**
- *Store reconstructs removed set from `removedSoFar` count.* Rejected: per-track
  fallback breaks the prefix assumption; would under/over-report removed tracks.
- *Keep whole-call ceiling, just raise the number.* Rejected: any fixed
  whole-removal ceiling re-introduces the wall-clock abort for a large-enough
  library — the exact scale this project serves.
- *Executor keeps throwing `AbortError`; store infers partial from progress.*
  Rejected: same prefix-reconstruction unsafety; also couples the store to batch
  internals.

---

## R-2 — Detection error taxonomy: prune dead, add honest reasons (Findings C, D, E, I → FR-004, FR-005, FR-008, NFR-002) — **ADR-worthy**

**Evidence (reachability).** `DetectionErrorReason` (`detection-errors.ts:38`) =
`auth-token-expired | rate-limit-unparseable | network-failure |
malformed-enrichment-payload | enumerator-failed | catalog-rejected | aborted`.
Producers in the live (inline-enricher, ADR-0011) pipeline:
- `auth-token-expired` — enumerator `fetchPage` catch. **Reachable.**
- `enumerator-failed` — enumerator precheck/page/item validation + host reject. **Reachable.**
- `aborted` — never dispatched as a `fail` reason (store swallows `AbortError` → `idle`). **Reachable in type only**, intentionally (kept as defensive UI fallback).
- `catalog-rejected` — produced **only** by `detection-store.ts:333` wrapping a
  non-`DetectionError` scan throw with message *"scanner.scan threw a
  non-DetectionError"*. This is an **internal fault**, not a catalog rejection
  (the live pipeline has no catalog lookup — ADR-0011). The UI copy
  (`DetectionFailedView.tsx:132`) says *"Spotify rejected the catalog lookup"* and
  renders a `(status N)` suffix from `context.status` that **no producer ever
  sets**. → Finding C (mislabel) + Finding E (phantom suffix).
- `rate-limit-unparseable`, `network-failure`, `malformed-enrichment-payload` —
  abandoned Web-API enricher reasons; **no live producer** (verify by grep during
  implementation: no `new DetectionError('rate-limit-unparseable'|'network-failure'|'malformed-enrichment-payload'` outside tests/fakes). → Finding C/FR-005.

**Decision.**
- **Remove** `rate-limit-unparseable`, `network-failure`,
  `malformed-enrichment-payload` from `DetectionErrorReason`, the
  `DetectionFailedView` message switch, and any fixture that exercised a dead
  user-facing path (FR-005). (Test doubles may be repurposed for coverage of live
  paths; no dead user-facing branch may remain — Assumptions.)
- **Add `'internal-error'`** (FR-004): the store wraps an unexpected
  non-`DetectionError` scan throw as `DetectionError('internal-error', …)` instead
  of `catalog-rejected`; the UI message is honest internal-error copy with **no**
  catalog/Spotify-rejection wording.
- **Add `'host-unavailable'`** (NFR-002/Finding I): the enumerator's
  `requirePlatform` throws `DetectionError('host-unavailable', …)` so the scan
  path's "Spotify client not ready" matches the removal/playlists paths
  (SC-007). UI gets a dedicated host-unavailable message.
- **`catalog-rejected`**: with its sole producer relabelled to `internal-error`,
  it has no live producer left. Per FR-005 remove it too **unless** a live path
  still needs it — current evidence says remove. The phantom `(status N)` suffix
  (FR-008) disappears with it; if any rejection message keeps a status suffix it
  must render only when a status value is actually present.

**Rationale.** The reachable reason set must match the inline-enricher reality so
the UI never shows copy for an interaction that cannot occur. Exhaustiveness is
enforced by the `never` switch in `DetectionFailedView` — removing/adding a reason
is a type-checked change, which keeps coverage honest.

**Alternatives considered.**
- *Keep dead reasons "just in case".* Rejected: violates FR-005 and leaves
  misleading copy wired to dead branches that coverage cannot honestly exercise.
- *Reuse `catalog-rejected` for internal faults.* Rejected: that *is* the Finding C
  defect — the message names a catalog interaction that never happens.

---

## R-3 — Typed failure provenance across store→view (Finding K, F → NFR-004, FR-009) — **ADR-worthy**

**Evidence.** Provenance crosses the boundary as a string prefix: the store writes
`reason: \`${prefix}: ${message}\`` with `prefix ∈ {stalled, executor-failed}`
(`detection-store.ts:503,513`); `RemovalOutcomeView` re-derives it with
`failed.every(f => f.reason.startsWith('stalled:'))` (`RemovalOutcomeView.tsx:68`).
Separately, on a `computeRemoveSet` failure the store fabricates
`failedRefs = removeSet?.tracks ?? [{ uri: result.collectionKey }]`
(`detection-store.ts:508`) — i.e. a phantom "track" whose `uri` is the playlist
URI or `'liked-songs'` sentinel, which the view counts as "1 track" (Finding F).

**Decision.** Add a typed discriminator to the removal outcome surfaced to the
view — a `provenance` field on `RemovalOutcome` (domain, pure):
`'host' | 'stalled' | 'executor-failed' | 'compute-failed'`.
- The executor's resolved outcome is `provenance: 'host'`.
- The store stamps `'stalled'` / `'executor-failed'` / `'compute-failed'` on the
  outcomes it synthesises.
- `'compute-failed'` (FR-009) carries **no fabricated track**: `removed: []`,
  `failed: []`, count truthfully 0; the view shows *"couldn't compute the
  removal"* copy that names **no** track and **no** count.
- The view branches on `outcome.provenance` — **no `startsWith`** anywhere.

**Rationale.** A typed discriminator is the single source of provenance truth;
the string-prefix protocol is brittle (any reason text starting with `stalled:`
would misfire) and conflates a human message with a control signal. Keeping
`provenance` in `removal-types.ts` honours C-004 (domain stays pure) and gives the
view a type-checked branch.

**Alternatives considered.**
- *Discriminated-union wrapper `{ kind: 'host' | 'stalled' | … ; outcome }`.* Viable;
  rejected in favour of a flat optional `provenance` field to minimise churn on
  the many existing `RemovalOutcome` constructions and the `applyRemovalOutcome`
  signature. (Implementation may revisit if the flat field forces awkward
  defaults — recorded as the ADR's considered alternative.)
- *Keep the prefix, just centralise the constant.* Rejected: still string-typed,
  still re-parsed; NFR-004 explicitly forbids `startsWith` provenance.

---

## R-4 — Host-availability uniformity (Finding I → NFR-002)

**Evidence.** `spicetify-removal-executor.ts:213` and
`spicetify-playlists-loader.ts:53` both have a `requirePlatform` that fails loud
with a `host-unavailable` reason before any host touch. The **tracks enumerator**
does not: its `platform` getter (`spicetify-tracks-enumerator.ts:226-232`) returns
`globalThis…Platform as TracksEnumeratorPlatform` — an **unsafe cast that hides a
possibly-`undefined` platform from the compiler**; a missing host surfaces later as
an opaque `TypeError`.

**Decision.** Give the enumerator a `requirePlatform()` mirroring the other two:
return the injected platform if present, else read `globalThis.Spicetify.Platform`,
and throw `DetectionError('host-unavailable', …)` (R-2) when it is absent or
missing the needed API/method — **before** any host call. Remove the `as` cast so
the compiler sees the real `T | undefined`. All three adapters then fail loud with
their layer's typed `host-unavailable` signal (SC-007).

**Alternatives considered.** *Extract a shared `requirePlatform` helper.* Rejected
for now — the three adapters throw three different typed errors
(`DetectionError` / `RemovalError` / `PlaylistsLoaderError`) and assert different
methods; a shared helper would need generic error injection for marginal gain.
Uniform *behaviour*, not shared *code*, is the NFR-002 requirement.

---

## R-5 — Shared auth-expired predicate (Findings D → FR-006, FR-007)

**Evidence.** `spicetify-tracks-enumerator.ts:399` and
`spicetify-playlists-loader.ts:309` carry near-identical `looksLikeAuthExpired`
predicates that both inspect **`cause.status`**. Per ADR-0010 / project research,
`Spicetify.CosmosAsync` resolves HTTP errors as `{ code, error, message, stack }`
— the status is under **`code`**, and there are **no headers**. So `status === 401`
never matches a real cold rejection; only the message-substring fallback can fire.

**Decision.** Introduce `src/domain/host-auth.ts` exporting a pure
`looksLikeHostAuthExpired(cause): boolean` that inspects **`code`** (the field the
client populates) — `code === 401`, plus the existing message-substring fallbacks
(`"401"`, `"token"` + `"expired"|"invalid"`). Both adapters call it. This gives
FR-006 and FR-007 a **single definition** (same field, same outcome regardless of
entry point), consistent with the NFR-001 "single canonical definition" spirit.

**Boundary/edge tests.** `{ code: 401 }` → auth-expired; `{ status: 401 }` (old
shape) → **not** auth-expired via the code path (documents the corrected field);
message-only `"... 401 ..."` and `"token expired"` → auth-expired; unrelated error
→ `enumerator-failed` / `host-auth-expired` per adapter.

**Alternatives considered.** *Fix the field in place in each adapter
independently.* Rejected: leaves two copies that can drift again (the very class of
bug FR-007 exists to prevent) — `host-auth.ts` is the consistency-preserving fix.

---

## R-6 — `raceStallCeiling` JSDoc vs behaviour (Finding G → NFR-007)

**Evidence.** The JSDoc (`detection-store.ts:64-66`) asserts that at `= ms`
"**deadline wins** … the deadline arm is wired so it takes the tie." The
implementation is a plain single-shot `settled` flag race
(`detection-store.ts:90-125`) — whichever callback runs first wins; nothing
*guarantees* the timeout arm beats a same-tick settlement.

**Decision.** **Correct the JSDoc** (chosen in planning) to describe the real
race-order behaviour and drop the unbacked tie-break guarantee. Because R-1
rewrites the stall region into a progress-resetting watchdog, the corrected
documentation is authored as part of that rework. The per-batch boundary test
defines the canonical `= ms` semantics for the new watchdog (R-1) so the doc
asserts only what the code provides.

**Alternatives considered.** *Wire the documented `= ms` tie-break.* Rejected in
planning — adds timing-sensitive behaviour for a guarantee nothing depends on;
doc-correction is lower risk.

---

## R-7 — Structural architecture/layering test (Finding L → NFR-005)

**Evidence.** `test/architecture.test.ts` is a **regex content scan**
(`/from\s+['"][^'"]*\/adapters\//` etc.). Its own header documents the gap:
re-exports (`export … from`), dynamic `import()`, and unusually-written type-only
imports are not covered.

**Decision.** Rebuild the analyser on the **TypeScript Compiler API**
(`typescript` is already a devDependency). Parse each `src/**/*.{ts,tsx}` to a
SourceFile and walk `ImportDeclaration`, `ExportDeclaration` (re-exports),
`ImportEqualsDeclaration`, and `CallExpression` with
`expression.kind === SyntaxKind.ImportKeyword` (dynamic `import()`), resolving each
module specifier to its owning layer and asserting the ADR-0001 forbidden-edge
table. Keep the per-`(file, rule)` `it()` granularity so a failure still points at
the exact file + rule. Add **fixtures** (small `.ts` files, or inline parsed
strings) demonstrating that a forbidden re-export, a forbidden dynamic
`import()`, and a forbidden `import type` are now caught — these fixtures are the
regression proof NFR-005 requires.

**Coverage note (C-001).** The analyser is application code under the runner's
100% line/branch mandate; the fixtures double as both the "previously-missed
forms" proof and the branch coverage for each import-kind handler.

**Alternatives considered.** *`dependency-cruiser`* and *`ts-morph`* — both add a
devDependency; rejected in planning in favour of the no-new-dependency TS compiler
API (consistency-over-novelty; matches the existing test's own "swap in a real
parser" note).

---

## R-8 — Decompose `confirmRemoval` (Finding J → NFR-003)

**Evidence.** `confirmRemoval` (`detection-store.ts:396-539`) is one ~140-line
method carrying several invariants in prose comments: compute-the-remove-set
**exactly once** (never re-invoke in the catch — the ADR-0017 Defect A fix); the
closure-level concurrency lock; the own-entry `finally` guard; the
no-executor fail-loud.

**Decision.** Extract named, individually-testable helpers (e.g. the two-step
confirmation branch, the execute-and-apply path, the failure→outcome synthesis)
while preserving every invariant. Enforce structurally where practical: compute
the remove-set once and pass it as a parameter so the catch *cannot* re-invoke
(turns a prose invariant into a signature-level one). Behaviour and 100% coverage
unchanged. Interacts with R-1 (the execute path gains the per-batch watchdog) and
R-3 (failure synthesis stamps typed provenance) — decompose so those land cleanly.

**Alternatives considered.** *Leave as-is with comments.* Rejected — NFR-003
requires reduced cognitive load and structural invariant enforcement.

---

## R-9 — `reset()` outside the FSM transition tables (Finding N → NFR-008)

**Evidence.** `reset()` (`detection-store.ts:365-381`) aborts all controllers and
clears `rows` directly — it is a lifecycle override, deliberately not a `transition`
action (it has no per-row FSM edge). ADR-0005 covers React lifecycle reset; the
*placement* rationale is undocumented at the store.

**Decision.** Document the placement as an accepted design decision (a store-level
comment plus an ADR/ADR-update) so a reader can reason about reachable lifecycle
without surprise. **No structural change** to `reset()` (Out of Scope).

---

## R-10 — Finding A classifier gate without breaking fail-loud (FR-001)

**Evidence.** The enumerate loop (`spicetify-tracks-enumerator.ts:288-294`) calls
`parseLibraryTrackItem` on **every** non-local item. `parseLibraryTrackItem`
requires a non-empty `artists` array + album object, so: a podcast episode
*without* artists → `enumerator-failed` (collection **unscannable**); an episode
*with* an `artists` array → parsed and deduped **as a track** (mis-scanned). The
exported classifier `isLibraryTrackItem` checks `type === 'track'` **and** shape.

**Decision.** Gate the loop so **non-track items are skipped** (FR-001) while a
`type === 'track'` item that is malformed still **fails loud** (charter input
validation; the episode-vs-broken-track distinction in the spec's edge cases).
Use the existing classifier's `type === 'track'` discriminant as the skip gate;
keep `parseLibraryTrackItem`'s fail-loud reachable for genuine-but-malformed
tracks. Concretely: skip when `isLocalFile(item)` **or** the item's `type` is not
`'track'`; otherwise parse (which still throws on a malformed genuine track). The
edge case "a non-track item that carries an `artists` array" is covered by the
type check preceding any shape parse. Boundary cases: all-episodes collection →
empty result, no failure (SC-001); mixed → only genuine tracks considered.

**Open implementation nuance (resolve in TDD).** If skipping on the *full*
classifier (`isLibraryTrackItem`) is chosen, a malformed *genuine* track would be
silently skipped and `parseLibraryTrackItem`'s fail-loud branch would become
unreachable (coverage + fail-loud regression). The decision above (type-gate skip,
shape-validate genuine tracks) preserves both; the failing test is written first to
pin it.

---

## Reachability checklist to confirm during implementation (TDD inputs)

- [ ] grep producers of each `DetectionErrorReason` to freeze the live-reachable set (R-2).
- [ ] confirm no non-test producer of `rate-limit-unparseable` / `network-failure` / `malformed-enrichment-payload` / `catalog-rejected` after relabelling (R-2/FR-005).
- [ ] confirm the executor's per-track-fallback path still satisfies total-accounting after the boundary-abort-returns-partial change (R-1).
- [ ] confirm `applyRemovalOutcome` tolerates a `provenance: 'compute-failed'` zero-track outcome without throwing (R-3/FR-009).
