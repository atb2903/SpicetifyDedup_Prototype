/**
 * Port isolating filesystem path-existence from the pure listing-manifest
 * validator (ADR-0023). The validator stays pure; whether a relative
 * `preview`/`main`/`readme` target resolves to a real file is checked through
 * this seam, so unit tests can drive the present/absent boundary with a fake.
 *
 * Release tooling only; pure interface — no Spicetify, no React.
 */

/**
 * Resolves repo-root-relative listing-manifest paths to file existence.
 *
 * Implemented by `FsManifestPathResolver` (real `node:fs`, bound to a repo
 * root) and `FakeManifestPathResolver` (a fixed known set, for tests).
 */
export interface ManifestPathResolver {
  /**
   * @param relativePath - A repo-root-relative path from a manifest field.
   * @returns `true` iff that path resolves to an existing file.
   */
  exists(relativePath: string): boolean;
}
