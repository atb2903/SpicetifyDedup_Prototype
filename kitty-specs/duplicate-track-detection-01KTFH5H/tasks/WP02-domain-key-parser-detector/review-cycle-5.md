---
affected_files: []
cycle_number: 5
mission_slug: duplicate-track-detection-01KTFH5H
reproduction_command:
reviewed_at: '2026-06-10T14:32:23Z'
reviewer_agent: unknown
verdict: rejected
wp_id: WP02
---

---
affected_files:
  - test/domain/enriched-track-parser.test.ts
cycle_number: 2
mission_slug: duplicate-track-detection-01KTFH5H
reproduction_command: "cd .worktrees/duplicate-track-detection-01KTFH5H-lane-b && npm run test:run"
reviewed_at: '2026-06-10T15:25:00Z'
reviewer_agent: "claude:claude-sonnet-4-6:reviewer:reviewer"
verdict: rejected
wp_id: WP02
---

## Overall assessment

The implementation is of high quality. All three domain files exist with correct logic and full JSDoc. All 565 tests pass at 100% line/branch/statement/function coverage. TypeScript compiles cleanly. Every critical reviewer-guidance item is met: 1999/2000/2001 ms boundary tests, chain test, AS-4 region-relink, Cafe/Café documented, defaultKeepIndex asserted, algorithm matches upstream.

One gap prevents approval.

---

## Issue 1 — `context.missingField` not asserted in enriched-track-parser tests

**Severity**: Must fix before approval

**Spec reference**: T005 boundary test table, row "missing 'id' field":
> throws `malformed-enrichment-payload`, `context.missingField === 'id'` (or whichever required field's missing)

The spec explicitly requires tests to assert on `err.context.missingField`, not just that the message contains the field name. The current `expectMalformed` helper checks `err.message.toContain(missingFieldPattern)` — this verifies the error message but not the structured diagnostic payload.

The implementation in `enriched-track-parser.ts` correctly sets `context: { position, missingField }` via `throwMalformed`. The context payload is correctly implemented but is not tested through the structured property.

Only one test checks `err.context` at all, and it only asserts `context?.position`. No test ever asserts `err.context?.missingField`.

**What to fix**: Extend the `expectMalformed` helper (or individual test assertions) to also check `err.context?.missingField`. For each missing-field case add an assertion like:

```ts
if (isDetectionError(err)) {
  expect(err.context?.missingField).toBe('uri');   // or 'name', 'artists', 'duration_ms', 'linked_from'
}
```

Cover at minimum: missing `uri`, missing `name`, empty `artists`, negative `duration_ms`, malformed `linked_from.uri`. These are the cases already tested — just add the structured-context assertion alongside the existing message check.

Note: The spec table says "missing 'id' field" as an illustrative example — the actual required field names in `asEnrichedTrack` are `uri`, `name`, `artists`, `duration_ms`, and `linked_from`. There is no `id` field in `EnrichedTrack`; that is fine and consistent with data-model §1.2. Just assert the correct field names that the implementation actually uses.

---

No other issues. Once the `context.missingField` assertions are added to the parser tests, this WP is ready for approval.
