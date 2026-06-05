# Phase 1 Data Model — Dedup Button Per Playlist Row

**Mission**: `dedup-button-per-playlist-row-01KTC3GY`
**Date**: 2026-06-05

This mission introduces **no new domain types** in `src/domain/`. It modifies **no existing domain types**. It adds **two new UI-layer types** (one component-prop interface, one helper-function signature) and proposes **one CSS-module change** to the existing playlist row.

The authoritative reference for `CollectionKind`, `OwnerIdentity`, `RawCollection`, `LikedSongsSummary`, `CollectionViewModel`, `LoadState`, `LoadAction`, `transition`, `PlaylistsLoaderError`, and `PlaylistsState` is the prior mission's data-model file at `kitty-specs/dedup-page-live-client-polish-01KT6ZCR/data-model.md`. None of those change in this mission.

---

## 1. `DedupButtonProps` (NEW)

Lives in `src/ui/DedupButton.tsx`.

```ts
/**
 * Props for the `DedupButton` component.
 *
 * Both fields are positional strings — the button never sees a
 * `CollectionViewModel`. This keeps `DedupButton`'s test surface decoupled
 * from the view-model type and matches the "smallest sufficient prop set"
 * principle used throughout `src/ui/` (see research.md §3).
 */
export type DedupButtonProps = {
  /**
   * The playlist's display name as it appears in the surrounding row.
   * Used in the `aria-label` for accessibility (NFR-002) and passed
   * verbatim to the click-log helper (FR-003).
   *
   * No length / whitespace / charset constraints — the spec explicitly
   * accepts empty names, names with quotes, names with emoji, and names
   * with RTL marks (spec §Edge cases). The value is whatever the
   * adapter validated and the view-model transform passed through.
   */
  playlistName: string;

  /**
   * The playlist's canonical URI, in the form `spotify:playlist:...`.
   * Sourced from `CollectionViewModel.key` (which is set to
   * `RawCollection.uri` at `src/domain/view-models.ts:115`). Passed
   * verbatim to the click-log helper (FR-003, FR-004).
   *
   * Non-empty by construction: the adapter rejects empty `uri`s via
   * `isRawCollection` (`src/domain/view-models.ts:140`), so a rendered
   * row cannot reach this prop with `playlistUri === ''`. The button
   * does not re-validate.
   */
  playlistUri: string;
};
```

### Semantics

- **Required, non-optional, no defaults.** Both fields are mandatory; TypeScript-strict ensures every call site passes both.
- **Pure props.** No callbacks, no refs, no children. The button's behavior is fully determined by `(playlistName, playlistUri)` plus the wired-in `logDedupClick`.
- **No memoization needed.** Both fields are primitives; React's default reference equality keeps re-renders proportional to actual changes.

### Type-level invariants

- `playlistName: string` accepts any string (including empty). The component does not throw on empty input; it constructs the `aria-label` with whatever is supplied, accepting that `aria-label="Dedup playlist "` (trailing space) is the cost of FR-003's verbatim-passthrough rule on names.
- `playlistUri: string` is expected to be non-empty (adapter-enforced), but the button does not assert this — fail-loud belongs at the boundary (adapter), not in the UI layer.

### Boundary tests

Per charter, every numeric bound needs min−1 / min / nominal / max / max+1 coverage. `DedupButtonProps` has no numeric fields, so no boundary tests are added for the type itself.

**String-edge tests** (analogous to boundary coverage for variable-length text fields) live in `test/ui/DedupButton.test.tsx`:

- `playlistName = ''` (empty)
- `playlistName = 'A'` (one character)
- `playlistName = 'A'.repeat(500)` (long, matches `PlaylistRow.test.tsx:81-85`'s pattern)
- `playlistName = '🎵 漢字 "quoted" ‮'` (mixed special characters covering emoji, CJK, quotes, RTL mark)

These exercise the `aria-label` construction and the logged-string format across the values the spec explicitly accepts.

---

## 2. `logDedupClick` (NEW — helper function signature)

Lives in `src/ui/dedup-click-log.ts`.

```ts
/**
 * Emit a single confirmation line to the dev console identifying which
 * playlist row's Dedup button was activated.
 *
 * Format (FR-003): `[Dedup] clicked: <name> (<uri>)`.
 * The name and URI are passed verbatim — no escaping, no truncation, no
 * trimming. Empty or whitespace-only names are written through as-is per
 * the spec's edge-case rule.
 *
 * This is a side-effecting function. Its only effect is one
 * `console.log` call per invocation. It does not mutate anything,
 * does not call Spicetify APIs, does not return a value (FR-007, C-001).
 *
 * This is the temporary diagnostic surface that ADR-0006 covers; a
 * future mission replaces this implementation with a real confirmation
 * flow without changing the signature.
 */
export function logDedupClick(name: string, uri: string): void;
```

### Semantics

- **One side effect per call**: a single `console.log(`[Dedup] clicked: ${name} (${uri})`)`.
- **Synchronous, no return value, no error path**: `console.log` does not throw under normal conditions; the helper does not introduce a `try`/`catch`.
- **Pure with respect to its arguments**: same `(name, uri)` always produces the same log line.

### Test fixture

`test/ui/dedup-click-log.test.ts` (3 tests):

1. `vi.spyOn(console, 'log')` → call `logDedupClick('My Playlist', 'spotify:playlist:abc')` → assert the spy was called once with `'[Dedup] clicked: My Playlist (spotify:playlist:abc)'`.
2. Same with `name = ''` and `uri = 'spotify:playlist:xyz'` → assert the spy was called with `'[Dedup] clicked:  (spotify:playlist:xyz)'` (note the double-space — verbatim FR-003 format).
3. Same with `name = 'has "quotes" and 🎵'` → assert verbatim string in the spy.

Coverage: 100% lines, 100% branches (the helper has one statement and no branches).

---

## 3. `PlaylistRow` props — unchanged

`PlaylistRowProps` in `src/ui/PlaylistRow.tsx:28` stays:

```ts
export type PlaylistRowProps = { row: CollectionViewModel };
```

The row constructs the button internally as

```tsx
<DedupButton
  playlistName={row.displayName}
  playlistUri={row.key}
/>
```

No new prop is added. The row already has both values via `row.displayName` and `row.key`.

---

## 4. `CollectionViewModel` — unchanged

Defined at `src/domain/view-models.ts:80-87`. No fields added, removed, or retyped. The button is fed from existing fields:

- `displayName: string` → `DedupButtonProps.playlistName`.
- `key: string` (which equals `RawCollection.uri` for playlist rows per `src/domain/view-models.ts:115`) → `DedupButtonProps.playlistUri`.

The view-model transform (`toViewModels`) is unchanged.

---

## 5. `LikedSongsRow` props — unchanged; internal button wiring added (Reading B, research.md §7)

`LikedSongsRowProps` in `src/ui/LikedSongsRow.tsx:27` stays:

```ts
export type LikedSongsRowProps = { row: CollectionViewModel };
```

The component does not gain a new prop. It renders a `<DedupButton>` internally with hardcoded literals:

```tsx
<DedupButton playlistName="Liked Songs" playlistUri="spotify:collection:tracks" />
```

Rationale (full text in research.md §7.1): `LikedSongsRow` already hardcodes the row's display name and owner label (`src/ui/LikedSongsRow.tsx:52-53`); the URI literal matches that pattern. Threading a `canonicalUri` field through `CollectionViewModel` would touch the view-model transform, the FakePlaylistsLoader, the contract tests, and every existing UI test for a one-call-site value. The literal stays at the call site.

**Type-level invariant**: `DedupButtonProps` does not gain a "Liked Songs" variant. Both rows pass plain `string` values; the button does not know which row variant called it.

**The `playlistUri` literal**: `"spotify:collection:tracks"` is the canonical Spotify URI form for the saved-tracks collection (see research.md §7.1). This iteration only emits the string to `console.log`; no host API is called with it, so the literal is safe regardless of whether `Spicetify.Platform.LibraryAPI` ultimately accepts that exact form. Verification with the host belongs to the next mission.

---

## 6. CSS module shapes — narrow change

### `src/ui/PlaylistRow.module.scss` — 3 → 4 grid columns (research.md §4)

```scss
// Before (current)
.row {
  display: grid;
  grid-template-columns: 48px 1fr auto;
  // ...
}

// After (this mission)
.row {
  display: grid;
  grid-template-columns: 48px 1fr auto auto;
  // ...
}
```

No other rules change in `PlaylistRow.module.scss`.

### `src/ui/DedupButton.module.scss` — new file (conditional)

If the button's visual treatment is more than 1–2 rules (i.e. anything beyond a `color` + `padding` literal), a dedicated module ships alongside `DedupButton.tsx`. Specific rules deferred to the WP per research.md §8. Likely shape:

```scss
@use '../styles/tokens.module' as tokens;
@include tokens.declare;

.button {
  background: transparent;
  border: 1px solid var(--dedup-card-hover);
  color: var(--dedup-text);
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  cursor: pointer;
  transition: background-color 120ms ease, border-color 120ms ease;

  &:hover {
    background: var(--dedup-card-hover);
    border-color: var(--dedup-button);
  }

  &:focus-visible {
    outline: 2px solid var(--dedup-button);
    outline-offset: 2px;
  }
}
```

Final rule set lands in the WP.

### `src/ui/LikedSongsRow.module.scss` — 3 → 4 grid columns (research.md §7.3)

```scss
// Before (current)
.row {
  display: grid;
  grid-template-columns: 48px 1fr auto;
  // ...
}

// After (this mission)
.row {
  display: grid;
  grid-template-columns: 48px 1fr auto auto;
  // ...
}
```

No other rules change in `LikedSongsRow.module.scss`. The change mirrors `PlaylistRow.module.scss`'s grid extension verbatim so both row variants share identical column geometry.

---

## 7. Module boundary contract — unchanged

Per ADR-0001 and the prior mission's data-model:

- **Adapter** owns host shape validation. Untouched by this mission.
- **Domain** trusts inputs and is pure. Untouched.
- **Store** does not validate. Untouched.
- **UI** never sees raw host shapes. Untouched. `DedupButton` and `logDedupClick` both live under `src/ui/` per research.md §2; the architecture test's `src/ui/` rule (forbids imports from `src/adapters/` and `src/ports/`) is satisfied by both because both files import only `React` and primitive types.

`test/architecture.test.ts` requires no changes for this mission.

---

## 8. Test fixture changes

- `test/ui/PlaylistRow.test.tsx`: existing tests stay valid (none assert column count or the absence of a button). One or more *new* tests assert the presence of the button by accessibility query: `screen.getByRole('button', { name: /Dedup <name>/ })`. Boundary cases on the surrounding row's text content (zero tracks, long name) already exist and stay.
- `test/ui/LikedSongsRow.test.tsx`: same pattern as `PlaylistRow.test.tsx` — new tests assert the button is present with `aria-label="Dedup Liked Songs"` and that clicking it logs `[Dedup] clicked: Liked Songs (spotify:collection:tracks)`.
- `test/ui/DedupButton.test.tsx`: new file. Covers Decisions 1, 3, 5 from research.md. ~7 tests.
- `test/ui/dedup-click-log.test.ts`: new file. Covers Decision 2 + the 3 spec edge-case strings.
- `test/ui/LoadedView.test.tsx`: existing tests stay valid (none assert the absence of buttons). Add tests asserting that when N rows render (1 Liked Songs + N playlists), exactly N+1 buttons render. The existing 1001-row scale test (`test/ui/LoadedView.test.tsx:152-169`) becomes the source of a new assertion that 1001 buttons render under Reading B.
- `test/ui/EmptyView.test.tsx`, `test/ui/IdleView.test.tsx`, etc.: unchanged. The button never renders in non-loaded states because `LoadedView` returns `null` outside the `loaded` FSM cell.

---

## 9. Type-level invariants (recap)

- `DedupButtonProps` has only required fields. TS-strict catches missed call sites.
- `logDedupClick` is `(string, string) => void`. No overloads, no defaults.
- `CollectionViewModel` keeps its `key: string` invariant (URI for playlists, literal `'liked-songs'` for the synthetic row). The `DedupButton`'s `playlistUri` prop is sourced from `row.key` for playlist rows and from the hardcoded literal `"spotify:collection:tracks"` at the `LikedSongsRow` call site; the view-model type is not broadened.
- All new files (button, helper, button module) live under `src/ui/`. No file is added to `src/domain/`, `src/ports/`, `src/adapters/`, or `src/store/`.
