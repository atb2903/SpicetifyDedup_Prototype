---
work_package_id: WP02
title: 'Host adapters: classifier gate, shared auth predicate, availability uniformity'
dependencies:
- WP01
requirement_refs:
- FR-001
- FR-006
- FR-007
- NFR-002
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts for this feature were generated on main. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into main unless the human explicitly redirects the landing branch.
subtasks:
- T011
- T012
- T013
- T014
- T015
phase: Phase 2 - Host adapters & UI
assignee: ''
agent: "claude:opus:implementer:implementer"
shell_pid: "258855"
history:
- timestamp: '2026-06-15T11:46:50Z'
  agent: system
  action: Prompt generated via /spec-kitty.tasks
authoritative_surface: src/adapters/
execution_mode: code_change
owned_files:
- src/domain/host-auth.ts
- src/adapters/spicetify-tracks-enumerator.ts
- src/adapters/spicetify-playlists-loader.ts
- test/domain/host-auth.test.ts
- test/adapters/spicetify-tracks-enumerator.test.ts
- test/adapters/spicetify-playlists-loader.test.ts
tags: []
---

# Work Package Prompt: WP02 — Host adapters

## Objective

Make the scan path mixed-content-safe (FR-001), give both host adapters a single
corrected auth-expired predicate (FR-006/FR-007), and unify host-availability
across the adapters by removing the enumerator's unsafe cast (NFR-002). Findings:
**A, D, I**.

Charter gates absolute on `main`: TDD, 100% line/branch coverage, strict TS,
boundary tests for numeric bounds touched, hexagonal layering (domain stays pure).

## Context

- Read: `data-model.md` §6, §9; research R-4, R-5, R-10; `spec.md` scenarios 1/3
  and the edge cases.
- `Spicetify.CosmosAsync` HTTP errors are `{ code, error, message, stack }` — the
  status is under **`code`**, not `status` (ADR-0010). The current adapters inspect
  `status`, so a real 401 never matches via that field.
- Depends on **WP01**: the `host-unavailable` `DetectionErrorReason` member must
  already exist in the pruned union.

## Branch strategy

Planning/base `main`; merge target `main`. WP02's base includes WP01 (its
dependency). Implement in this WP's execution worktree (per `lanes.json`).

Start command (depends on WP01):

```bash
spec-kitty agent action implement WP02 --agent <name>
```

---

### T011 — New `src/domain/host-auth.ts` shared auth-expired predicate

**Purpose**: One pure, single-definition predicate consumed by both adapters
(FR-006/FR-007; consistency per NFR-001's spirit). See `data-model.md` §6, R-5.

**Steps**:
1. Create `src/domain/host-auth.ts` (pure — no React/Zustand/Spicetify, C-004):
   ```ts
   /** True iff `cause` looks like a host auth-expired rejection.
    *  Inspects `code` (the field Spicetify.CosmosAsync populates — ADR-0010),
    *  with message-substring fallbacks. */
   export function looksLikeHostAuthExpired(cause: unknown): boolean;
   ```
   Match on `code === 401`, plus message-substring fallbacks: `"401"`, and
   `"token"` together with (`"expired"` | `"invalid"`).
2. TDD: `test/domain/host-auth.test.ts` — `{ code: 401 }` → true;
   `{ status: 401 }` → **false** (documents the corrected field);
   message-only `"... 401 ..."` → true; `"token expired"` / `"token invalid"` →
   true; unrelated error → false; non-object causes → false.

**Validation**: `host-auth.test.ts` green; module imports nothing from
`adapters`/`ports`/`store`/`ui` (domain purity).

---

### T012 — Enumerator classifier gate (skip non-track items)

**Purpose**: A mixed-content collection must scan to completion; episodes are
excluded, never parsed or deduped (FR-001, A). See `data-model.md` §9, R-10.

**Steps**:
1. In `src/adapters/spicetify-tracks-enumerator.ts` enumerate loop: skip an item
   when `isLocalFile(item)` **or** the item's `type` is not `'track'` (use the
   classifier's leading `type === 'track'` discriminant). A genuine
   `type === 'track'` item still flows through `parseLibraryTrackItem`, which keeps
   its **fail-loud** behaviour on malformed genuine tracks.
2. Do **not** skip on the full shape-classifier — a malformed *genuine* track must
   still trip `parseLibraryTrackItem` (preserves fail-loud + its coverage).
3. TDD: episode without `artists` → skipped (no failure); episode **with** an
   `artists` array → skipped (the key edge case — type check precedes shape parse);
   all-episode collection → empty result, no failure; malformed genuine track →
   `enumerator-failed`.

**Validation**: enumerator test green; mixed fixture scans to completion with only
genuine tracks considered.

---

### T013 — Enumerator `requirePlatform` (remove unsafe cast)

**Purpose**: Fail loud with a typed `host-unavailable` before any host call, and
stop hiding a possibly-`undefined` platform from the compiler (NFR-002, I). See R-4.

**Steps**:
1. Replace the `platform` getter's `globalThis…Platform as TracksEnumeratorPlatform`
   cast with a `requirePlatform()` mirroring the removal/playlists adapters: return
   the injected platform if present, else read `globalThis.Spicetify.Platform`, and
   throw `DetectionError('host-unavailable', …)` (WP01 reason) when it is absent or
   missing the needed API/method — **before** any host call. Remove the `as` cast so
   the compiler sees the real `T | undefined`.
2. TDD: host-absent / missing-method → `host-unavailable` thrown before any host
   touch (matches removal + playlists behaviour, SC-007).

**Validation**: enumerator test green; no `as TracksEnumeratorPlatform` cast
remains; host-absent path produces `host-unavailable`.

---

### T014 — Enumerator auth via shared predicate (`code`)

**Purpose**: A genuine mid-scan token expiry is classified `auth-token-expired`
(FR-006, D).

**Steps**:
1. Replace the enumerator's local `looksLikeAuthExpired` (inspecting `status`) with
   a call to `looksLikeHostAuthExpired` (T011). The `fetchPage` catch maps a true
   result to `DetectionError('auth-token-expired', …)`, else `enumerator-failed`.
2. TDD: `{ code: 401 }` mid-scan → `auth-token-expired`; `{ status: 401 }` →
   `enumerator-failed` (corrected field); message-only variants → auth-expired.

**Validation**: enumerator test green; no local `status`-based auth heuristic
remains in the enumerator.

---

### T015 — Playlists-loader auth via shared predicate

**Purpose**: Same condition, same guidance regardless of entry point (FR-007, D).

**Steps**:
1. In `src/adapters/spicetify-playlists-loader.ts` replace its local
   `looksLikeAuthExpired` (inspecting `status`) with `looksLikeHostAuthExpired`
   (T011). Confirm its existing `host-unavailable` (PlaylistsLoaderError) guard is
   unchanged (NFR-002 already satisfied here).
2. TDD: `test/adapters/spicetify-playlists-loader.test.ts` — `{ code: 401 }` →
   auth-expired outcome consistent with the enumerator; `{ status: 401 }` → not.

**Validation**: playlists-loader test green; both adapters call the same predicate.

---

## Definition of Done

- [ ] All 5 subtasks complete, each test-first.
- [ ] `npm test` green — 100% line + branch coverage, no skips.
- [ ] `npx tsc --noEmit` clean.
- [ ] `host-auth.ts` is pure (no adapter/port/store/ui imports).
- [ ] No `status`-based auth heuristic and no `as`-cast platform access remain in
      either adapter.
- [ ] Mixed-content fixture scans to completion (SC-001); host-absent via the scan
      path → `host-unavailable` (SC-007).
- [ ] WHEN DONE: commit in the worktree, then run the WP's spec-kitty completion
      commands — do not hand off mid-WP.

## Reviewer guidance

- Confirm the skip gate is the `type === 'track'` discriminant (not the full shape
  classifier) so genuine-but-malformed tracks still fail loud.
- Confirm both adapters inspect `code`, and that `{ status: 401 }` is explicitly
  shown **not** to match (regression pin for finding D).
- Confirm `requirePlatform` throws before any host call and the unsafe cast is gone.

## Activity Log

- 2026-06-16T00:02:54Z – claude:opus:implementer:implementer – shell_pid=258855 – Started implementation via action command
- 2026-06-16T00:09:43Z – claude:opus:implementer:implementer – shell_pid=258855 – Ready for review
