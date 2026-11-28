import { describe, expect, it } from 'vitest';
import { parseAiTemperature, resolveTrustProxy } from './env';

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

describe('parseAiTemperature', () => {
  it('returns null when unset, blank, or invalid', () => {
    expect(parseAiTemperature(undefined)).toBeNull();
    expect(parseAiTemperature('')).toBeNull();
    expect(parseAiTemperature('   ')).toBeNull();
    expect(parseAiTemperature('abc')).toBeNull();
    expect(parseAiTemperature('-0.1')).toBeNull();
    expect(parseAiTemperature('2.1')).toBeNull();
    expect(parseAiTemperature('Infinity')).toBeNull();
    expect(parseAiTemperature('NaN')).toBeNull();
  });

  it('parses valid temperatures in [0, 2] including 0', () => {
    expect(parseAiTemperature('0')).toBe(0);
    expect(parseAiTemperature('0.25')).toBe(0.25);
    expect(parseAiTemperature(' 0.7 ')).toBe(0.7);
    expect(parseAiTemperature('1')).toBe(1);
    expect(parseAiTemperature('2')).toBe(2);
  });
});
