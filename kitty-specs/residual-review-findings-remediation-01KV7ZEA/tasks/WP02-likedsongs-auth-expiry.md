---
work_package_id: WP02
title: DRIFT-1 — Liked-Songs count fetch auth-expiry classification
dependencies: []
requirement_refs:
- FR-004
planning_base_branch: main
merge_target_branch: main
branch_strategy: Planning artifacts for this feature were generated on main. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into main unless the human explicitly redirects the landing branch.
base_branch: kitty/mission-residual-review-findings-remediation-01KV7ZEA
base_commit: bd014fd7e410d050e22156101d25f543593945ce
created_at: '2026-06-18T11:30:27.786152+00:00'
subtasks:
- T004
phase: Phase 1 - Detection
assignee: ''
agent: "claude:opus:implementer:implementer"
shell_pid: "20209"
history:
- timestamp: '2026-06-18T00:00:00Z'
  agent: system
  action: Prompt generated via /spec-kitty.tasks
authoritative_surface: src/adapters/spicetify-playlists-loader
execution_mode: code_change
owned_files:
- src/adapters/spicetify-playlists-loader.ts
- test/adapters/spicetify-playlists-loader.test.ts
tags: []
---

# Work Package Prompt: WP02 — DRIFT-1 Liked-Songs auth-expiry

## Objective

Apply the shared `looksLikeHostAuthExpired` predicate to the Liked-Songs **count**
sub-fetch in the playlists loader so an expired host token there yields the same
auth-expired guidance as a rootlist auth-expiry — fully realising the prior
mission's FR-007 (FR-004).

Charter gates absolute on `main`: TDD, 100% coverage, strict TS.

## Context

- The predicate lives at `src/domain/host-auth.ts` (`looksLikeHostAuthExpired`) and
  is already used by the rootlist path and by the enumerator's `fetchPage`
  (`spicetify-tracks-enumerator.ts:403-416`). The Liked-Songs count sub-fetch is
  the one site that still skips it (DRIFT-1).
- Mirror the existing classification shape: an auth-expired rejection becomes the
  typed auth-expired error; any other rejection stays the generic loader failure.
- Read: `src/adapters/spicetify-playlists-loader.ts`, `src/domain/host-auth.ts`,
  the rootlist-fetch classification already in the same file.

## Branch strategy

Planning/base `main`; merge target `main`. No dependencies.

Start command:

```bash
spec-kitty agent action implement WP02 --agent <name>
```

---

### T004 — Classify auth-expiry on the Liked-Songs count fetch

**Purpose**: Symmetric auth-expiry handling across both loader fetches (FR-004).

**Steps**:
1. Wrap the Liked-Songs count fetch's rejection through `looksLikeHostAuthExpired`
   and surface the auth-expired error code, mirroring the rootlist fetch.
2. Keep non-auth rejections on the existing generic failure path.

**Validation (TDD)**: loader stub where the rootlist resolves but the Liked-Songs
count fetch rejects with an auth-expired signal → auth-expired error (not generic).
Symmetry regression: auth-expiry on the rootlist call still classified; a non-auth
rejection on the count fetch still generic.

---

## Definition of Done

- [ ] Subtask complete, test-first.
- [ ] `npx tsc --noEmit` clean; `npm run test:coverage` 100%, no skips; full suite green.
- [ ] Both loader fetch sites classify auth-expiry identically; no behaviour change for non-auth failures.
- [ ] WHEN DONE: commit in the worktree, then run the WP's spec-kitty completion commands — do not hand off mid-WP.

## Reviewer guidance

- Confirm the count fetch routes through the **same** predicate (`looksLikeHostAuthExpired`), not a new bespoke string check (consistency over novelty).
- Confirm a non-auth rejection is unaffected.

## Activity Log

- (pending)
- 2026-06-18T11:30:28Z – claude:opus:implementer:implementer – shell_pid=20209 – Assigned agent via action command
- 2026-06-18T11:32:20Z – claude:opus:implementer:implementer – shell_pid=20209 – Ready for review: Liked-Songs count fetch routes through looksLikeHostAuthExpired; symmetry + non-auth regression tests; gates green
