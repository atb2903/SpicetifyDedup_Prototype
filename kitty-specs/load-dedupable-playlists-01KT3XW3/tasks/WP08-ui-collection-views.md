---
work_package_id: WP08
title: 'UI: Collection Views (PlaylistRow / LikedSongsRow / LoadedView)'
dependencies:
- WP06
requirement_refs:
- FR-003
- FR-005
- FR-006
planning_base_branch: get_library
merge_target_branch: get_library
branch_strategy: Planning artifacts for this feature were generated on get_library. During /spec-kitty.implement this WP may branch from a dependency-specific base, but completed changes must merge back into get_library unless the human explicitly redirects the landing branch.
subtasks:
- T032
- T033
- T034
history:
- timestamp: '2026-06-02T11:11:28Z'
  action: created
  by: spec-kitty.tasks
  note: Initial WP scaffold generated from /spec-kitty.tasks for mission load-dedupable-playlists-01KT3XW3.
authoritative_surface: src/ui/PlaylistRow.tsx
execution_mode: code_change
mission_id: 01KT3XW3AWY8W0YJKCE9TYNQKX
mission_slug: load-dedupable-playlists-01KT3XW3
owned_files:
- src/ui/PlaylistRow.tsx
- src/ui/LikedSongsRow.tsx
- src/ui/LoadedView.tsx
- test/ui/PlaylistRow.test.tsx
- test/ui/LikedSongsRow.test.tsx
- test/ui/LoadedView.test.tsx
tags: []
---

# WP08 — UI: Collection Views (PlaylistRow / LikedSongsRow / LoadedView)

## Objective

Implement the three React components that render the loaded list:

- `PlaylistRow` — one playlist's row. Displays name, owner identity, track count, cover (or placeholder when `imageUrl === null`). Implements FR-005 for playlist entries; SC-3.
- `LikedSongsRow` — the pinned Liked Songs row. Distinct from `PlaylistRow`: system-row styling, fixed "Liked Songs" / "Your Library" copy. Implements FR-003 (pinning) for the row itself.
- `LoadedView` — iterates `CollectionViewModel[]` from the store. Dispatches to `LikedSongsRow` for `kind === 'liked-songs'`, to `PlaylistRow` for `kind === 'playlist'`. Preserves order; Liked Songs always renders first because the view-model transform (WP03) puts it first. Implements FR-003 + FR-006.

Each component is small, presentational, accessible. Consumes only domain types and (for `LoadedView`) the store's hook.

## Branch Strategy

Planning base = merge target = `get_library`. The execution agent invokes `spec-kitty agent action implement WP08 --agent <name>`; the runtime resolves the lane and workspace path from `lanes.json`. No git operations are performed by the agent — the user owns commits.

## Context

Inputs to these components are entirely typed: `CollectionViewModel`, `OwnerIdentity`, etc., all from `src/domain/view-models.ts`. No host-shape handling here — the adapter (WP05) normalized everything.

Cover-image fallback: when `imageUrl === null`, render a deterministic placeholder. Use a CSS background or a fixed SVG; do not load any external asset. The placeholder lives in the component, not in a separate file.

For tests: `LoadedView`'s rendering happens through the store's hook, so its tests construct a store wired to a fake loader, await `triggerLoad`, then render `<LoadedView>` inside the provider. `PlaylistRow` and `LikedSongsRow` take their view models as props, so their tests don't need the store at all — simpler.

## Detailed guidance per subtask

### T032 — TDD `PlaylistRow` + test

**Purpose**: Render one playlist row. Cover the owner-identity variants (`self`, `other`), the placeholder image fallback, and long-name passthrough.

**Steps**:

1. Test first. Create `test/ui/PlaylistRow.test.tsx`:

   ```tsx
   import { describe, it, expect } from 'vitest';
   import { render, screen } from '@testing-library/react';
   import React from 'react';
   import { PlaylistRow } from '../../src/ui/PlaylistRow';
   import type { CollectionViewModel } from '../../src/domain/view-models';

   const sample = (overrides: Partial<CollectionViewModel> = {}): CollectionViewModel => ({
     key: 'spotify:playlist:abc',
     kind: 'playlist',
     displayName: 'My Playlist',
     owner: { kind: 'self', displayName: 'me' },
     trackCount: 10,
     imageUrl: 'https://i.scdn.co/image/abc',
     ...overrides,
   });

   describe('PlaylistRow', () => {
     it('shows the playlist name', () => {
       render(<PlaylistRow row={sample()} />);
       expect(screen.getByText('My Playlist')).toBeInTheDocument();
     });

     it('shows the track count', () => {
       render(<PlaylistRow row={sample({ trackCount: 10 })} />);
       expect(screen.getByText(/10 tracks?/i)).toBeInTheDocument();
     });

     it('shows "by you" for self-owned playlists', () => {
       render(<PlaylistRow row={sample({ owner: { kind: 'self', displayName: 'me' } })} />);
       expect(screen.getByText(/by you/i)).toBeInTheDocument();
     });

     it('shows the owner display name for other-owned (collaborative) playlists', () => {
       render(<PlaylistRow row={sample({ owner: { kind: 'other', displayName: 'friend' } })} />);
       expect(screen.getByText(/by friend/i)).toBeInTheDocument();
     });

     it('renders the cover image when imageUrl is provided', () => {
       render(<PlaylistRow row={sample({ imageUrl: 'https://example.com/cover.jpg' })} />);
       const img = screen.getByRole('img');
       expect(img).toHaveAttribute('src', 'https://example.com/cover.jpg');
     });

     it('renders a placeholder when imageUrl is null', () => {
       render(<PlaylistRow row={sample({ imageUrl: null })} />);
       // Placeholder is a deterministic element. Two acceptable patterns:
       // (a) <img> with src="" and aria-label="No cover image"
       // (b) <div data-testid="cover-placeholder">
       expect(screen.getByLabelText(/no cover image/i)).toBeInTheDocument();
     });

     it('handles very long names without overflowing the row layout (passes through verbatim)', () => {
       const long = 'A'.repeat(500);
       render(<PlaylistRow row={sample({ displayName: long })} />);
       expect(screen.getByText(long)).toBeInTheDocument();
     });

     it('handles a track count of 0', () => {
       render(<PlaylistRow row={sample({ trackCount: 0 })} />);
       expect(screen.getByText(/0 tracks?/i)).toBeInTheDocument();
     });

     it('handles a track count of 1 (singular form)', () => {
       render(<PlaylistRow row={sample({ trackCount: 1 })} />);
       expect(screen.getByText(/1 track\b/i)).toBeInTheDocument();
     });
   });
   ```

2. Implementation:

   ```tsx
   /**
    * One playlist row in the loaded list. Presentational only.
    * Inputs are all view-model fields; no host shape handling here.
    */
   import React from 'react';
   import type { CollectionViewModel, OwnerIdentity } from '../domain/view-models';

   type Props = { row: CollectionViewModel };

   export function PlaylistRow({ row }: Props) {
     return (
       <li className="dedup-row dedup-row--playlist">
         <Cover imageUrl={row.imageUrl} />
         <div className="dedup-row__text">
           <span className="dedup-row__name">{row.displayName}</span>
           <span className="dedup-row__owner">{ownerLabel(row.owner)}</span>
         </div>
         <span className="dedup-row__count">{formatTrackCount(row.trackCount)}</span>
       </li>
     );
   }

   function ownerLabel(owner: OwnerIdentity): string {
     if (owner.kind === 'self') return 'by you';
     if (owner.kind === 'other') return `by ${owner.displayName}`;
     return 'Your Library';   // 'system-library' — handled by LikedSongsRow but defensive here
   }

   function formatTrackCount(n: number): string {
     return n === 1 ? '1 track' : `${n} tracks`;
   }

   function Cover({ imageUrl }: { imageUrl: string | null }) {
     if (imageUrl) {
       return <img className="dedup-row__cover" src={imageUrl} alt="" />;
     }
     return (
       <div
         className="dedup-row__cover dedup-row__cover--placeholder"
         role="img"
         aria-label="No cover image"
       />
     );
   }
   ```

**Files**: `src/ui/PlaylistRow.tsx` (new), `test/ui/PlaylistRow.test.tsx` (new).

**Validation**:

- [ ] Boundary tests for `trackCount`: 0 (zero tracks), 1 (singular), nominal (10), large (1000).
- [ ] Owner labels for `self` ("by you") and `other` ("by {name}").
- [ ] Placeholder rendered when `imageUrl === null`.

### T033 — TDD `LikedSongsRow` + test

**Purpose**: Render the pinned Liked Songs row — visually distinct from `PlaylistRow`, fixed copy.

**Steps**:

1. Test:

   ```tsx
   describe('LikedSongsRow', () => {
     it('renders "Liked Songs" as the name', () => {
       const row: CollectionViewModel = {
         key: 'liked-songs',
         kind: 'liked-songs',
         displayName: 'Liked Songs',
         owner: { kind: 'system-library' },
         trackCount: 42,
         imageUrl: null,
       };
       render(<LikedSongsRow row={row} />);
       expect(screen.getByText('Liked Songs')).toBeInTheDocument();
     });

     it('renders "Your Library" as the owner label', () => {
       const row: CollectionViewModel = { /* … */ owner: { kind: 'system-library' } };
       render(<LikedSongsRow row={row} />);
       expect(screen.getByText('Your Library')).toBeInTheDocument();
     });

     it('renders the heart icon (system-library marker)', () => {
       const row: CollectionViewModel = { /* … */ };
       render(<LikedSongsRow row={row} />);
       expect(screen.getByLabelText(/liked songs icon/i)).toBeInTheDocument();
     });

     it('has the "pinned" CSS class for distinct styling', () => {
       const row: CollectionViewModel = { /* … */ };
       const { container } = render(<LikedSongsRow row={row} />);
       expect(container.querySelector('.dedup-row--liked-songs')).not.toBeNull();
     });

     it('handles 0 saved tracks (still pinned)', () => {
       const row: CollectionViewModel = { /* … */ trackCount: 0 };
       render(<LikedSongsRow row={row} />);
       expect(screen.getByText(/0 tracks?/i)).toBeInTheDocument();
     });
   });
   ```

2. Implementation:

   ```tsx
   /**
    * The pinned Liked Songs row. Visually distinct from PlaylistRow.
    * Fixed copy: "Liked Songs" / "Your Library". Uses a heart icon as the
    * visual marker instead of a cover image.
    */
   import React from 'react';
   import type { CollectionViewModel } from '../domain/view-models';

   type Props = { row: CollectionViewModel };

   export function LikedSongsRow({ row }: Props) {
     return (
       <li className="dedup-row dedup-row--liked-songs">
         <span
           className="dedup-row__heart"
           role="img"
           aria-label="Liked Songs icon"
         >
           ♥
         </span>
         <div className="dedup-row__text">
           <span className="dedup-row__name">Liked Songs</span>
           <span className="dedup-row__owner">Your Library</span>
         </div>
         <span className="dedup-row__count">
           {row.trackCount === 1 ? '1 track' : `${row.trackCount} tracks`}
         </span>
       </li>
     );
   }
   ```

3. Note: the heart `♥` glyph is fine for a first cut; a future iteration can swap to Spotify's `Spicetify.ReactComponent.IconComponent` with the `'heart'` icon name. The current code is testable and theme-respectful.

**Files**: `src/ui/LikedSongsRow.tsx` (new), `test/ui/LikedSongsRow.test.tsx` (new).

**Validation**:

- [ ] "Liked Songs" name; "Your Library" owner label.
- [ ] Distinct CSS class (`dedup-row--liked-songs`).
- [ ] Heart icon present with accessible label.
- [ ] Boundary tests for `trackCount`: 0, 1, large.

### T034 — TDD `LoadedView` + test

**Purpose**: Iterate `CollectionViewModel[]` from the store; dispatch each item to the right row variant; preserve order.

**Steps**:

1. Test:

   ```tsx
   import { LoadedView } from '../../src/ui/LoadedView';
   import { createPlaylistsStore, PlaylistsStoreProvider } from '../../src/store/playlists-store';
   import { FakePlaylistsLoader } from '../../src/adapters/fake-playlists-loader';
   import type { RawCollection } from '../../src/domain/view-models';

   const pl = (uri: string, name: string): RawCollection => ({
     uri, name, owner: { kind: 'self', displayName: 'me' }, trackCount: 1,
     imageUrl: null, isOwnedByMe: true, isCollaborative: false, canEdit: false,
   });

   describe('LoadedView', () => {
     it('renders Liked Songs first, then each eligible playlist in order', async () => {
       const loader = new FakePlaylistsLoader({
         kind: 'success',
         playlists: [pl('spotify:playlist:a', 'A'), pl('spotify:playlist:b', 'B'), pl('spotify:playlist:c', 'C')],
         likedSongs: { trackCount: 42 },
       });
       const store = createPlaylistsStore(loader);
       await store.getState().triggerLoad();
       const { container } = render(<PlaylistsStoreProvider store={store}><LoadedView /></PlaylistsStoreProvider>);
       const names = Array.from(container.querySelectorAll('.dedup-row__name')).map((el) => el.textContent);
       expect(names).toEqual(['Liked Songs', 'A', 'B', 'C']);
     });

     it('renders the LikedSongsRow component (distinct class) for the first row', async () => {
       const loader = new FakePlaylistsLoader({
         kind: 'success',
         playlists: [pl('spotify:playlist:a', 'A')],
         likedSongs: { trackCount: 1 },
       });
       const store = createPlaylistsStore(loader);
       await store.getState().triggerLoad();
       const { container } = render(<PlaylistsStoreProvider store={store}><LoadedView /></PlaylistsStoreProvider>);
       const firstRow = container.querySelector('.dedup-row');
       expect(firstRow?.classList.contains('dedup-row--liked-songs')).toBe(true);
     });

     it('returns null when the store is not in the loaded state', () => {
       const loader = new FakePlaylistsLoader({ kind: 'success', playlists: [], likedSongs: { trackCount: 0 } });
       const store = createPlaylistsStore(loader);
       // Don't trigger; store is idle. LoadedView should render nothing.
       const { container } = render(<PlaylistsStoreProvider store={store}><LoadedView /></PlaylistsStoreProvider>);
       expect(container.firstChild).toBeNull();
     });

     it('renders 1000 rows without crashing (NFR-002 headroom)', async () => {
       const many = Array.from({ length: 1000 }, (_, i) => pl(`spotify:playlist:${i}`, `P${i}`));
       const loader = new FakePlaylistsLoader({ kind: 'success', playlists: many, likedSongs: { trackCount: 0 } });
       const store = createPlaylistsStore(loader);
       await store.getState().triggerLoad();
       const { container } = render(<PlaylistsStoreProvider store={store}><LoadedView /></PlaylistsStoreProvider>);
       expect(container.querySelectorAll('.dedup-row').length).toBe(1001);   // Liked Songs + 1000
     });
   });
   ```

2. Implementation:

   ```tsx
   /**
    * The loaded-state view. Iterates CollectionViewModel[] from the store
    * and dispatches each row to the correct variant. Order is preserved
    * because the view-model transform (WP03) already pinned Liked Songs
    * first.
    */
   import React from 'react';
   import { usePlaylistsStore } from '../store/playlists-store';
   import { PlaylistRow } from './PlaylistRow';
   import { LikedSongsRow } from './LikedSongsRow';

   export function LoadedView() {
     const loadState = usePlaylistsStore((s) => s.loadState);
     if (loadState.kind !== 'loaded') return null;
     return (
       <ul className="dedup-list">
         {loadState.items.map((row) =>
           row.kind === 'liked-songs'
             ? <LikedSongsRow key={row.key} row={row} />
             : <PlaylistRow key={row.key} row={row} />,
         )}
       </ul>
     );
   }
   ```

**Files**: `src/ui/LoadedView.tsx` (new), `test/ui/LoadedView.test.tsx` (new).

**Validation**:

- [ ] Renders nothing when not in `loaded` state.
- [ ] Order preserved.
- [ ] Liked Songs row uses the dedicated component.
- [ ] 1000-row render does not crash (NFR-002 headroom).

## Test strategy

`@testing-library/react` + `happy-dom`. `PlaylistRow` and `LikedSongsRow` are tested in isolation by passing view models as props. `LoadedView` is tested by wiring a store + provider + fake loader.

Per the charter boundary-testing rule: covered numeric bounds in this WP are `trackCount` (0 / 1 / nominal / 1000) on both row components and `items.length` (0 via "not loaded", 1, 1000) on `LoadedView`.

## Definition of Done

- [ ] Three view components with JSDoc on every export.
- [ ] All test files green; 100 % coverage on each component.
- [ ] Order preservation verified (1000-row test); LikedSongsRow rendered first via the dedicated component.
- [ ] No component imports from `src/adapters/**` or `src/ports/**`.
- [ ] Architecture test green; `tsc --noEmit` clean.

## Risks

- **Test queries on duplicate text.** If two playlists are named identically, `screen.getByText('X')` will throw. Use unique names in fixtures or switch to `screen.getAllByText`.
- **Heart glyph rendering in `happy-dom`.** A literal `♥` character renders fine; if you prefer an SVG, swap freely.
- **`role="img"` on the placeholder.** Mandatory for accessibility, but multiple `role="img"` elements in one row (cover placeholder + heart) could confuse screen-reader users. Use distinct `aria-label`s.
- **`LoadedView` re-render cost on large lists.** With 1000 items, React still mounts 1001 DOM nodes per row. NFR-002 says "without crashing" — not "blazingly fast". If the test is sluggish, consider memoizing the row components with `React.memo`, but only if measurable benefit.

## Reviewer guidance

- Pull, `npm run test:coverage`. All three views at 100 %.
- Open each component. Verify no `src/adapters/` or `src/ports/` imports.
- Confirm `PlaylistRow` and `LikedSongsRow` accept their row as a prop (testable in isolation).
- Confirm `LoadedView` dispatches by `kind` field, not by index — pinning is a domain-layer responsibility, not a UI responsibility.
- Architecture test green.

## Activity Log

- 2026-06-03T09:13:38Z – unknown – Ready for review
- 2026-06-03T12:14:56Z – unknown – Review passed: PlaylistRow / LikedSongsRow / LoadedView implemented per spec. JSDoc on every export; full test suite green (358 tests, 100% line/branch/function/statement coverage); architecture test enforces no ui->adapters/ports imports; LoadedView dispatches by row.kind (pinning stays in WP03's domain transform); boundary coverage on trackCount (0/1/nominal/large) and items.length (idle/1/1001 for NFR-002 headroom); tsc --noEmit clean.
