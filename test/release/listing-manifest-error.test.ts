import { describe, it, expect } from 'vitest';
import {
  ListingManifestError,
  isListingManifestError,
  type ListingManifestErrorReason,
} from '../../src/release/listing-manifest-error';

const ALL_REASONS: ListingManifestErrorReason[] = [
  'not-an-object',
  'missing-required-field',
  'field-wrong-type',
  'field-empty',
  'main-not-js',
  'tags-invalid',
  'authors-invalid',
  'path-not-found',
];

describe('ListingManifestError', () => {
  it('is an Error subclass with name "ListingManifestError"', () => {
    const err = new ListingManifestError('not-an-object', 'boom');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('ListingManifestError');
    expect(err.message).toBe('boom');
  });

  it.each(ALL_REASONS)('preserves reason %s', (reason) => {
    const err = new ListingManifestError(reason, 'm');
    expect(err.reason).toBe(reason);
  });

  it('preserves the optional field when provided', () => {
    const err = new ListingManifestError('field-empty', 'm', { field: 'name' });
    expect(err.field).toBe('name');
  });

  it('preserves the optional cause when provided', () => {
    const root = new Error('root');
    const err = new ListingManifestError('not-an-object', 'm', { cause: root });
    expect(err.cause).toBe(root);
  });

  it('leaves field undefined when options omitted', () => {
    const err = new ListingManifestError('not-an-object', 'm');
    expect(err.field).toBeUndefined();
    expect(err.cause).toBeUndefined();
  });

  it('leaves field undefined when options present but field absent', () => {
    const err = new ListingManifestError('not-an-object', 'm', {});
    expect(err.field).toBeUndefined();
  });

  it('leaves cause undefined when cause explicitly undefined', () => {
    const err = new ListingManifestError('not-an-object', 'm', {
      cause: undefined,
    });
    expect(err.cause).toBeUndefined();
  });

  it('leaves field undefined when field explicitly undefined', () => {
    const err = new ListingManifestError('field-empty', 'm', {
      field: undefined,
    });
    expect(err.field).toBeUndefined();
  });
});

describe('isListingManifestError', () => {
  it('returns true for a ListingManifestError instance', () => {
    expect(isListingManifestError(new ListingManifestError('not-an-object', 'm'))).toBe(
      true,
    );
  });

  it('returns false for a plain Error', () => {
    expect(isListingManifestError(new Error('x'))).toBe(false);
  });

  it('returns false for null', () => {
    expect(isListingManifestError(null)).toBe(false);
  });

  it('returns false for arbitrary values', () => {
    expect(isListingManifestError({ reason: 'not-an-object' })).toBe(false);
    expect(isListingManifestError('not-an-object')).toBe(false);
    expect(isListingManifestError(42)).toBe(false);
    expect(isListingManifestError(undefined)).toBe(false);
  });
});
