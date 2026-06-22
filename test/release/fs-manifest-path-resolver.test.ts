import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FsManifestPathResolver } from '../../src/release/fs-manifest-path-resolver';
import type { ManifestPathResolver } from '../../src/release/manifest-path-resolver';

describe('FsManifestPathResolver', () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'fs-manifest-resolver-'));
    writeFileSync(join(root, 'preview.png'), 'png-bytes');
    mkdirSync(join(root, 'sub'));
    writeFileSync(join(root, 'sub', 'index.js'), 'code');
    // A directory at a path — must NOT count as an existing file.
    mkdirSync(join(root, 'a-directory'));
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('implements the ManifestPathResolver port', () => {
    const resolver: ManifestPathResolver = new FsManifestPathResolver(root);
    expect(typeof resolver.exists).toBe('function');
  });

  it('returns true for an existing file (top level)', () => {
    const resolver = new FsManifestPathResolver(root);
    expect(resolver.exists('preview.png')).toBe(true);
  });

  it('returns true for an existing file in a subdirectory', () => {
    const resolver = new FsManifestPathResolver(root);
    expect(resolver.exists('sub/index.js')).toBe(true);
  });

  it('returns false for a missing path', () => {
    const resolver = new FsManifestPathResolver(root);
    expect(resolver.exists('does-not-exist.png')).toBe(false);
  });

  it('returns false for a path that is a directory, not a file', () => {
    const resolver = new FsManifestPathResolver(root);
    expect(resolver.exists('a-directory')).toBe(false);
  });
});
