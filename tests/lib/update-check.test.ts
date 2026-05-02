import { describe, it, expect } from 'vitest';
import { _isNewer } from '../../src/lib/update-check.js';

describe('_isNewer', () => {
  it('returns true when latest patch > current patch', () => {
    expect(_isNewer('2.5.1', '2.5.0')).toBe(true);
  });

  it('returns true when latest minor > current minor', () => {
    expect(_isNewer('2.6.0', '2.5.99')).toBe(true);
  });

  it('returns true when latest major > current major', () => {
    expect(_isNewer('3.0.0', '2.99.99')).toBe(true);
  });

  it('returns false on equal versions', () => {
    expect(_isNewer('2.5.0', '2.5.0')).toBe(false);
  });

  it('returns false when current is newer', () => {
    expect(_isNewer('2.4.0', '2.5.0')).toBe(false);
    expect(_isNewer('1.99.99', '2.0.0')).toBe(false);
  });

  it('treats missing components as 0', () => {
    expect(_isNewer('2.5', '2.5.0')).toBe(false);
    expect(_isNewer('2.5.0', '2.5')).toBe(false);
    expect(_isNewer('2.6', '2.5.99')).toBe(true);
  });

  it('returns false on non-numeric components rather than throwing', () => {
    expect(_isNewer('garbage', '2.5.0')).toBe(false);
    expect(_isNewer('2.5.0', 'garbage')).toBe(false);
    expect(_isNewer('2.5.beta', '2.5.0')).toBe(false);
  });
});
