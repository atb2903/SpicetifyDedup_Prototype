import { describe, it, expect } from 'vitest';
import { FakeManifestPathResolver } from '../../src/release/fake-manifest-path-resolver';
import type { ManifestPathResolver } from '../../src/release/manifest-path-resolver';

describe('FakeManifestPathResolver', () => {
  it('implements the ManifestPathResolver port', () => {
    const resolver: ManifestPathResolver = new FakeManifestPathResolver([]);
    expect(typeof resolver.exists).toBe('function');
  });

  it('returns true for a path in the known set', () => {
    const resolver = new FakeManifestPathResolver(['preview.png', 'README.md']);
    expect(resolver.exists('preview.png')).toBe(true);
    expect(resolver.exists('README.md')).toBe(true);
  });

  it('returns false for a path not in the known set', () => {
    const resolver = new FakeManifestPathResolver(['preview.png']);
    expect(resolver.exists('missing.png')).toBe(false);
  });

  it('returns false when constructed with no paths', () => {
    const resolver = new FakeManifestPathResolver([]);
    expect(resolver.exists('anything')).toBe(false);
  });
});
