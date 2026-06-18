---
work_package_id: WP01
title: NEW-1 — true local-only skip tally via EnumerationResult return type
dependencies: []
requirement_refs:
- FR-001
- FR-002
- FR-003
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts for this feature were generated on main. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into main unless the human explicitly redirects the landing branch.
base_branch: kitty/mission-residual-review-findings-remediation-01KV7ZEA
base_commit: bd014fd7e410d050e22156101d25f543593945ce
created_at: '2026-06-18T11:17:22.261364+00:00'
subtasks:
- T001
- T002
- T003
phase: Phase 1 - Detection
assignee: ''
agent: "claude:opus:reviewer:reviewer"
shell_pid: "18805"
history:
- timestamp: '2026-06-18T00:00:00Z'
  agent: system
  action: Prompt generated via /spec-kitty.tasks
authoritative_surface: src/adapters/spicetify-tracks-enumerator
execution_mode: code_change
owned_files:
- src/domain/detection-types.ts
- src/ports/tracks-enumerator.ts
- src/adapters/spicetify-tracks-enumerator.ts
- src/adapters/fake-tracks-enumerator.ts
- src/adapters/detection-scanner.ts
- src/ui/DetectionLoadedSummary.tsx
- .claude/adr/0021-enumeration-result-return-type.md
- test/adapters/spicetify-tracks-enumerator.test.ts
- test/adapters/fake-tracks-enumerator.test.ts
- test/adapters/detection-scanner.test.ts
- test/ui/DetectionLoadedSummary.test.tsx
tags: []
---

# Work Package Prompt: WP01 — NEW-1 true local-only skip tally

## Objective

Stop `skippedLocalCount` from folding skipped non-track items (e.g. podcast
episodes) into the "local files" count. The enumerator reports a **genuine
local-only tally** on its return value (`EnumerationResult`), and the scanner
reads it directly instead of inferring `hostTotalLength − scannedTrackCount`.
Non-track items remain excluded from matching and **invisible** (no separate
count, no label) — FR-001/002/003.

Charter gates absolute on `main`: TDD (failing test first), 100% line/branch
coverage, strict TS, architecture test green.

## Context

- **Decision D-1 (user interview, locked):** the tally flows on the **return
  value**, not the progress event. `enumerate(...)` returns
  `{ tracks, skippedLocalCount }`; the `ProgressEvent` union is unchanged. This
  deliberately breaks from the progress-derived `hostTotalLength` pattern that
  *caused* NEW-1.
- Root cause: `detection-scanner.ts:73-80,136-138` derives
  `skippedLocalCount = Math.max(0, hostTotalLength − scannedTrackCount)`, which
  absorbs episodes (skipped at `spicetify-tracks-enumerator.ts:338` via
  `!isTrackKind`) into the local count.
- The enumerator loop already distinguishes the two skip kinds at `:337-344`
  (`isLocalFile(item)` vs `!isTrackKind(item)`) — count only the former.
- `EnrichedTrack`/algorithm fields are unaffected; this is a counting-contract
  fix, not an algorithm change.
- Read: `src/adapters/detection-scanner.ts`, `src/adapters/spicetify-tracks-enumerator.ts`,
  `src/domain/detection-types.ts` (`RawTrack`, `DetectionResult.skippedLocalCount`,
  `ProgressEvent`), `src/ui/DetectionLoadedSummary.tsx`, ADR-0001 (hexagonal edges),
  ADR-0011 (inline host shape).

## Branch strategy

Planning/base `main`; merge target `main`. No dependencies.

Start command:

```bash
spec-kitty agent action implement WP01 --agent <name>
```

---

### T001 — EnumerationResult return type + genuine local tally

**Purpose**: Move the local-skip tally onto the enumerator return value (FR-001/002).

**Steps**:
1. Add `EnumerationResult = { tracks: ReadonlyArray<RawTrack>; skippedLocalCount: number }`
   to `detection-types.ts` with JSDoc: `skippedLocalCount` counts **only**
   `spotify:local:` items; non-track items (episodes) are excluded and uncounted.
2. Change `TracksEnumerator.enumerate` to return `Promise<EnumerationResult>`;
   update its JSDoc (no longer "resolves with the full ordered list").
3. `SpicetifyTracksEnumerator`: increment a `skippedLocalCount` only on the
   `isLocalFile(item)` branch; non-track items still `continue` uncounted; return
   `{ tracks, skippedLocalCount }`.
4. `FakeTracksEnumerator`: mirror the return shape so fixtures can express a
   local-skip count.

**Validation (TDD)**: a page mixing genuine tracks + `spotify:local:` + `type:'episode'`
items → `skippedLocalCount` counts only the local files; episodes absent from
`tracks` and uncounted. Boundary (NFR-005): 0 local / 0 episode; exactly 1 local;
exactly 1 episode; all-local page; all-episode page.

---

### T002 — Scanner consumes the reported tally; delete the inference

**Purpose**: Remove the conflating derivation (FR-003).

**Steps**:
1. In `detection-scanner.ts`, destructure `{ tracks, skippedLocalCount }` from
   `enumerator.enumerate(...)` (`:82`).
2. Delete the `hostTotalLength` tracking used solely for the tally (`:73-80`) and
   the `Math.max(0, hostTotalLength − scannedTrackCount)` derivation (`:136-138`);
   set `DetectionResult.skippedLocalCount` from the reported value. Keep emitting
   `enumerating` progress unchanged (the `onProgress` passthrough remains).

**Validation (TDD)**: given a fake returning `{ tracks, skippedLocalCount: k }`,
`DetectionResult.skippedLocalCount === k` regardless of any host total or episode
count. Existing scanner abort/empty-collection tests stay green.

---

### T003 — UI summary truthfulness + ADR

**Purpose**: Surface only genuine local files; record the contract decision.

**Steps**:
1. Confirm `DetectionLoadedSummary.tsx` renders the "skipped N local files"
   annotation from the now-truthful `skippedLocalCount`; ensure a collection with
   episodes-but-no-locals shows **no** annotation (AS-1) and no episode label (FR-002).
2. Author `.claude/adr/0021-enumeration-result-return-type.md`: the decision to
   return the tally on `EnumerationResult` rather than the progress event, with the
   NEW-1 root-cause rationale (load-bearing summary data must not ride the
   fire-and-forget progress seam). Cross-ref ADR-0008 (progress shape).

**Validation (TDD)**: AS-1 (episodes, no locals → annotation absent/zero); AS-2
(genuine locals → annotation reflects only locals). ADR present and linked.

---

## Definition of Done

- [ ] All three subtasks complete, test-first.
- [ ] `npx tsc --noEmit` clean; `npm run test:coverage` 100% line/branch/func/stmt, no skips.
- [ ] `test/architecture.test.ts` green (port return-type change introduces no forbidden edge — NFR-003).
- [ ] No non-track count or "episode" label introduced anywhere (FR-002).
- [ ] ADR-0021 authored.
- [ ] WHEN DONE: commit in the worktree, then run the WP's spec-kitty completion commands — do not hand off mid-WP.

## Reviewer guidance

- Confirm the `hostTotalLength − scannedTrackCount` derivation is **gone**, not merely supplemented.
- Confirm only `isLocalFile` increments the tally; the `!isTrackKind` branch stays uncounted/invisible.
- Confirm the `ProgressEvent` union is unchanged (D-1) and the fake mirrors the real return shape.
- Boundary tests present for the skip counts.

## Activity Log

- (pending)
- 2026-06-18T11:17:22Z – claude:opus:implementer:implementer – shell_pid=15264 – Assigned agent via action command
- 2026-06-18T11:26:41Z – claude:opus:implementer:implementer – shell_pid=15264 – Ready for review: EnumerationResult return-type, scanner inference removed, ADR-0021, boundary tests, gates green. Note: test/integration/removal-termination.test.ts updated (forced by the enumerate() contract change; its inline TracksEnumerator double implements the changed port).
- 2026-06-18T11:27:29Z – claude:opus:reviewer:reviewer – shell_pid=18805 – Started review via action command
