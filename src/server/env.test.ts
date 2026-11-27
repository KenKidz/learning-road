import { describe, expect, it } from 'vitest';
import { resolveTrustProxy } from './env';

describe('resolveTrustProxy', () => {
  it('defaults to 1 hop in production and loopback outside production', () => {
    expect(resolveTrustProxy(undefined, 'production')).toBe(1);
    expect(resolveTrustProxy('', 'production')).toBe(1);
    expect(resolveTrustProxy(undefined, 'development')).toBe('loopback');
    expect(resolveTrustProxy(undefined, 'test')).toBe('loopback');
  });

  it('parses explicit boolean, numeric, and named values', () => {
    expect(resolveTrustProxy('true', 'development')).toBe(true);
    expect(resolveTrustProxy('FALSE', 'production')).toBe(false);
    expect(resolveTrustProxy('2', 'production')).toBe(2);
    expect(resolveTrustProxy('loopback', 'production')).toBe('loopback');
  });
});
