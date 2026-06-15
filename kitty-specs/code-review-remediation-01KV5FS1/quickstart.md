# Quickstart: verifying the Code Review Remediation Pass

This pass changes behaviour and structure but adds no new feature surface, so
verification is primarily the gate suite plus targeted regression checks mapped to
each success criterion. Live-client verification is required only where a charter
risk-boundary or host-shape assumption is in play (B's partial reporting).

## Gate suite (must be green on every WP — SC-008, C-001)

```bash
npm test                    # vitest: full suite, 100% line + branch coverage
npx tsc --noEmit            # strict typecheck clean
```

A WP is not done until both pass with no skips and coverage at 100%.

## Success-criterion checks

| SC | What proves it | Where |
|---|---|---|
| **SC-001** mixed-content scan | A collection fixture mixing `type:'track'` and `type:'episode'` (incl. an episode carrying an `artists` array) scans to completion; only genuine tracks are deduped; all-episode collection → empty result, no failure | enumerator test (FR-001) |
| **SC-002** large progressing removal | A multi-batch removal whose total elapsed > 30 000 ms but every inter-batch gap < 30 000 ms completes; reported removed-count = host-deleted count; a true 30 000 ms no-progress batch trips as a stall and still reports tracks already removed | store + executor tests (FR-002/FR-003); live-verify |
| **SC-003** token expiry guidance | `{ code: 401 }` mid-scan → `auth-token-expired` → sign-in-again copy, for **both** liked-songs and playlist entry points | `host-auth.ts` + enumerator + loader tests (FR-006/FR-007) |
| **SC-004** internal fault copy | A non-`DetectionError` throw in the scan pipeline → `internal-error` → message with **no** catalog/Spotify-rejection wording | store + `DetectionFailedView` tests (FR-004) |
| **SC-005** truthful outcome / no phantom suffix | A `computeRemoveSet` failure → `compute-failed` outcome naming no track, count 0; no `(status N)` suffix renders anywhere | store + `RemovalOutcomeView` + `DetectionFailedView` tests (FR-009/FR-008) |
| **SC-006** single domain-type definition | Static scan: zero local re-declarations of the listed domain types in `src/ui/`; all consumed by import | NFR-001 scan + import-graph test |
| **SC-007** uniform host-unavailable | "Spotify client not ready" via the scan path → `host-unavailable` with the same dedicated outcome as removal + playlists | enumerator + `DetectionFailedView` tests (NFR-002) |
| **SC-008** gates green | `npm test` + `tsc` clean after every WP | CI / local |

## Boundary tests to confirm present (C-001)

- Per-batch stall window: **29 999 / 30 000 / 30 001 ms** (no-progress duration).
- Existing bounds re-asserted, untouched: bulk-confirm `> 25` (24/25/26),
  `BATCH_SIZE = 100`.

## Structural checks (no new behaviour, but enforced)

```bash
npm test -- architecture        # import-graph rules pass on real src;
                                # fixtures prove re-export / dynamic import() /
                                # type-only-import forbidden edges are caught (NFR-005)
```

- `grep -R "startsWith('stalled:'\|'executor-failed:')" src` → no matches (NFR-004).
- `grep -R "defined locally" src/ui` → no matches (NFR-001).
- `grep -R "catalog-rejected\|rate-limit-unparseable\|network-failure\|malformed-enrichment-payload" src` → no non-test matches (FR-005).

## Live-client verification (Finding B — partial reporting, charter risk boundary)

Per the project's live-verification protocol, drive the user through a real
removal on a large collection to confirm FR-003 at the host:

1. Build + restart the Spicetify client on the WP branch.
2. Trigger a removal large enough to span multiple 100-track batches.
3. Confirm the reported removed-count equals what the host actually deleted (no
   "removed nothing" while deletions occurred), and that a genuinely-progressing
   long removal is not aborted purely for elapsed time.
4. Capture the console outcome + a visual checklist as the DoD live-verify artefact.

## ADRs to land (C-005 / C-006)

- Per-batch stall model + faithful partial reporting (B).
- Error-taxonomy reshape + corrected auth field (C/D/I).
- Typed removal-outcome provenance (K).
- `reset()` placement note (N).
- `ports/catalog-enricher.ts` JSDoc corrected (C-006).
