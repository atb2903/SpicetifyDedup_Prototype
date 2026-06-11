---
affected_files: []
cycle_number: 4
mission_slug: duplicate-track-detection-01KTFH5H
reproduction_command:
reviewed_at: '2026-06-10T20:34:09Z'
reviewer_agent: unknown
verdict: rejected
wp_id: WP05
---

# WP05 Review Cycle 2 — Feedback

## Verdict: Changes Requested

All 7 mandatory reviewer checks passed **except** Check 2 ("Retry-After integer `'0'` → no wait / no `setTimeout` registered"). Two related defects exist: one in the implementation and one in the test.

---

## Issue 1 — `sleep()` does not short-circuit for `ms <= 0` (implementation)

**File**: `src/adapters/spicetify-catalog-enricher.ts`, method `private sleep(ms, signal)`

**Problem**: The spec pseudocode (§T015 Algorithm, `sleep` helper) opens with:

```ts
if (ms <= 0) return;
```

The implementation omits this guard. When `Retry-After: 0` is received, `parseRetryAfter('0')` returns `0`, and `sleep(0, signal)` is called. Instead of returning synchronously, the current code calls `setTimeout(fn, 0)`, which registers a timer (even if 0 ms) and yields to the event loop unnecessarily.

**How to fix**: Add the early-return guard as the first statement of `sleep`:

```ts
private sleep(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  if (signal.aborted) {
    return Promise.reject(new DOMException('Aborted before sleep', 'AbortError'));
  }
  return new Promise<void>((resolve, reject) => {
    // ... rest unchanged
  });
}
```

---

## Issue 2 — `'Retry-After': '0'` test does not assert no timer is registered (test)

**File**: `test/adapters/spicetify-catalog-enricher.test.ts`, describe block "Retry-After", it `"header '0' → no wait, proceeds immediately"`

**Problem**: The test advances fake timers via `vi.runAllTimersAsync()` to flush the 0 ms `setTimeout`, then checks the result. This masks the implementation defect above — it passes regardless of whether a timer was registered. The spec risk note explicitly requires:

> assert `vi.getTimerCount() === 0` at the end of relevant tests

**How to fix**: After calling `await vi.runAllTimersAsync()` (or just awaiting the promise after fixing the implementation), add:

```ts
expect(vi.getTimerCount()).toBe(0);
```

With the implementation fix in place, `sleep(0, signal)` returns immediately without registering any timer, and this assertion will confirm the correct behaviour. The test can also drop the `vi.runAllTimersAsync()` call entirely since no timer will be pending.

---

## Everything else passes

| Check | Result |
|---|---|
| Exact-page-boundary (200 items, 1 page, no double-fetch) | PASS |
| Retry-After `'0'` → no wait, no setTimeout | FAIL (see Issues 1 & 2) |
| Precheck for empty/malformed `playlistUri` throws synchronously | PASS |
| `RawTrack.position` is post-local-filter index | PASS |
| CosmosAsync silent-error classification (401/4xx/5xx/threw/bad-shape) | PASS |
| Abort-aware sleep — abort-during-sleep tested | PASS |
| 100% line + branch coverage on both modules | PASS |

Tests: 643/643 pass. TypeScript: clean. Architecture: no violations.
