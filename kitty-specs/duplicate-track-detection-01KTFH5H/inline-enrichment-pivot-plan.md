# Inline-Enrichment Pivot Plan

**Goal:** Make dedup actually work in the client by enriching from the **inline** track data
`Spicetify.Platform.LibraryAPI.getTracks` / `PlaylistAPI.getContents` already return (`duration.milliseconds`),
and deleting the non-functional `GET /v1/tracks` (CosmosAsync) enrichment path.

**Why:** Live verification proved (a) the entire public `api.spotify.com` path is dead from the client
(`/v1/me` and `/v1/tracks` both return `code 429` cold after 6h idle), and (b) `LibraryAPI` items already carry
`duration:{milliseconds}` + `name`/`artists`/`uri`/`isLocal`. So the public-API enrichment round-trip is
unnecessary; enrichment becomes a pure local transform (no network in the happy path).

**Scope:** enumeration/enrichment adapter layer + the `RawTrack` domain type. Detector, store, UI, composition
adapter, ports are untouched (the new enricher implements the existing `CatalogEnricher` port).

**Tradeoff (accepted):** the inline shape has no `linked_from`, so region-relinked dupes (AS-4) degrade to
URI-equality matching; name+duration matching (FR-005) still covers them. Record in ADR-0011.

---

## Live-shape evidence
- LibraryAPI item keys: `type, uri, name, duration, album, artists, discNumber, trackNumber, isExplicit,
  isPlayable, isLocal, is19PlusOnly, addedAt, …`; `duration` is `{ milliseconds: <int> }`.
- **PENDING CONFIRMATION:** PlaylistAPI.getContents item shape (the live repro was a playlist) — must carry the
  same `duration.milliseconds`. Verify before implementing.

## Changes

### Modify
1. `src/domain/detection-types.ts` — `RawTrack` gains `durationMs: number | null` (null when the host omits a
   duration, e.g. a non-track/unavailable item). Update the `EnrichedTrack` JSDoc that references the catalog
   parser.
2. `src/adapters/spicetify-tracks-enumerator.ts` — `parseLibraryTrackItem` reads `item.duration.milliseconds`
   → `durationMs` (or `null` if absent/not a number). `LibraryTrackItem` interface gains optional
   `duration?: { milliseconds: number }`. `isLibraryTrackItem` stays lenient (does NOT reject missing duration
   — absence flows to an `unenriched` slot, not a hard failure). Fix the "NOT present inline" doc comment.
3. `src/app.tsx` — construct `new InlineCatalogEnricher()` instead of `new SpicetifyCatalogEnricher()`; drop the
   CosmosAsync wiring. Composition adapter call site unchanged.

### Add
4. `src/adapters/inline-catalog-enricher.ts` — `InlineCatalogEnricher implements CatalogEnricher`.
   `enrich(tracks, signal, onProgress)`:
   - immediate + per-chunk abort checks (throw `DOMException('…','AbortError')`); no network, no sleeps.
   - for each `RawTrack`: `durationMs !== null` → `{ kind:'enriched', track: { position, uri, canonicalUri: uri,
     name, artists: t.artists.map(a => ({ name: a.name })), durationMs } }`; else `{ kind:'unenriched',
     position, rawUri: uri }`.
   - emit `{ stage:'enriching', processed, total }` per chunk (chunk size e.g. 200) so the progress UX is intact.
   - paired classifier kept simple; fail-loud validation already happens upstream at `parseLibraryTrackItem`
     (NFR-008 boundary moves to enumeration).
   + `test/adapters/inline-catalog-enricher.test.ts` — boundary/abort/enriched-vs-unenriched/progress coverage.

### Delete (now-dead; grep-confirm no remaining `src/` importers first)
5. `src/adapters/spicetify-catalog-enricher.ts` + `test/adapters/spicetify-catalog-enricher.test.ts` (broken
   network path).
6. `src/adapters/retry-after.ts` + `test/adapters/retry-after.test.ts` (orphaned since the 429-backoff change).
7. `src/domain/enriched-track-parser.ts` + `test/domain/enriched-track-parser.test.ts` (only the deleted network
   enricher used `asEnrichedTrack`; the inline enricher builds `EnrichedTrack` directly).

### Ripple (type change forces these)
8. `src/adapters/fake-tracks-enumerator.ts` + its test — `RawTrack` fixtures gain `durationMs`.
9. Any `RawTrack` literal in `test/adapters/detection-scanner.test.ts`, `test/integration/…`, enumerator test —
   add `durationMs`. `tsc --noEmit` will enumerate every site.
10. `test/app.test.tsx` — assert the new wiring (no `Spicetify.*` access at construction; no CosmosAsync).

### Governance
11. ADR-0011 (`.claude/adr/`) — enrichment pivoted to inline Platform data; corrects the research premise;
    supersedes the `/v1/tracks` portions of ADR-0009/0010; notes the AS-4 (`linked_from`) degradation.
12. Update CLAUDE.md "Domain context" + `research.md`: `duration_ms` **is** inline as `duration.milliseconds`;
    public `api.spotify.com` is unreachable from the client (cold 429).

## Gates
`npm run test:run` green · `npm run test:coverage` 100% · `npm run typecheck` exit 0 · `npm run build-local`
succeeds · then redeploy + live re-verify (screenshot of a real loaded summary).
