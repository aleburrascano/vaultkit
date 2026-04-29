import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { _normalizeInput } from '../../src/commands/connect.js';

let tmp;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'vk-connect-test-')); });
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

describe('_normalizeInput', () => {
  it('accepts owner/repo format', () => {
    expect(_normalizeInput('owner/MyVault')).toEqual({ repo: 'owner/MyVault', name: 'MyVault' });
  });

  it('accepts https GitHub URL', () => {
    expect(_normalizeInput('https://github.com/owner/MyVault')).toEqual({
      repo: 'owner/MyVault', name: 'MyVault',
    });
  });

  it('accepts https GitHub URL with .git suffix', () => {
    expect(_normalizeInput('https://github.com/owner/MyVault.git')).toEqual({
      repo: 'owner/MyVault', name: 'MyVault',
    });
  });

  it('accepts git@ SSH URL', () => {
    expect(_normalizeInput('git@github.com:owner/MyVault.git')).toEqual({
      repo: 'owner/MyVault', name: 'MyVault',
    });
  });

  it('throws for unrecognized format', () => {
    expect(() => _normalizeInput('not-a-repo')).toThrow(/unrecognized/i);
    expect(() => _normalizeInput('http://example.com/repo')).toThrow(/unrecognized/i);
  });
});
