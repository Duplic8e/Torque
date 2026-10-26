import { describe, expect, it } from 'vitest';
import { hrefFor, parseHash } from '../src/router';

describe('parseHash', () => {
  it('parses known routes', () => {
    expect(parseHash('#/history')).toBe('history');
    expect(parseHash('#/settings')).toBe('settings');
  });
  it('ignores sub-paths and query strings', () => {
    expect(parseHash('#/schedule/oil')).toBe('schedule');
    expect(parseHash('#/costs?year=2026')).toBe('costs');
  });
  it('falls back to the dashboard', () => {
    expect(parseHash('')).toBe('dashboard');
    expect(parseHash('#/nope')).toBe('dashboard');
  });
  it('round-trips through hrefFor', () => {
    expect(parseHash(hrefFor('costs'))).toBe('costs');
  });
});
