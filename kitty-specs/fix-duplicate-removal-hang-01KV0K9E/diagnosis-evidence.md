# WP01 — Live diagnosis evidence (C-004 / FR-001)

**Captured:** 2026-06-13, live on the Spotify desktop client (Spicetify v2.43.2), against a
freshly built bundle of `main` (`npm run build` → `~/.config/spicetify/CustomApps/spicetify-dedup/`,
deployed 22:17, `spicetify apply`).

**Repro:** a 2-song playlist (`spotify:playlist:6kLMODPV6Sfm9Vm399gpu0`) holding the **same track
twice** → detection flags exactly one duplicate group of two members → click **Remove**.

**Verdict (one line):** The hang is **NOT** a never-settling host promise. `PlaylistAPI.remove`
is **never called**. `computeRemoveSet` throws `RemovalError('malformed-result',
'playlist-member-missing-uid')` synchronously inside `confirmRemoval`; that throw escapes
**uncaught**, so the row is left on `removing` forever. The underlying cause is that the inline
catalog enricher **drops `uid`**, regressing the ADR-0012 contract.

---

## Transcript 1 — the failing removal (probe wraps `PlaylistAPI.remove`)

Probe installed (`[dedup] probe installed — now click Remove`), then **Remove** clicked. The host
`PlaylistAPI.remove` wrapper **never logged a `CALLED` line**. Instead:

```
Uncaught (in promise) RemovalError: playlist removal requires a uid on every removed member
    at computeRemoveSet (spicetify-routes-spicetify-dedup.js:514:19)
    at confirmRemoval (spicetify-routes-spicetify-dedup.js:718:31)
    at onConfirm (spicetify-routes-spicetify-dedup.js:975:14)
    ...
```

- No `[dedup] PlaylistAPI.remove CALLED …` → **the executor was never reached.**
- No `RESOLVED` / `REJECTED` → there is no host call to settle. The "hang" is the **UI never
  leaving `removing`**, not a pending network request.
- The throw is **`Uncaught (in promise)`** → it propagated out of `confirmRemoval` without a
  terminal FSM dispatch.

## Transcript 2 — the playlist item shape (probe wraps `PlaylistAPI.getContents`)

Re-scanned the playlist; dumped the first item:

```
[dedup] getContents uri spotify:playlist:6kLMODPV6Sfm9Vm399gpu0
[dedup] first item KEYS: (27) ['uid', 'playIndex', 'addedAt', 'addedBy', 'formatListAttributes',
  'type', 'uri', 'name', 'album', 'artists', 'discNumber', 'trackNumber', 'duration', 'isExplicit',
  'isLocal', 'isPlayable', 'is19PlusOnly', 'hasAssociatedVideo', 'hasAssociatedAudio', 'mediaType',
  'associatedAudioUri', 'bpm', 'key', 'audioAnalysis', 'threeBandWaveform', 'isBanned', 'formats']
[dedup] uid candidates: { uid: '610a666b423c78e4', rowId: undefined, id: undefined,
  addedAt: '2026-06-11T13:33:52.000Z', 'track.uid': undefined }
```

**The host returns `uid` at the top level as a real non-empty string** (`'610a666b423c78e4'`). So
the data needed for per-occurrence removal is present at enumeration — it is lost **after**.

---

## Static trace — where `uid` is lost, and why the throw hangs the UI

### Defect B — `uid` dropped during enrichment (the functional root cause)

`src/adapters/spicetify-tracks-enumerator.ts` correctly captures it
(`parseLibraryTrackItem`, lines 172–188: `item['uid']` → `RawTrack.uid`).

`src/adapters/inline-catalog-enricher.ts:97-104` then rebuilds the `EnrichedTrack` **by hand and
omits `uid`**:

```ts
track: {
  position: t.position,
  uri: t.uri,
  canonicalUri: t.uri,
  name: t.name,
  artists: t.artists.map((a) => ({ name: a.name })),
  durationMs: t.durationMs,
  // ← t.uid is NOT copied
},
```

This **regresses the ADR-0012 decision** ("`uid` flows unchanged through enrichment into each group
member") and contradicts the field's own doc comment in `detection-types.ts:114-121` ("preserved
verbatim through enrichment"). The detector (`duplicate-detector.ts`) pushes whole `EnrichedTrack`s
into `group.members`, so every playlist member arrives at `computeRemoveSet` with
`uid === undefined`. `computeRemoveSet` (`remove-set.ts:135-141`) then fails loud — correctly — so
**no playlist removal can ever succeed** until the enricher is fixed.

> **Owned-files note:** `inline-catalog-enricher.ts` is **not in the owned-files of any WP**
> (WP02–WP04). Fixing the actual bug requires touching it. See "Decision for WP03 / scope" below.

### Defect A — the throw is mishandled into an infinite spinner

`src/store/detection-store.ts` `confirmRemoval` (lines 347-402):

```ts
try {
  const removeSet = computeRemoveSet(result, target);          // line 350 — THROWS here
  const outcome = await removalExecutor.remove(target, removeSet.tracks, ...);
  ...
} catch (e) {
  if (e instanceof DOMException && e.name === 'AbortError') return;
  const reason = isRemovalError(e) ? e : new RemovalError(...);
  const removeSet = computeRemoveSet(result, targetForKey(key)); // line 378 — THROWS AGAIN
  ...                                                            // (never reached → uncaught)
  dispatch(key, { type: 'removeComplete', ... });               // terminal dispatch skipped
}
```

The `catch` block, trying to build an all-failed `partial`, **re-invokes `computeRemoveSet`** —
which throws the *same* error a second time, now **inside the catch**, so it escapes
`confirmRemoval` uncaught. The terminal `removeComplete` dispatch never runs; the row, already moved
to `removing` by the `confirmFirst` dispatch, stays there forever. Any `computeRemoveSet` failure
(not just this one) is therefore unrecoverable by construction.

---

## Mapping to the research §R-1 decision table

None of the four hypothesised rows matched. The captured behaviour is a **fifth case**:

| Captured | Root cause |
|---|---|
| `computeRemoveSet` throws `malformed-result/playlist-member-missing-uid` **before** any host call; throw is **uncaught**; row stuck `removing` | (B) enricher drops `uid` + (A) catch-path recompute re-throws |

The "host promise hangs" hypothesis (stall ceiling) is **not** the cause: there is no host call to
hang. A reject would not have hung either — but here nothing even rejects asynchronously.

---

## Decision for WP03 / scope (T002 output)

**Confirmed root cause (FR-001):** removal hangs because a synchronous `computeRemoveSet` throw is
re-thrown by `confirmRemoval`'s catch and escapes uncaught (Defect A); removal *fails in the first
place* because the inline enricher drops `uid` (Defect B).

**The fix needs MORE than the planned stall ceiling, and crosses the planned WP scope:**

1. **(B) Enricher `uid` propagation** — copy `t.uid` onto the `EnrichedTrack` in
   `inline-catalog-enricher.ts`. One line. **Not in any WP's owned files.** This is the fix that
   makes FR-002/FR-003 ("MUST delete… backend actually changed") achievable at all. Needs a
   regression test asserting `uid` survives enrichment (and a guard so it can't silently regress
   again — the existing doc comment was not enough).

2. **(A) Store catch-path hardening** — in WP03's `detection-store.ts`: compute the remove-set
   **once** (outside/before the fragile catch), and ensure a `computeRemoveSet` failure surfaces as
   a **terminal** failure state (all-failed `partial` or equivalent) rather than re-throwing. This
   is the FR-004/FR-006 resilience fix and is squarely in WP03's file.

3. **Stall ceiling (NFR-001)** — still warranted as defense-in-depth ("can never *again* silently
   hang"), but it is **secondary**, not the root-cause fix. Keep it; do not present it as the cause.

**Open question for the human (plan-level):** WP02–WP04 were scoped around the stall-ceiling
hypothesis. Defect B's fix file (`inline-catalog-enricher.ts`) is outside every WP's owned set, and
Defect A reframes WP03's crux from "bound the await" to "stop the catch re-throwing." This warrants
a plan/tasks revision before implementing — flagged to the user at WP01 hand-off.
