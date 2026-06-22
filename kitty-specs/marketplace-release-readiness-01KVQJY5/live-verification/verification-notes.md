# WP04 live-client verification (T020)

**Date**: 2026-06-22
**Spicetify**: v2.43.2 · **Platform**: Linux · **Account**: real library (Liked Songs ~650 tracks + user playlists)

## Method

The **committed** release bundle `marketplace/dedup/{index.js,style.css,manifest.json}`
(minified `build-local` output) was copied verbatim into the Spicetify custom-app
directory `~/.config/spicetify/CustomApps/spicetify-dedup/` — exactly the manual
install path documented in the README — and `spicetify apply` was run. The three
installed files were confirmed byte-identical to the committed bundle before apply.

This verifies the artifact a marketplace user installs, not a dev build.

## Results — PASS

| Check | Result |
|---|---|
| App renders **styled** (style.css auto-loaded by Spicetify) | ✅ rows, buttons, spacing all styled — not raw HTML (both screenshots) |
| `Dedup` sidebar entry present; page loads | ✅ |
| **Load** lists eligible collections (Liked Songs pinned first, user playlists, each with Scan) | ✅ `01-loaded-collections.png` |
| **Scan** detects duplicates | ✅ "1 duplicate group · 1 track to remove" shown for the test playlist (`02-scan-result-remove.png`) |
| **Remove duplicates** action appears on a row with removable duplicates | ✅ green button visible after scan |
| **Confirmation** names the collection + exact count; removal applies | ✅ confirmed by maintainer |
| Behavior matches pre-mission build (no regression) — NFR-003 | ✅ load/scan/remove unchanged |

## Artifacts

- `01-loaded-collections.png` — loaded collection list after clicking Load.
- `02-scan-result-remove.png` — scan result showing a duplicate group + Remove duplicates button (also used as the marketplace `preview.png`).

## Conclusion

SC-002 satisfied: a manual install of the committed `marketplace/dedup/` bundle
yields a working, correctly-styled Dedup app whose behavior matches the prior
build. The crawler's own indexing run remains out of scope (NFR-005 / C-006).
