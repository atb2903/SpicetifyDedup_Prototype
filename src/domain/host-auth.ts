/**
 * Shared host auth-expired predicate for the host adapters.
 *
 * The single canonical definition of "does this host rejection look like an
 * expired/invalid access token?", consumed by both
 * `spicetify-tracks-enumerator.ts` (FR-006) and
 * `spicetify-playlists-loader.ts` (FR-007). Centralizing it removes the two
 * near-identical per-adapter copies that could drift again — the very class of
 * bug FR-007 exists to prevent.
 *
 * Pure — no React, no Zustand, no Spicetify, no adapter/port/store/ui imports.
 * Safe to import from any layer.
 */

/**
 * True iff `cause` looks like a host auth-expired rejection.
 *
 * Inspects `code` — the field `Spicetify.CosmosAsync` actually populates for HTTP
 * errors (`{ code, error, message, stack }`, ADR-0010), NOT `status`. A cold
 * rejection therefore carries `code === 401`; the old `status`-based heuristic
 * never matched it. Message-substring fallbacks cover host errors that surface as
 * a plain `Error` whose `message` carries the signal instead of a `code`:
 *   - `code === 401`
 *   - `"401"` anywhere in the message
 *   - `"token"` together with (`"expired"` | `"invalid"`) in the message
 *
 * @param cause - The originating rejection value (host APIs reject with `unknown`).
 * @returns `true` if the rejection matches an auth-expired signal, `false` otherwise.
 *
 * @example
 * ```ts
 * looksLikeHostAuthExpired({ code: 401 });            // true
 * looksLikeHostAuthExpired({ status: 401 });          // false (corrected field)
 * looksLikeHostAuthExpired(new Error('token expired'));// true
 * ```
 */
export function looksLikeHostAuthExpired(cause: unknown): boolean {
  if (typeof cause !== 'object' || cause === null) return false;
  const code = (cause as { code?: unknown }).code;
  if (code === 401) return true;
  const message = (cause as { message?: unknown }).message;
  if (typeof message !== 'string') return false;
  const lower = message.toLowerCase();
  if (lower.includes('401')) return true;
  return lower.includes('token') && (lower.includes('expired') || lower.includes('invalid'));
}
