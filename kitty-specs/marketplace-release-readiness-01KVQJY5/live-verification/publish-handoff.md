# Publish handoff (T021) — maintainer-only steps

These are outward-facing actions the **maintainer** authorizes and runs (C-003).
The mission prepares and documents them; the agent does NOT push, tag, or change
the GitHub topic autonomously. Crawler indexing timing is out of scope (NFR-005 /
C-006) — there is no wall-clock guarantee for when the card appears in-client.

## 1. Version consistency (FR-010)

Confirm the version string matches in all three places before tagging:

- `package.json` → `"version": "1.0.0"` (WP02)
- `CHANGELOG.md` → top entry `## [1.0.0] - 2026-06-22` (WP03)
- git tag → `v1.0.0` (below)

## 2. Tag the release

```bash
git tag v1.0.0          # on the merged release commit on main
git push origin main --tags
```

## 3. Set the GitHub topic so the crawler discovers the repo (FR-011)

In the GitHub repo **Settings → General → Topics** (or via API), add:

```
spicetify-extensions
```

The Spicetify Marketplace crawler queries that topic and reads the root
`manifest.json` from the default branch (`main`) to render the card. It runs on
the Marketplace's own schedule.

## 4. What the crawler will read (already in place)

- Topic: `spicetify-extensions` (step 3)
- Root `manifest.json` (listing): name/description/preview/main/readme/tags/authors
- `preview` → `preview.png` (committed)
- `main` → `marketplace/dedup/index.js` (committed)
- `readme` → `README.md` (committed)

## Note on install

Custom apps install **manually** (the card is discovery + instructions). The
README documents the manual steps: copy `marketplace/dedup/` into the Spicetify
`CustomApps/` directory, `spicetify config custom_apps spicetify-dedup`,
`spicetify apply`.
