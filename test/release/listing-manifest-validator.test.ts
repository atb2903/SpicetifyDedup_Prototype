import { describe, it, expect } from 'vitest';
import {
  validateListingManifest,
  isValidListingManifest,
} from '../../src/release/listing-manifest-validator';
import {
  ListingManifestError,
  isListingManifestError,
} from '../../src/release/listing-manifest-error';

/** A minimal, fully-valid manifest object (all required, no optionals). */
function validBase(): Record<string, unknown> {
  return {
    name: 'Dedup',
    description: 'Find and remove duplicate tracks.',
    preview: 'preview.png',
    main: 'marketplace/dedup/index.js',
    readme: 'README.md',
  };
}

/** Assert the thrown value is a ListingManifestError with the given reason/field. */
function expectThrow(
  value: unknown,
  reason: string,
  field?: string,
): void {
  let thrown: unknown;
  try {
    validateListingManifest(value);
  } catch (e) {
    thrown = e;
  }
  expect(isListingManifestError(thrown)).toBe(true);
  const err = thrown as ListingManifestError;
  expect(err.reason).toBe(reason);
  if (field !== undefined) {
    expect(err.field).toBe(field);
  }
}

const REQUIRED_FIELDS = [
  'name',
  'description',
  'preview',
  'main',
  'readme',
] as const;

describe('validateListingManifest — non-object inputs', () => {
  it.each([
    ['null', null],
    ['array', []],
    ['string', 'x'],
    ['number', 42],
    ['undefined', undefined],
    ['boolean', true],
  ])('throws not-an-object for %s', (_label, value) => {
    expectThrow(value, 'not-an-object');
  });
});

describe('validateListingManifest — required fields', () => {
  for (const field of REQUIRED_FIELDS) {
    it(`throws missing-required-field when ${field} is absent`, () => {
      const obj = validBase();
      delete obj[field];
      expectThrow(obj, 'missing-required-field', field);
    });

    it(`throws field-wrong-type when ${field} is a number`, () => {
      const obj = validBase();
      obj[field] = 123;
      expectThrow(obj, 'field-wrong-type', field);
    });

    it(`throws field-empty when ${field} is an empty string`, () => {
      const obj = validBase();
      obj[field] = '';
      // `main` empty: it is a non-URL string not ending .js, but emptiness is
      // checked first, so field-empty wins.
      expectThrow(obj, 'field-empty', field);
    });

    it(`throws field-empty when ${field} is whitespace`, () => {
      const obj = validBase();
      obj[field] = '   ';
      expectThrow(obj, 'field-empty', field);
    });
  }
});

describe('validateListingManifest — main path rule', () => {
  it('throws main-not-js for a relative path not ending .js', () => {
    const obj = validBase();
    obj.main = 'marketplace/dedup/index.ts';
    expectThrow(obj, 'main-not-js', 'main');
  });

  it('accepts a relative .js path for main', () => {
    const obj = validBase();
    obj.main = 'a/b/c.js';
    expect(validateListingManifest(obj).main).toBe('a/b/c.js');
  });

  it('accepts an https URL for main (no .js rule)', () => {
    const obj = validBase();
    obj.main = 'https://example.com/entry';
    expect(validateListingManifest(obj).main).toBe('https://example.com/entry');
  });

  it('accepts an http URL for main', () => {
    const obj = validBase();
    obj.main = 'http://example.com/entry';
    expect(validateListingManifest(obj).main).toBe('http://example.com/entry');
  });

  it('accepts http(s) URLs for preview and readme (no .js rule)', () => {
    const obj = validBase();
    obj.preview = 'https://example.com/p.png';
    obj.readme = 'https://example.com/README.md';
    const out = validateListingManifest(obj);
    expect(out.preview).toBe('https://example.com/p.png');
    expect(out.readme).toBe('https://example.com/README.md');
  });
});

describe('validateListingManifest — tags', () => {
  it('accepts absent tags', () => {
    expect(validateListingManifest(validBase()).tags).toBeUndefined();
  });

  it('accepts a valid string[] tags', () => {
    const obj = validBase();
    obj.tags = ['a', 'b'];
    expect(validateListingManifest(obj).tags).toEqual(['a', 'b']);
  });

  it('accepts an empty tags array', () => {
    const obj = validBase();
    obj.tags = [];
    expect(validateListingManifest(obj).tags).toEqual([]);
  });

  it('throws tags-invalid when tags is not an array', () => {
    const obj = validBase();
    obj.tags = 'a';
    expectThrow(obj, 'tags-invalid', 'tags');
  });

  it('throws tags-invalid when tags contains a non-string', () => {
    const obj = validBase();
    obj.tags = ['a', 1];
    expectThrow(obj, 'tags-invalid', 'tags');
  });

  it('throws tags-invalid when tags contains an empty string', () => {
    const obj = validBase();
    obj.tags = ['a', '  '];
    expectThrow(obj, 'tags-invalid', 'tags');
  });
});

describe('validateListingManifest — authors', () => {
  it('accepts absent authors', () => {
    expect(validateListingManifest(validBase()).authors).toBeUndefined();
  });

  it('accepts a valid authors array', () => {
    const obj = validBase();
    obj.authors = [{ name: 'alex', url: 'https://github.com/alex' }];
    expect(validateListingManifest(obj).authors).toEqual([
      { name: 'alex', url: 'https://github.com/alex' },
    ]);
  });

  it('accepts an empty authors array', () => {
    const obj = validBase();
    obj.authors = [];
    expect(validateListingManifest(obj).authors).toEqual([]);
  });

  it('throws authors-invalid when authors is not an array', () => {
    const obj = validBase();
    obj.authors = {};
    expectThrow(obj, 'authors-invalid', 'authors');
  });

  it('throws authors-invalid when an item is not an object', () => {
    const obj = validBase();
    obj.authors = ['nope'];
    expectThrow(obj, 'authors-invalid', 'authors');
  });

  it('throws authors-invalid when an item is null', () => {
    const obj = validBase();
    obj.authors = [null];
    expectThrow(obj, 'authors-invalid', 'authors');
  });

  it('throws authors-invalid when an item is missing name', () => {
    const obj = validBase();
    obj.authors = [{ url: 'https://x.com' }];
    expectThrow(obj, 'authors-invalid', 'authors');
  });

  it('throws authors-invalid when an item name is empty', () => {
    const obj = validBase();
    obj.authors = [{ name: '  ', url: 'https://x.com' }];
    expectThrow(obj, 'authors-invalid', 'authors');
  });

  it('throws authors-invalid when an item name is not a string', () => {
    const obj = validBase();
    obj.authors = [{ name: 1, url: 'https://x.com' }];
    expectThrow(obj, 'authors-invalid', 'authors');
  });

  it('throws authors-invalid when an item is missing url', () => {
    const obj = validBase();
    obj.authors = [{ name: 'alex' }];
    expectThrow(obj, 'authors-invalid', 'authors');
  });

  it('throws authors-invalid when an item url is not a string', () => {
    const obj = validBase();
    obj.authors = [{ name: 'alex', url: 5 }];
    expectThrow(obj, 'authors-invalid', 'authors');
  });

  it('throws authors-invalid when an item url is not http(s)', () => {
    const obj = validBase();
    obj.authors = [{ name: 'alex', url: 'ftp://x.com' }];
    expectThrow(obj, 'authors-invalid', 'authors');
  });

  it('accepts an http (non-s) author url', () => {
    const obj = validBase();
    obj.authors = [{ name: 'alex', url: 'http://x.com' }];
    expect(validateListingManifest(obj).authors).toEqual([
      { name: 'alex', url: 'http://x.com' },
    ]);
  });
});

describe('validateListingManifest — branch', () => {
  it('accepts absent branch', () => {
    expect(validateListingManifest(validBase()).branch).toBeUndefined();
  });

  it('accepts a non-empty branch string', () => {
    const obj = validBase();
    obj.branch = 'main';
    expect(validateListingManifest(obj).branch).toBe('main');
  });

  it('throws field-wrong-type when branch is not a string', () => {
    const obj = validBase();
    obj.branch = 7;
    expectThrow(obj, 'field-wrong-type', 'branch');
  });

  it('throws field-empty when branch is whitespace', () => {
    const obj = validBase();
    obj.branch = '  ';
    expectThrow(obj, 'field-empty', 'branch');
  });
});

describe('validateListingManifest — fully valid', () => {
  it('returns the typed manifest with no optionals', () => {
    const out = validateListingManifest(validBase());
    expect(out).toEqual(validBase());
  });

  it('returns the typed manifest with all optionals present', () => {
    const obj = validBase();
    obj.tags = ['util'];
    obj.authors = [{ name: 'alex', url: 'https://github.com/alex' }];
    obj.branch = 'main';
    const out = validateListingManifest(obj);
    expect(out.tags).toEqual(['util']);
    expect(out.authors).toEqual([{ name: 'alex', url: 'https://github.com/alex' }]);
    expect(out.branch).toBe('main');
  });
});

describe('isValidListingManifest', () => {
  it('returns true for a valid manifest', () => {
    expect(isValidListingManifest(validBase())).toBe(true);
  });

  it('returns false for a malformed manifest (and never throws)', () => {
    const obj = validBase();
    delete obj.name;
    expect(isValidListingManifest(obj)).toBe(false);
  });

  it('returns false for garbage inputs without throwing', () => {
    expect(isValidListingManifest(null)).toBe(false);
    expect(isValidListingManifest(undefined)).toBe(false);
    expect(isValidListingManifest('x')).toBe(false);
    expect(isValidListingManifest(42)).toBe(false);
    expect(isValidListingManifest([])).toBe(false);
    expect(isValidListingManifest({ random: true })).toBe(false);
  });
});
