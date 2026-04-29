import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';

describe('claudeJsonPath', () => {
  let origPlatform;
  let origEnv;

  beforeEach(() => {
    origPlatform = process.platform;
    origEnv = { ...process.env };
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: origPlatform, writable: true });
    process.env = origEnv;
  });

  it('uses HOME on non-Windows', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux', writable: true });
    process.env.HOME = '/home/testuser';
    const { claudeJsonPath } = await import('../../src/lib/platform.js?bust=' + Date.now());
    expect(claudeJsonPath()).toBe(join('/home/testuser', '.claude.json'));
  });

  it('uses USERPROFILE on Windows', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', writable: true });
    process.env.USERPROFILE = 'C:\\Users\\TestUser';
    const { claudeJsonPath } = await import('../../src/lib/platform.js?bust=' + Date.now());
    expect(claudeJsonPath()).toBe(join('C:\\Users\\TestUser', '.claude.json'));
  });

  it('returns a path ending in .claude.json', async () => {
    const { claudeJsonPath } = await import('../../src/lib/platform.js');
    expect(claudeJsonPath()).toMatch(/\.claude\.json$/);
  });
});

describe('vaultsRoot', () => {
  let origEnv;

  beforeEach(() => {
    origEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = origEnv;
  });

  it('returns VAULTKIT_HOME when set', async () => {
    process.env.VAULTKIT_HOME = '/custom/vaults';
    const { vaultsRoot } = await import('../../src/lib/platform.js?bust=' + Date.now());
    expect(vaultsRoot()).toBe('/custom/vaults');
  });

  it('falls back to HOME/vaults when VAULTKIT_HOME not set', async () => {
    delete process.env.VAULTKIT_HOME;
    const home = process.env.USERPROFILE ?? process.env.HOME ?? '';
    const { vaultsRoot } = await import('../../src/lib/platform.js?bust=' + Date.now());
    expect(vaultsRoot()).toBe(join(home, 'vaults'));
  });
});

describe('isWindows', () => {
  it('returns a boolean', async () => {
    const { isWindows } = await import('../../src/lib/platform.js');
    expect(typeof isWindows()).toBe('boolean');
  });

  it('returns true on win32', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', writable: true });
    const { isWindows } = await import('../../src/lib/platform.js?bust=' + Date.now());
    expect(isWindows()).toBe(true);
  });

  it('returns false on linux', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux', writable: true });
    const { isWindows } = await import('../../src/lib/platform.js?bust=' + Date.now());
    expect(isWindows()).toBe(false);
  });
});
