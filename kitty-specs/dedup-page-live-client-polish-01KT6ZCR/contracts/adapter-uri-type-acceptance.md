# Contract: Adapter URI-type acceptance (FR-010, FR-011)

**Mission**: `dedup-page-live-client-polish-01KT6ZCR`
**File (CHANGE, owned by WP-04)**:
- `src/adapters/spicetify-playlists-loader.ts` (line 141, inside `walkItems`)
- `test/adapters/spicetify-playlists-loader.test.ts`
- `test/adapters/fixtures/` (one new or extended fixture)

Supports: FR-010, FR-011, SC-4 (per-playlist row visible regardless of URI type variant).

---

## 1. URI-type table

The adapter's `walkItems` (`src/adapters/spicetify-playlists-loader.ts:124-147`) makes per-node decisions based on the rootlist node's `type` field. The table after this mission's change:

| `node.type` | Action | Reason |
|---|---|---|
| `'playlist'` | Append `toRawCollection(node)` to output | Existing behavior |
| `'playlist-v2'` | Append `toRawCollection(node)` to output (**NEW** — FR-010) | Spec-declared; closes DRIFT-1 from `mission-review.md` |
| `'folder'` | Recurse into `node.items` | Existing behavior |
| any other string | Silently skipped | Existing behavior (separators, future kinds) |
| missing / non-string `type` | Throws `PlaylistsLoaderError('rootlist-item-unsupported-shape', …)` via the upstream `walkItems` checks | Existing behavior |

### Code change

```ts
// Before (line 141)
if (type === 'playlist') {
  out.push(this.toRawCollection(node));
  continue;
}
// After (FR-010)
if (type === 'playlist' || type === 'playlist-v2') {
  out.push(this.toRawCollection(node));
  continue;
}
```

The change is one branch widening. The downstream `toRawCollection` is unchanged — spec assumption §6.4 holds that `'playlist-v2'` carries the same fields. If WP-04's live probe (`research.md` §5) reveals divergent fields, the change escalates to a refined requirement; otherwise this one-line change is the entire fix.

---

## 2. Fixture extension (FR-011)

The existing `test/adapters/fixtures/rootlist-response.sample.json` is the captured live response from the prior mission. Per `mission-review.md` DRIFT-1: *"The captured fixture … shows only `type: 'playlist'` instances."* — extension is required for FR-011's "fixture covers at least one `'playlist-v2'` node" assertion.

### Two-path choice (decided in WP-04)

| Path | Pro | Con |
|---|---|---|
| **A**: Add one `playlist-v2` node to `rootlist-response.sample.json` | Lower churn — single fixture file | The existing "exact contents" tests need their expected output adjusted by +1 row |
| **B**: Create `rootlist-response.with-v2.sample.json` sibling | Existing tests stay untouched | Two fixtures to keep in sync; risk of drift |

WP-04 selects Path A by default (smaller diff surface) unless the existing test asserts the exact `[uri, …]` array as an immutable contract — in which case Path B avoids churn.

### Fixture node shape (the new entry)

```json
{
  "type": "playlist-v2",
  "uri": "spotify:playlist:v2-fixture-1",
  "name": "Future-rollout Playlist",
  "owner": { "displayName": "me" },
  "isOwnedBySelf": true,
  "canAdd": true,
  "canRemove": true,
  "totalLength": 7,
  "images": [{ "url": "https://example.com/cover.png" }],
  "collaborators": { "count": 0 }
}
```

Fields match the existing `'playlist'` fixture shape verbatim, per spec assumption §6.4. The `name`, `uri`, `totalLength`, and image URL are inert test data — chosen to be obviously synthetic so the fixture cannot be mistaken for production capture.

---

## 3. Tests (drive WP-04's TDD loop)

| # | Test | Asserts |
|---|------|---------|
| F-1 | Given a fixture containing one `'playlist-v2'` node, the adapter's `load()` returns a `RawCollection` for it | FR-010 + FR-011 |
| F-2 | The `RawCollection` produced for a `'playlist-v2'` node has the same fields and values as a `'playlist'` node with identical input | Confirms structural alias (assumption §6.4) |
| F-3 | A `'playlist-v3'` node (hypothetical, missing-from-table type) is still silently skipped | Existing behavior preserved |
| F-4 | A `'show'` or `'episode'` node is still silently skipped | Existing behavior preserved |
| F-5 | A `'folder'` containing a `'playlist-v2'` child has the child appear in the flattened result | Folder recursion still works |

F-3 is the boundary case asserting we widened the branch by one specific value, not by "anything playlist-like."

---

## 4. Architecture-test compliance

No new files added in restricted layers. Edit is contained to `src/adapters/`. No new imports introduced — the change is one OR clause.

---

## 5. NFR-010 alignment

Spec NFR-010: *"Either the adapter accepts both `'playlist'` and `'playlist-v2'` (FR-010 path), or `data-model.md` §3 is amended in this mission's plan to narrow the contract — not both half-done."*

This mission chooses the **adapter widens** path. The prior mission's `data-model.md` §3 remains unchanged (and now correct). This mission's `data-model.md` §3 (in this directory) documents the widening as a CHANGE, not a new declaration.

---

## 6. Live-probe checkpoint reminder

`research.md` §5 carries the WP-04 live probe:

```javascript
const r = await Spicetify.Platform.RootlistAPI.getContents();
console.log('types:', [...new Set(r.items.map(i => i.type))]);
console.log('counts:', r.items.reduce((m, i) => (m[i.type] = (m[i.type]||0)+1, m), {}));
```

If the probe reveals zero `'playlist-v2'` nodes in the 2026-06-03 user library (consistent with spec §1's measurement), the synthetic fixture node is the only test-side artifact. If the probe reveals real `'playlist-v2'` nodes, capture one as a more-realistic fixture in addition to (not instead of) the synthetic one.
