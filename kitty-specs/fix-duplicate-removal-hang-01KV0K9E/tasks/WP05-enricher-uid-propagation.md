---
work_package_id: WP05
title: Enricher uid propagation (the functional fix)
dependencies:
- WP01
requirement_refs:
- FR-002
- FR-003
- FR-005
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts for this feature were generated on main. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into main unless the human explicitly redirects the landing branch.
created_at: '2026-06-13T20:30:00Z'
subtasks:
- T015
- T016
agent: "claude:opus:implementer:implementer"
shell_pid: "83552"
history:
- timestamp: '2026-06-13T20:30:00Z'
  action: created
  actor: replan-after-wp01-diagnosis
authoritative_surface: src/adapters/inline-catalog-enricher.ts
execution_mode: code_change
owned_files:
- src/adapters/inline-catalog-enricher.ts
- test/adapters/inline-catalog-enricher.test.ts
tags: []
---

# WP05 — Enricher `uid` propagation (the functional fix · Defect B)

## Objective

Restore the **ADR-0012** contract that the inline enricher silently regressed: every
`EnrichedTrack` the enricher emits must carry the playlist occurrence `uid` it was given on the
`RawTrack`. Without this, every playlist member reaches `computeRemoveSet` with `uid === undefined`,
which fails loud (`playlist-member-missing-uid`) — so **no playlist duplicate can ever be removed**
(FR-002/FR-003/FR-005). This is the functional root cause confirmed by WP01's live diagnosis.

This WP is a **one-line production change** plus a regression test that turns the previously
doc-comment-only contract into a test-enforced one.

> **Why this is a separate WP (not folded into WP03).** The fix lives in the `adapters` layer
> (`inline-catalog-enricher.ts`); WP03's hang fix lives in the `store` layer
> (`detection-store.ts`). File-level SRP (C-005 / charter) keeps them in disjoint WPs with disjoint
> `owned_files`. WP05 depends only on WP01 and may run in parallel with WP02.

## Context — read first

- [`../diagnosis-evidence.md`](../diagnosis-evidence.md) — the live C-004 evidence. Transcript 2
  shows the host returns `uid: '610a666b423c78e4'` (a non-empty string) on every `getContents`
  item; the static trace pins the drop at `inline-catalog-enricher.ts:97-104`.
- ADR-0012 (`.claude/adr/0012-capture-playlist-uid-for-occurrence-removal.md`) — the decision being
  restored: "`uid` flows unchanged through enrichment into each group member."
- ADR-0017 (`.claude/adr/0017-…`) — records this regression as the functional root cause.
- `src/adapters/spicetify-tracks-enumerator.ts:170-188` — `parseLibraryTrackItem` already captures
  `item['uid']` onto `RawTrack.uid` (a non-empty string, else `undefined`). **Do not change the
  enumerator** — capture works; only enrichment drops it.
- `src/domain/detection-types.ts:108-121` — `EnrichedTrack.uid?: string` already exists with the doc
  comment "Mirrors `RawTrack.uid`; preserved verbatim through enrichment". The implementation must
  now honor it.
- `src/adapters/inline-catalog-enricher.ts` — the `RawTrack` input type carries `uid?: string`; the
  enriched-slot construction (lines 97-104) is where the field is currently omitted.

**TDD is mandatory (DIRECTIVE_034):** write T016, watch it fail, then make T015 pass.

## Subtasks

### T016 — Failing-first guard test (`test/adapters/inline-catalog-enricher.test.ts`)

**Purpose.** Lock the `uid`-survives-enrichment contract so it cannot silently regress again.

**Steps.**

1. Add a test that builds a `RawTrack` with a non-empty `uid` (e.g. `'610a666b423c78e4'`), a
   non-null `durationMs` (so it takes the `enriched` slot branch), and runs it through the enricher.
   Assert the emitted `EnrichedTrack` has `uid === '610a666b423c78e4'`.
2. Add the negative branch: a `RawTrack` with **no** `uid` (Liked-Songs origin) → the emitted
   `EnrichedTrack.uid` is `undefined` (the enricher must not fabricate one — ADR-0012).
3. Run the test and **watch it fail** on the positive case (today `uid` is dropped). Record the
   observation in the WP history/PR notes.
4. Preserve the existing enricher tests (duration passthrough, `unenriched` slot for null duration,
   abort guards) and keep 100% line/branch coverage.

### T015 — Propagate `uid` onto `EnrichedTrack`

**Purpose.** The actual fix.

**Steps.**

1. In `src/adapters/inline-catalog-enricher.ts` (the `enriched` slot construction, ~lines 97-104),
   copy the occurrence id from the source `RawTrack`. Match the existing optional-field convention
   in the codebase (the enumerator adds `uid` only when defined — see
   `spicetify-tracks-enumerator.ts:187-188`):
   ```ts
   track: {
     position: t.position,
     uri: t.uri,
     canonicalUri: t.uri,
     name: t.name,
     artists: t.artists.map((a) => ({ name: a.name })),
     durationMs: t.durationMs,
     ...(t.uid !== undefined ? { uid: t.uid } : {}),
   },
   ```
   (Use the spread-when-defined form to keep `uid` absent — not `undefined`-valued — for
   Liked-Songs, matching how `RawTrack` is built. A plain `uid: t.uid` is acceptable only if it
   keeps T016's Liked-Songs branch and `tsc` strict green.)
2. Make no other change: the `unenriched` slot, abort guards, chunking, and `onProgress` wiring are
   untouched. `canonicalUri` stays `t.uri` (region-relink is out of scope — spec / ADR-0011).
3. `npm run typecheck` clean; re-run T016 — it must now pass (positive and negative branches).

## Definition of Done

- [ ] T016 observed failing before T015, passing after (recorded).
- [ ] `EnrichedTrack` emitted by the enricher carries `uid` for a playlist `RawTrack`, absent for a
      Liked-Songs `RawTrack`.
- [ ] Only `inline-catalog-enricher.ts` (+ its test) changed — no enumerator/store/domain edits.
- [ ] `npm run typecheck` clean; `npm run test:run` green; `npm run test:coverage` 100% line/branch
      on the enricher.
- [ ] The architecture test still passes (the enricher's import boundaries are unchanged).

## Reviewer guidance

- Confirm the enumerator was **not** touched — capture already works; the bug was only the drop.
- Confirm the Liked-Songs branch keeps `uid` absent/`undefined` (no fabricated id — ADR-0012).
- Confirm the change is a pure field-copy: no behavior change to duration/unenriched/abort paths.
- Confirm the guard test would fail against the pre-fix enricher (it must actually exercise the
  positive case), so the contract is genuinely enforced.

## Risks

- **`undefined`-valued vs absent `uid`.** Strict TS + the downstream `computeRemoveSet` check
  (`typeof member.uid === 'string' && length > 0`) tolerate both, but match the codebase's
  add-when-defined convention to avoid `exactOptionalPropertyTypes` friction — verify `tsc` stays
  green either way.
- **Coverage.** Both branches (uid present / absent) must be exercised so the conditional is fully
  covered.

## Activity Log

- 2026-06-13T22:03:45Z – claude:opus:implementer:implementer – shell_pid=83552 – Started implementation via action command
