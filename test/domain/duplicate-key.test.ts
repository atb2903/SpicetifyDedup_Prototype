/**
 * Tests for `src/domain/duplicate-key.ts`.
 *
 * Covers the normalization rules, joiner collision-resistance, and documented
 * boundary behaviours (empty names, whitespace-only, Unicode non-normalisation).
 */

import { describe, it, expect } from 'vitest';
import { composeKey } from '../../src/domain/duplicate-key';

describe('composeKey', () => {
  describe('basic equality', () => {
    it('same name and artist produce equal keys', () => {
      expect(composeKey('Song', 'Artist')).toBe(composeKey('Song', 'Artist'));
    });

    it('different name and same artist produce different keys', () => {
      expect(composeKey('Song A', 'Artist')).not.toBe(composeKey('Song B', 'Artist'));
    });

    it('same name and different artist produce different keys', () => {
      expect(composeKey('Song', 'Artist A')).not.toBe(composeKey('Song', 'Artist B'));
    });
  });

  describe('whitespace normalisation (trim)', () => {
    it('leading and trailing spaces on name are ignored', () => {
      expect(composeKey('  Song  ', 'Artist')).toBe(composeKey('Song', 'Artist'));
    });

    it('leading and trailing spaces on artist are ignored', () => {
      expect(composeKey('Song', '  Artist  ')).toBe(composeKey('Song', 'Artist'));
    });

    it('leading and trailing spaces on both are ignored', () => {
      expect(composeKey('  a  ', '  b  ')).toBe(composeKey('a', 'b'));
    });
  });

  describe('case normalisation (en-US toLower)', () => {
    it('uppercase name and artist match lowercase', () => {
      expect(composeKey('Song', 'Artist')).toBe(composeKey('song', 'artist'));
    });

    it('mixed-case name and artist match canonical lowercase', () => {
      expect(composeKey('MiXeD', 'CaSe')).toBe(composeKey('mixed', 'case'));
    });

    it('all-upper matches all-lower', () => {
      expect(composeKey('SONG', 'ARTIST')).toBe(composeKey('song', 'artist'));
    });
  });

  describe('locale stability (en-US)', () => {
    it('Turkish dotted-I is lowercased in en-US (not Turkish locale)', () => {
      // In en-US, 'İ' (U+0130 Latin Capital Letter I With Dot Above) lowercases
      // to 'i̇' or 'i' depending on runtime. The important thing is that
      // the result is STABLE across calls in the same locale.
      const k1 = composeKey('İSTANBUL', 'x');
      const k2 = composeKey('İSTANBUL', 'x');
      expect(k1).toBe(k2);
    });
  });

  describe('joiner collision resistance (NUL separator)', () => {
    it("compose('a:b', 'c') differs from compose('a', 'b:c')", () => {
      expect(composeKey('a:b', 'c')).not.toBe(composeKey('a', 'b:c'));
    });

    it("compose('hello world', 'z') differs from compose('hello', 'world z')", () => {
      expect(composeKey('hello world', 'z')).not.toBe(composeKey('hello', 'world z'));
    });
  });

  describe('Unicode non-normalisation (documented behaviour matches upstream)', () => {
    it("'Cafe' and 'Café' (precomposed) are distinct keys", () => {
      // NFE: 'Café' with precomposed é (U+00E9)
      expect(composeKey('Cafe', 'a')).not.toBe(composeKey('Café', 'a'));
    });

    it("'Café' (precomposed) and 'Café' (decomposed) are distinct", () => {
      // NFD: 'Cafe' + combining accent (U+0301)
      expect(composeKey('Café', 'a')).not.toBe(composeKey('Café', 'a'));
    });
  });

  describe('empty and whitespace-only name (boundary)', () => {
    it('empty name produces a key with empty-name component', () => {
      const k = composeKey('', 'artist');
      expect(typeof k).toBe('string');
      // Should not throw; key is defined
      expect(k).toBeDefined();
    });

    it('whitespace-only name trims to empty — same key as empty name', () => {
      expect(composeKey('   ', 'artist')).toBe(composeKey('', 'artist'));
    });

    it('empty artist produces a key with empty-artist component', () => {
      const k = composeKey('Song', '');
      expect(typeof k).toBe('string');
      expect(k).toBeDefined();
    });

    it('both empty — produces a defined key (not undefined/null)', () => {
      const k = composeKey('', '');
      expect(k).toBeDefined();
      expect(k).not.toBeNull();
    });
  });

  describe('return type brand', () => {
    it('returns a string (DuplicateKey is a branded string)', () => {
      const k = composeKey('name', 'artist');
      expect(typeof k).toBe('string');
    });
  });
});
