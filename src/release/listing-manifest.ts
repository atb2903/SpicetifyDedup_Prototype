/**
 * Typed shape of the Spicetify Marketplace **listing manifest** — the root
 * `manifest.json` the marketplace crawler reads to build a card (name,
 * description, preview, README, entry point).
 *
 * This is a *different* artifact from the spicetify-creator **install**
 * manifest (`dist/manifest.json` / `marketplace/dedup/manifest.json`), which
 * declares the in-client app's name/icons/subfiles. See ADR-0023 and
 * data-model.md §1 / INV-1 for the two-manifest split.
 *
 * Release tooling only — defined under `src/release/`, outside the app hexagon
 * (ADR-0001). Pure types: no React, no Zustand, no Spicetify, no filesystem.
 */

/**
 * A single credited author of the listing.
 *
 * Both fields are required and validated structurally:
 * - `name` — non-empty after trimming.
 * - `url` — an `http(s)` URL pointing at the author.
 */
export interface Author {
  /** Display name of the author; non-empty after trim. */
  readonly name: string;
  /** `http(s)` URL identifying the author (e.g. their GitHub profile). */
  readonly url: string;
}

/**
 * The validated listing manifest returned by `validateListingManifest`.
 *
 * Required fields are non-empty strings. `preview`, `main`, and `readme` are
 * each either a repo-root-relative path or an `http(s)` URL; for relative
 * paths only, `main` must end in `.js` (it is the marketplace entry point).
 * Optional fields, when present, match their element rules.
 */
export interface ListingManifest {
  /** Marketplace card title; non-empty after trim. */
  readonly name: string;
  /** Short description shown on the card; non-empty after trim. */
  readonly description: string;
  /** Preview image: a relative path or `http(s)` URL; non-empty. */
  readonly preview: string;
  /**
   * Entry point: a relative path (must end `.js`) or an `http(s)` URL;
   * non-empty.
   */
  readonly main: string;
  /** README source: a relative path or `http(s)` URL; non-empty. */
  readonly readme: string;
  /** Optional tags; when present, a non-empty array of non-empty strings. */
  readonly tags?: readonly string[];
  /** Optional credited authors; when present, each a valid {@link Author}. */
  readonly authors?: readonly Author[];
  /** Optional branch the crawler should read from; when present, non-empty. */
  readonly branch?: string;
}
