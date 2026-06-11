# Live Verification Notes — Duplicate Track Detection

**Mission**: `duplicate-track-detection-01KTFH5H`
**Verifier**: atb2903 (confirmed end-to-end success during the 2026-06-11 working session)
**Date of run**: 2026-06-11

## Build under test

- **Branch**: `kitty/mission-duplicate-track-detection-01KTFH5H-integration`
- **Commit**: `125e74a` (inline-enrichment pivot — enrichment reads `duration.milliseconds` from the
  `LibraryAPI`/`PlaylistAPI` enumeration data; no public-API call).
- **Automated gates (green at verification time):** `test:run` 37 files / 807 tests pass · `test:coverage`
  100% statements/branches/functions/lines · `typecheck` (`tsc --noEmit`) exit 0 · `build-local` succeeded.
- **Deployed via**: `dist/` copied to `~/.config/spicetify/CustomApps/spicetify-dedup/` + `spicetify apply`.
- **Client**: Spotify desktop (Premium), Linux (kernel 6.17).

## Scenario results

### Scenario 2 — Happy path: rows with duplicates (AS-2, FR-009) — ✅ PASS
Scanned the duplicate-containing test playlists ("2 duplicates w/ unique IDs", "2 duplicates w/ identical
IDs", incl. `spotify:playlist:6kLMODPV6Sfm9Vm399gpu0`) and Liked Songs. Each duplicate-containing collection
transitioned through scanning to a **loaded summary** showing a duplicate group with a non-zero
tracks-to-remove count. Authoritative evidence: **`screenshot-loaded.png`** (this directory) shows the
loaded-summary panels with their group / tracks-to-remove counts. The dedup completes instantly with no
network call (enrichment is local) and no rate-limit error.

### Scenarios AS-1, AS-10, AS-11, FR-012 — covered by the automated suite, not separately walked this run
The verifier elected to confirm the happy path live. The no-duplicates message (AS-1), atomic re-trigger
replace (AS-10), parallel independent rows (AS-11), and route-reset-clears-in-flight (FR-012) are each
exercised by the 807-test automated suite, including `test/integration/detection-end-to-end.test.ts` which
drives row-click → scanning → loaded, re-trigger, cancel, reset, and parallel rows through the real store +
composition adapter + fakes.

## Notable — live verification caught what the unit suite could not

This live run was preceded by two real defects that **all unit tests passed over**, both found only by running
the extension in the real client and fixed before this successful run:

1. **CosmosAsync error-contract bug** — the catalog enricher read `raw.status`, but the real client resolves
   HTTP errors as `{ code, error, message, stack }`; every error surfaced as a misleading "catalog rejected."
   Fixed (ADR-0010), then made moot by:
2. **Public Web API unreachable from the client** — `api.spotify.com` (`/v1/tracks`, even `/v1/me`) returns a
   cold `429` structurally. Enrichment was pivoted to the inline `duration.milliseconds` already present in the
   Platform enumeration data, deleting the network path entirely (ADR-0011).

## Acceptance sign-off

- [x] **AS-2** — Duplicate collections show a group count + tracks-to-remove summary (see `screenshot-loaded.png`).
- [x] **FR-009** — Loaded summary renders on completion.
- [~] **AS-1 / AS-10 / AS-11 / FR-012** — covered by the automated suite (incl. the end-to-end integration
  test); not separately walked in this live run.
- [x] No regression in the existing playlist-load flow (library loaded and rows rendered normally).

**Verifier**: atb2903 — **Date**: 2026-06-11
