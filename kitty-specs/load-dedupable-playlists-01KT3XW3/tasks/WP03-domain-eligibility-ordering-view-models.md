---
work_package_id: WP03
title: 'Domain: Eligibility, Ordering, View Models'
dependencies:
- WP01
requirement_refs:
- FR-001
- FR-002
- FR-003
- FR-004
- FR-005
- FR-006
planning_base_branch: get_library
merge_target_branch: get_library
branch_strategy: Planning base = merge target = `get_library`. Each WP's execution worktree is allocated by `spec-kitty agent action implement WP03 --agent <name>`; the lane and workspace path are resolved from `lanes.json` after `finalize-tasks`.
subtasks:
- T009
- T010
- T011
- T012
- T013
- T014
history:
- timestamp: '2026-06-02T11:11:28Z'
  action: created
  by: spec-kitty.tasks
  note: Initial WP scaffold generated from /spec-kitty.tasks for mission load-dedupable-playlists-01KT3XW3.
authoritative_surface: src/domain/eligibility.ts
execution_mode: code_change
mission_id: 01KT3XW3AWY8W0YJKCE9TYNQKX
mission_slug: load-dedupable-playlists-01KT3XW3
owned_files:
- src/domain/eligibility.ts
- src/domain/ordering.ts
- src/domain/view-models.ts
- test/domain/eligibility.test.ts
- test/domain/ordering.test.ts
- test/domain/view-models.test.ts
tags: []
---

# WP03 — Domain: Eligibility, Ordering, View Models

## Objective

Land the three pure-domain modules that decide *what* gets rendered and *in what order*:

- **`eligibility.ts`** — predicate `isEligible(c: RawCollection): boolean` implementing FR-001 / FR-002 / FR-004.
- **`ordering.ts`** — function `orderRootlist(items: RawCollection[]): RawCollection[]` that preserves host-native order today and is named so future iterations can extend it without touching consumers (FR-006).
- **`view-models.ts`** — defines the domain types (`RawCollection`, `LikedSongsSummary`, `OwnerIdentity`, `CollectionKind`, `CollectionViewModel`) and the `toViewModels(eligible, likedSongs): CollectionViewModel[]` transform that pins Liked Songs first and shapes each row for the UI (FR-003, FR-005, FR-006). Also exports `isRawCollection` — the classifier predicate the adapter uses to pre-check Platform responses (charter: fail-loud with paired classifier).

Every file in this WP is pure TypeScript: no React, no Zustand, no Spicetify. Tests run in the Node environment without `happy-dom`.

## Branch Strategy

Planning base = merge target = `get_library`. The execution agent invokes `spec-kitty agent action implement WP03 --agent <name>`; the runtime resolves the lane and workspace path from `lanes.json`. No git operations are performed by the agent — the user owns commits.

## Context

Forward references this WP introduces (consumed by WP04+):

- `RawCollection` — what the port returns for each non-Liked-Songs row before eligibility filtering.
- `LikedSongsSummary` — what the port returns for the Liked Songs row (just the track count in this iteration).
- `CollectionViewModel` — what the LoadedView iterates over.
- `OwnerIdentity` — what `PlaylistRow` renders as the per-row label.

All types and validation rules are specified in [`../data-model.md`](../data-model.md) — re-read §2, §3, §4, §5 before starting. This WP implements them faithfully; if anything in this prompt disagrees with `data-model.md`, the data-model wins.

WP02's `LoadState<Item>` is generic; WP06's store will specialize it as `LoadState<CollectionViewModel>`. WP03 owns the `CollectionViewModel` type but does not need to import from WP02.

## Detailed guidance per subtask

### T009 — TDD `src/domain/eligibility.ts` — eligibility predicate

**Purpose**: Implement the rule that decides whether a given `RawCollection` appears in the loaded list. From the spec:

> Owned by the user OR collaborative AND the user has edit rights OR is the Liked Songs collection.

Liked Songs is handled separately (it isn't a `RawCollection`). So the predicate over a `RawCollection` simplifies to:

> `isOwnedByMe` OR (`isCollaborative` AND `canEdit`).

**Steps**:

1. **Failing test first**. Open `test/domain/eligibility.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import { isEligible } from '../../src/domain/eligibility';
   import type { RawCollection } from '../../src/domain/view-models';

   function row(overrides: Partial<RawCollection>): RawCollection {
     return {
       uri: 'spotify:playlist:0',
       name: 'Test',
       owner: { kind: 'self', displayName: 'me' },
       trackCount: 0,
       imageUrl: null,
       isOwnedByMe: false,
       isCollaborative: false,
       canEdit: false,
       ...overrides,
     };
   }

   describe('isEligible', () => {
     it('owned by me → eligible', () => {
       expect(isEligible(row({ isOwnedByMe: true }))).toBe(true);
     });
   });
   ```

2. Run, watch fail (both because `eligibility.ts` doesn't exist AND because `view-models.ts`'s `RawCollection` doesn't exist yet — see T011). The order within this WP: do T011 (types) before T009 (which depends on the types). But the test is what fails first. Land minimum: a placeholder `view-models.ts` declaring just `RawCollection` + `OwnerIdentity` types unblocks T009. Then expand `view-models.ts` in T011.

3. Write `src/domain/eligibility.ts`:

   ```ts
   /**
    * Decides whether a single RawCollection appears in the loaded list.
    *
    * Per spec FR-001/FR-002/FR-004: include playlists the user owns, and
    * collaborative playlists where the user has edit rights. Exclude
    * everything else (followed playlists, curated playlists, other users'
    * playlists the user cannot mutate).
    *
    * The Liked Songs collection is NOT a RawCollection and is handled
    * separately by the view-model transform; this predicate doesn't see it.
    */
   import type { RawCollection } from './view-models';

   export function isEligible(c: RawCollection): boolean {
     if (c.isOwnedByMe) return true;
     if (c.isCollaborative && c.canEdit) return true;
     return false;
   }
   ```

4. Add the full truth table to the test file:

   ```ts
   describe('isEligible truth table', () => {
     const cases = [
       { isOwnedByMe: false, isCollaborative: false, canEdit: false, expected: false },
       { isOwnedByMe: false, isCollaborative: false, canEdit: true,  expected: false },
       { isOwnedByMe: false, isCollaborative: true,  canEdit: false, expected: false },
       { isOwnedByMe: false, isCollaborative: true,  canEdit: true,  expected: true  },
       { isOwnedByMe: true,  isCollaborative: false, canEdit: false, expected: true  },
       { isOwnedByMe: true,  isCollaborative: false, canEdit: true,  expected: true  },
       { isOwnedByMe: true,  isCollaborative: true,  canEdit: false, expected: true  },
       { isOwnedByMe: true,  isCollaborative: true,  canEdit: true,  expected: true  },
     ];

     for (const c of cases) {
       const label = `owned=${c.isOwnedByMe} collab=${c.isCollaborative} canEdit=${c.canEdit}`;
       it(`${label} → ${c.expected}`, () => {
         expect(isEligible(row(c))).toBe(c.expected);
       });
     }
   });
   ```

**Files**: `src/domain/eligibility.ts` (new), `test/domain/eligibility.test.ts` (new).

**Validation**:

- [ ] All 8 truth table rows tested.
- [ ] No `Spicetify` / `react` / `zustand` imports.
- [ ] 100 % coverage.

### T010 — TDD `src/domain/ordering.ts` — order-preserving function

**Purpose**: Today, the host's native rootlist order is exactly what the page should show (FR-006 says inherit native order; Liked Songs pinning is the only override, handled by `toViewModels`). So this function is an identity function — but exporting it as a named function gives future iterations a stable extension point (e.g. "sort alphabetically" toggle, "recently modified first" preference) without touching consumers.

**Steps**:

1. **Failing test first**:

   ```ts
   import { describe, it, expect } from 'vitest';
   import { orderRootlist } from '../../src/domain/ordering';
   import type { RawCollection } from '../../src/domain/view-models';

   describe('orderRootlist', () => {
     it('preserves input order', () => {
       const a = row({ uri: 'spotify:playlist:a', name: 'A' });
       const b = row({ uri: 'spotify:playlist:b', name: 'B' });
       const c = row({ uri: 'spotify:playlist:c', name: 'C' });
       expect(orderRootlist([a, b, c])).toEqual([a, b, c]);
     });
   });
   ```

2. Implement:

   ```ts
   /**
    * Orders the host rootlist for rendering. Today this is the identity
    * function: the host already returns rootlist items in the user's native
    * library order, and FR-006 says we honor that. Exported as a named
    * function so future iterations (alphabetical-sort toggle, etc.) can
    * extend the ordering rule without touching call sites.
    *
    * Liked Songs pinning is NOT done here — toViewModels owns that, since
    * Liked Songs is a separate input (LikedSongsSummary), not a member of
    * the RawCollection array.
    */
   import type { RawCollection } from './view-models';

   export function orderRootlist(items: RawCollection[]): RawCollection[] {
     return [...items];
   }
   ```

3. Note the `[...items]` — return a shallow copy, not the input array, so callers don't accidentally mutate the original list. Add a test:

   ```ts
   it('returns a new array (callers may safely mutate the result)', () => {
     const input = [row({ uri: 'spotify:playlist:a' })];
     const output = orderRootlist(input);
     expect(output).not.toBe(input);
   });

   it('returns an empty array when given an empty array', () => {
     expect(orderRootlist([])).toEqual([]);
   });
   ```

**Files**: `src/domain/ordering.ts` (new), `test/domain/ordering.test.ts` (new).

**Validation**:

- [ ] Identity behavior preserved on a non-trivial input.
- [ ] Returned array is not the same reference as the input.
- [ ] Empty input handled.
- [ ] 100 % coverage.

### T011 — Define domain types in `src/domain/view-models.ts`

**Purpose**: Declare the types every other domain/store/UI module imports.

**Steps**:

1. Create `src/domain/view-models.ts` with the types from `data-model.md` §2–§5:

   ```ts
   /** A row's discriminator for rendering. */
   export type CollectionKind = 'playlist' | 'liked-songs';

   /** Who owns a collection — drives the per-row owner label. */
   export type OwnerIdentity =
     | { kind: 'self'; displayName: string }
     | { kind: 'other'; displayName: string }
     | { kind: 'system-library' };

   /**
    * Raw rootlist item as returned by the port. Eligibility, ordering, and
    * view-model shaping all act on this type. Validated at the adapter
    * boundary; trusted by domain consumers.
    */
   export type RawCollection = {
     uri: string;
     name: string;
     owner: OwnerIdentity;
     trackCount: number;
     imageUrl: string | null;
     isOwnedByMe: boolean;
     isCollaborative: boolean;
     canEdit: boolean;
   };

   /** Liked Songs summary. Only the track count is needed in this iteration. */
   export type LikedSongsSummary = {
     trackCount: number;
   };

   /** A single row in the rendered list. */
   export type CollectionViewModel = {
     key: string;
     kind: CollectionKind;
     displayName: string;
     owner: OwnerIdentity;
     trackCount: number;
     imageUrl: string | null;
   };
   ```

2. Add JSDoc per the charter docs gate. Re-state the validation rules from `data-model.md` §3 as JSDoc on `RawCollection` so the adapter author has them inline.

**Files**: `src/domain/view-models.ts` (new — types only at this subtask).

**Validation**:

- [ ] `tsc --noEmit` clean.
- [ ] JSDoc on every exported type.
- [ ] No imports of anything other than `./errors` (which it doesn't need yet).

### T012 — TDD `toViewModels` happy path

**Purpose**: The function that converts an eligible-and-ordered `RawCollection[]` plus the `LikedSongsSummary` into the array of `CollectionViewModel`s the UI iterates.

**Steps**:

1. **Failing test first**:

   ```ts
   import { describe, it, expect } from 'vitest';
   import { toViewModels } from '../../src/domain/view-models';
   import type { RawCollection, LikedSongsSummary } from '../../src/domain/view-models';

   const liked: LikedSongsSummary = { trackCount: 42 };
   const playlist: RawCollection = {
     uri: 'spotify:playlist:abc',
     name: 'My Playlist',
     owner: { kind: 'self', displayName: 'me' },
     trackCount: 10,
     imageUrl: 'https://i.scdn.co/image/abc',
     isOwnedByMe: true,
     isCollaborative: false,
     canEdit: false,
   };

   describe('toViewModels', () => {
     it('pins Liked Songs first then yields each playlist', () => {
       const result = toViewModels([playlist], liked);
       expect(result).toHaveLength(2);
       expect(result[0].kind).toBe('liked-songs');
       expect(result[0].key).toBe('liked-songs');
       expect(result[0].displayName).toBe('Liked Songs');
       expect(result[0].owner).toEqual({ kind: 'system-library' });
       expect(result[0].trackCount).toBe(42);
       expect(result[1].kind).toBe('playlist');
       expect(result[1].key).toBe(playlist.uri);
       expect(result[1].displayName).toBe(playlist.name);
       expect(result[1].owner).toEqual(playlist.owner);
       expect(result[1].trackCount).toBe(playlist.trackCount);
       expect(result[1].imageUrl).toBe(playlist.imageUrl);
     });
   });
   ```

2. Implement in `src/domain/view-models.ts`:

   ```ts
   export function toViewModels(
     eligible: RawCollection[],
     likedSongs: LikedSongsSummary,
   ): CollectionViewModel[] {
     const likedRow: CollectionViewModel = {
       key: 'liked-songs',
       kind: 'liked-songs',
       displayName: 'Liked Songs',
       owner: { kind: 'system-library' },
       trackCount: likedSongs.trackCount,
       imageUrl: null,
     };
     const playlistRows: CollectionViewModel[] = eligible.map((c) => ({
       key: c.uri,
       kind: 'playlist',
       displayName: c.name,
       owner: c.owner,
       trackCount: c.trackCount,
       imageUrl: c.imageUrl,
     }));
     return [likedRow, ...playlistRows];
   }
   ```

**Files**: `src/domain/view-models.ts` (extend), `test/domain/view-models.test.ts` (new).

### T013 — Test view-model edge cases

**Purpose**: Cover the spec's edge cases — placeholder image, long names, owner variants, empty input.

**Steps**: Add to `test/domain/view-models.test.ts`:

```ts
describe('toViewModels edge cases', () => {
  it('passes through null imageUrl unchanged (UI substitutes the placeholder)', () => {
    const p = { ...playlist, imageUrl: null };
    const result = toViewModels([p], liked);
    expect(result[1].imageUrl).toBe(null);
  });

  it('preserves very long names verbatim (UI is responsible for truncation styling)', () => {
    const longName = 'A'.repeat(500);
    const p = { ...playlist, name: longName };
    const result = toViewModels([p], liked);
    expect(result[1].displayName).toBe(longName);
  });

  it('preserves owner identity variants', () => {
    const selfOwned = { ...playlist, owner: { kind: 'self' as const, displayName: 'me' } };
    const otherOwned = { ...playlist, uri: 'spotify:playlist:xyz', owner: { kind: 'other' as const, displayName: 'friend' } };
    const result = toViewModels([selfOwned, otherOwned], liked);
    expect(result[1].owner).toEqual({ kind: 'self', displayName: 'me' });
    expect(result[2].owner).toEqual({ kind: 'other', displayName: 'friend' });
  });

  it('with zero eligible playlists, returns only the Liked Songs row', () => {
    const result = toViewModels([], liked);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('liked-songs');
  });

  it('handles a Liked Songs trackCount of 0 (still pinned)', () => {
    const result = toViewModels([], { trackCount: 0 });
    expect(result[0].trackCount).toBe(0);
    expect(result[0].kind).toBe('liked-songs');
  });

  it('handles a large playlist count (NFR-002 headroom)', () => {
    const many = Array.from({ length: 1000 }, (_, i) => ({
      ...playlist,
      uri: `spotify:playlist:${i}`,
      name: `Playlist ${i}`,
    }));
    const result = toViewModels(many, liked);
    expect(result).toHaveLength(1001);
    expect(result[0].kind).toBe('liked-songs');
    expect(result.slice(1).every((r) => r.kind === 'playlist')).toBe(true);
  });
});
```

**Validation**:

- [ ] 100 % coverage on `view-models.ts`.
- [ ] All edge cases from `spec.md` "Edge cases" that touch view models are represented.
- [ ] Boundary tests for `LikedSongsSummary.trackCount` (0, 1, large) are present.

### T014 — TDD `isRawCollection` classifier predicate

**Purpose**: The charter requires "fail-loud parsing paired with a classifier predicate so callers can pre-check". The adapter (WP05) will use `isRawCollection` to pre-check before triggering a throw.

**Steps**:

1. **Failing test first** in `test/domain/view-models.test.ts`:

   ```ts
   import { isRawCollection } from '../../src/domain/view-models';

   describe('isRawCollection', () => {
     it('accepts a fully-shaped RawCollection', () => {
       expect(isRawCollection(playlist)).toBe(true);
     });

     it('rejects null', () => { expect(isRawCollection(null)).toBe(false); });
     it('rejects undefined', () => { expect(isRawCollection(undefined)).toBe(false); });
     it('rejects a string', () => { expect(isRawCollection('x')).toBe(false); });

     it('rejects an object missing isOwnedByMe', () => {
       const { isOwnedByMe, ...rest } = playlist;
       expect(isRawCollection(rest)).toBe(false);
     });

     it('rejects an object where trackCount is negative', () => {
       expect(isRawCollection({ ...playlist, trackCount: -1 })).toBe(false);
     });
   });
   ```

2. Add to `src/domain/view-models.ts`:

   ```ts
   /**
    * Classifier predicate for RawCollection. The adapter uses this to
    * pre-check Platform responses before triggering a typed-error throw.
    * Per charter: "fail loud + paired classifier".
    *
    * Returns true if `x` structurally matches RawCollection — every
    * required field present with the right type, every numeric bound
    * satisfied (trackCount ≥ 0).
    */
   export function isRawCollection(x: unknown): x is RawCollection {
     if (typeof x !== 'object' || x === null) return false;
     const r = x as Record<string, unknown>;
     return (
       typeof r.uri === 'string' && r.uri.length > 0 &&
       typeof r.name === 'string' &&
       isOwnerIdentity(r.owner) &&
       typeof r.trackCount === 'number' &&
       Number.isInteger(r.trackCount) &&
       r.trackCount >= 0 &&
       (r.imageUrl === null || typeof r.imageUrl === 'string') &&
       typeof r.isOwnedByMe === 'boolean' &&
       typeof r.isCollaborative === 'boolean' &&
       typeof r.canEdit === 'boolean'
     );
   }

   function isOwnerIdentity(x: unknown): x is OwnerIdentity {
     if (typeof x !== 'object' || x === null) return false;
     const o = x as Record<string, unknown>;
     if (o.kind === 'self' || o.kind === 'other') {
       return typeof o.displayName === 'string' && o.displayName.length > 0;
     }
     if (o.kind === 'system-library') return true;
     return false;
   }
   ```

3. Add boundary tests for `trackCount`: −1 (rejected), 0 (accepted), 1 (accepted), large (accepted).

**Files**: `src/domain/view-models.ts` (extend), `test/domain/view-models.test.ts` (extend).

**Validation**:

- [ ] `isRawCollection` rejects all malformed shapes listed.
- [ ] `isRawCollection` accepts valid shapes.
- [ ] Numeric bound on `trackCount` (negative rejected, 0 accepted) is covered.
- [ ] 100 % coverage on `view-models.ts`.

## Test strategy

Pure-logic TDD. All tests run under the default Vitest config (no `happy-dom` needed; remove the per-file environment annotation if Vitest defaults to `happy-dom` per `vitest.config.ts`).

Per the charter's boundary-testing rule: covered numeric bounds are `trackCount` (negative / 0 / 1 / large) and array lengths (0 / 1 / 2 / 1000).

## Definition of Done

- [ ] `src/domain/eligibility.ts`, `ordering.ts`, `view-models.ts` all exist with JSDoc.
- [ ] All test files green at 100 % coverage for their subjects.
- [ ] Architecture test still green; no React/Zustand/Spicetify imports in `src/domain/**`.
- [ ] `tsc --noEmit` clean.

## Risks

- **Eligibility predicate ambiguity for `isCollaborative=true, canEdit=false`.** Spec says "collaborative AND can edit" — both must be true. Make sure the predicate uses `&&`, not `||`. The truth table tests catch this.
- **Liked Songs `imageUrl`.** The view-model sets it to `null` regardless — the UI renders a fixed heart icon. Don't accidentally wire it to some image URL from the LikedSongsSummary (it doesn't have one in this iteration).
- **Empty `displayName`.** `isRawCollection` rejects empty `displayName` for `self`/`other`. Confirm the adapter (WP05) doesn't strip whitespace into emptiness silently — it should throw with `'rootlist-item-missing-owner'`.

## Reviewer guidance

- Run `npm run test:coverage`. Confirm 100 % on all three new source files.
- Open each source file in turn and verify it has JSDoc on every export.
- Confirm `src/domain/view-models.ts` matches `data-model.md` §2–§5 exactly. Types must agree letter-for-letter.
- Confirm `eligibility.ts` is the boolean predicate, nothing more. No host-shape checks in here — those belong in the adapter.
- Confirm `ordering.ts` returns a shallow copy of its input (callers shouldn't accidentally mutate the original).
