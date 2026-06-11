/**
 * Branded duplicate-match key for the name+artist dedup heuristic.
 *
 * Keeping the key logic in its own module lets the algorithm stay focused on
 * grouping logic, and makes the normalisation rules independently testable.
 *
 * Design decisions:
 * - Locale pinned to `'en-US'` so results are stable across environments with
 *   different default locales (e.g. systems set to `tr-TR` where `'İ'` would
 *   lower-case differently).
 * - Unicode normalisation is NOT applied. `'Cafe'` and `'Café'` produce
 *   distinct keys — this matches the upstream `JMPerez/spotify-dedup`
 *   behaviour exactly (A-002 forbids divergence).
 * - The joiner is the NUL character (`\0`), which cannot appear in a Spotify
 *   catalog text field (all responses are valid UTF-8 without NUL). This
 *   guarantees `compose('a:b', 'c')` ≠ `compose('a', 'b:c')`.
 */

/**
 * An opaque, normalised string used as the match key for the name+artist
 * duplicate heuristic (FR-005). Only `composeKey` can produce a valid
 * `DuplicateKey`; the brand prevents arbitrary strings from being passed
 * where a normalised key is expected.
 */
export type DuplicateKey = string & { readonly __brand: 'DuplicateKey' };

/**
 * Build a `DuplicateKey` from a track's display name and first-artist name.
 *
 * Normalisation applied to each input independently:
 * 1. `.trim()` — removes leading/trailing whitespace including `\t`, `\n`, etc.
 * 2. `.toLocaleLowerCase('en-US')` — case-folds to lower in the en-US locale.
 *
 * The two normalised values are joined with a NUL character (`'\0'`), which
 * cannot appear in any valid Spotify catalog field. This guarantees that
 * `composeKey('a:b', 'c')` ≠ `composeKey('a', 'b:c')`.
 *
 * Empty or whitespace-only inputs are accepted — they normalise to the empty
 * string and the key is still well-defined (the algorithm treats it as a valid
 * bucket; multiple tracks with the same empty name + same artist + close
 * duration will match, which is the documented behaviour).
 *
 * @param name - Track display name as returned by the catalog.
 * @param firstArtistName - Name of the first artist in the track's artist list.
 * @returns A branded, normalised key suitable for use as a `Map` key.
 */
export function composeKey(name: string, firstArtistName: string): DuplicateKey {
  const normName = name.trim().toLocaleLowerCase('en-US');
  const normArtist = firstArtistName.trim().toLocaleLowerCase('en-US');
  return `${normName}\0${normArtist}` as DuplicateKey;
}
