# Phase 0 Research — Remove Duplicate Tracks Button

**Mission**: remove-duplicate-tracks-button-01KTW64K · **Date**: 2026-06-11

This document resolves the deferred planning question (Q3 — how to target a specific
occurrence of a repeated track URI in a playlist) and records the host-API facts the
removal adapter depends on. Per this repo's `ADR-0011` precedent, every claim about an
*undocumented* `Spicetify.Platform` surface is **provisional until confirmed against a
live DevTools trace**; the live-verification items in §5 are mandatory DoD for the
adapter work package.

---

## 1. Host removal primitives (confirmed)

The official Spicetify docs do **not** document `PlaylistAPI` or `LibraryAPI`
(`https://spicetify.app/docs/development/api-wrapper/methods/platform` covers only
Player/Clipboard/History/etc.). The signatures below come from the maintained
community type definitions at `Pithaya/spicetify-apps`
(`libs/shared/src/platform/{playlist,library}.ts`), which this project has already
validated empirically for the read side (`getTracks` / `getContents`, see ADR-0011).

### 1.1 Liked Songs — `LibraryAPI.remove`

```ts
LibraryAPI.remove: (param: { uris: string[]; silent?: boolean }) => Promise<void>;
LibraryAPI.add:    (param: { uris: string[]; silent?: boolean }) => Promise<void>;
LibraryAPI.contains: (...uris: string[]) => Promise<boolean[]>;
LibraryAPI.getEvents: () => LibraryAPIEventManager; // emits 'operation_complete'
```

A saved track is keyed by its URI; the Liked Songs collection cannot contain the same
URI twice. Therefore Liked-Songs duplicates are always **distinct** URIs (the same song
on different releases), and `LibraryAPI.remove({ uris })` targets them exactly — no
occurrence disambiguation is needed. The Liked Songs collection URI is
`spotify:collection:tracks`; our store uses the sentinel `'liked-songs'`, and removal
does not need the collection URI at all (the API operates on the saved-tracks set
directly).

### 1.2 Playlist — `PlaylistAPI.remove`

```ts
PlaylistAPI.remove: (
  playlistUri: string,
  tracks: { uri: string; uid: string }[],
) => Promise<void>;

PlaylistAPI.getContents: (
  playlistUri: string,
  queryParameters?: Partial<QueryParameters>,
) => Promise<{ items: PlaylistTrack[]; limit; offset; totalLength }>;
```

Crucially, `PlaylistTrack` (the item shape `getContents` already returns) carries:

```ts
type PlaylistTrack = { type: 'track'; uid: string; uri: string; name; /* … */ };
```

So each occurrence in a playlist has its own `uid`. `remove` deletes the specific
occurrences named by `{ uri, uid }`. This is corroborated by the documented sibling
`removeFromQueue` semantics: *"if a uid is not provided, all tracks with the same uri
will be removed."* Addressing by `uid` is therefore the mechanism that lets us keep the
earliest copy and delete only the later ones.

---

## 2. Decision: capture playlist `uid` during enumeration (resolves Q3)

- **Decision**: Widen the enumeration output (`RawTrack`) and the enriched output
  (`EnrichedTrack`) with an optional `uid?: string`. The `SpicetifyTracksEnumerator`
  reads `item.uid` for playlist items (Liked-Songs items have no `uid`, so it stays
  `undefined` there). `uid` flows unchanged through enrichment into each
  `DuplicateGroup` member, and `computeRemoveSet` emits `{ uri, uid }` per removed
  track. The Spicetify removal adapter forwards `uid` to `PlaylistAPI.remove` and
  ignores it for `LibraryAPI.remove`.
- **Rationale**: It is the only mechanism the confirmed `PlaylistAPI.remove` signature
  offers for keeping exactly one copy of a repeated URI. The field is already present on
  `getContents` items, so capture is purely additive. The **matching algorithm is not
  touched** — only the data carried alongside each track widens.
- **Spec impact**: This is a documented deviation from assumption **A-3** ("existing
  detection fields are sufficient; no new capture"). Tracked as **ADR-0012**. It does
  not change *what* counts as a duplicate, only *what is carried* to enable removal.
- **Alternatives considered**:
  - *Remove by URI only* — rejected: deletes every copy of a repeated URI, including the
    one to keep; cannot satisfy FR-004 keep-earliest for in-playlist exact repeats.
  - *Positional/index-based remove* — rejected: not supported by the confirmed `remove`
    signature; also fragile if positions shift between scan and removal.
  - *Re-fetch playlist contents at removal time to recover uids* — rejected: an extra
    host read that A-2 steers away from, and unnecessary since `uid` is free to capture
    at scan time.

---

## 3. Decision: removal state nests on the detection `loaded` state

- **Decision**: Extend `DetectionState`'s `loaded` variant with a `removal: RemovalState`
  sub-state (`none → confirming → confirming2 → removing → {none | partial}`), and add
  removal actions to the existing `transition` FSM. One `DetectionStore`; no second store.
- **Rationale**: Removal both **reads** the loaded `DetectionResult` (to compute the
  remove-set and the confirmation count) and **rewrites** it (the in-client refresh of
  FR-008). Keeping both in one state object makes the post-removal update a single
  atomic transition and avoids cross-store coordination. Mirrors the spirit of ADR-0006
  (state grouped by what it serves), here grouping removal with the result it mutates.
- **Alternatives considered**:
  - *Separate `RemovalStore`* (the interview's option B) — rejected for this mission: it
    must read the loaded result from the detection store and write the updated result
    back, duplicating the source of truth and adding a synchronization seam for no
    functional gain. Recorded in ADR-0013 as the rejected alternative.

---

## 4. Decision: partial-failure detection via batched removal

- **Decision**: The Spicetify adapter splits the remove-set into batches and awaits each
  batch's `remove(...)` call. A fulfilled batch's tracks are reported `removed`; a
  rejected batch's tracks are reported `failed` (with the rejection reason). The adapter
  returns a `RemovalOutcome { removed, failed }`; the store feeds it to
  `applyRemovalOutcome` to refresh the row (removed copies drop out, failed copies stay
  visible — FR-010 / AS-8). For Liked Songs an **optional** post-pass via
  `LibraryAPI.contains(...uris)` can reconcile `removed`/`failed` precisely; it is an
  enhancement, not required for v1, and is gated on the §5 live check of whether a bulk
  `remove` is atomic.
- **Rationale**: `LibraryAPI.remove` and `PlaylistAPI.remove` both return `Promise<void>`
  with no per-track result, so the only way to attribute success/failure at finer than
  whole-call granularity is to scope each host call to a batch. Batching also bounds the
  blast radius of a transient error and provides natural progress checkpoints for NFR-002.
- **Open tuning**: batch size is a numeric bound (boundary-tested). Default proposed:
  one batch per duplicate group is too chatty for huge libraries; a fixed size (e.g.
  100) balances granularity and call count. Final value set in the adapter WP after §5.
- **Alternatives considered**:
  - *Single bulk call, treat any rejection as total failure* — rejected: would mark a
    whole large collection failed on one transient error, contradicting AS-8's
    "leaves the still-present duplicates visible" partial model.
  - *Per-track calls* — rejected as default: maximal granularity but `R` host round-trips
    for `R` removals; reserved as a fallback if §5 shows bulk `remove` rejects the whole
    batch on a single stale `uid`.

---

## 5. Live-verification items (mandatory DoD for the adapter WP)

These cannot be confirmed from type definitions and MUST be checked against a live
Spotify client (DevTools console) before the removal adapter WP reaches `done`
(per memory `spec-kitty-live-verification-required`):

1. **Exact call shapes resolve.** `Spicetify.Platform.LibraryAPI.remove({ uris:[…] })`
   and `Spicetify.Platform.PlaylistAPI.remove(playlistUri, [{ uri, uid }])` both exist
   and resolve (not reject) for a valid small removal; confirm the playlist `uid` from a
   live `getContents` item actually deletes that occurrence and keeps the others.
2. **Atomicity / partial behavior.** Does a bulk `remove` with one invalid/stale member
   reject the whole call, or drop the bad one and succeed? Drives §4 batch size and the
   per-track fallback decision.
3. **Stale-occurrence handling (A-5).** Removing a `uid`/URI already absent from the live
   library — no-op or error? Confirms A-5's "treat as no-op for that track."
4. **Client UI sync.** Confirm the host updates its own UI/cache after `remove` (the
   research notes claim it routes through the same channel as the heart button), so our
   in-client `applyRemovalOutcome` refresh does not fight the client.
5. **`contains` reliability (optional path).** If §4's Liked-Songs reconciliation is
   pursued, confirm `LibraryAPI.contains(...uris)` reflects post-`remove` state.

---

## 6. Confirmation UI (from interview)

- **Decision**: In-app React confirmation component (`RemovalConfirmDialog`), rendered
  within the Dedup page tree, not `Spicetify.PopupModal`.
- **Rationale**: Fully drivable under happy-dom / @testing-library, so the 100%
  line/branch gate and the 24/25/26 boundary tests on the single-vs-double-confirm
  threshold are straightforward; the dialog state co-locates with the row's removal
  sub-state. `PopupModal` is a global single-modal-at-a-time surface that is awkward to
  cover and to drive through a two-step flow.
- **Accessibility (NFR-001)**: the dialog names the target collection and exact count,
  uses distinct Cancel / Remove affordances, and is not actionable by a single accidental
  activation (the count + name are shown before the destructive button is reachable).

---

## 7. Carried-forward facts (already established; not re-derived)

- Detection already excludes `spotify:local:…` before grouping (C-004), so remove-set
  members are never local files.
- `DetectionResult` exposes `groups`, `defaultKeepIndex` (always `0`), `removableTrackCount`
  (`= duplicateTrackCount − groups.length`), and `collectionKey` — the inputs
  `computeRemoveSet` needs (A-3 for these specific fields holds; only `uid` is added).
- The public Web API is unreachable from the client (ADR-0011); removal uses only the
  in-client Platform primitives, satisfying C-005.

## Sources

- [Spicetify — Platform methods](https://spicetify.app/docs/development/api-wrapper/methods/platform)
- [Spicetify — removeFromQueue (uid semantics)](https://spicetify.app/docs/development/api-wrapper/functions/remove-from-queue/)
- `Pithaya/spicetify-apps` — `libs/shared/src/platform/playlist.ts` and `library.ts` (community type definitions; provisional, pending live verification per §5)
