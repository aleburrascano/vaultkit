import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let tmp;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'vk-disconnect-test-')); });
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

function writeCfg(cfgPath, vaults) {
  const mcpServers = {};
  for (const [name, dir] of Object.entries(vaults)) {
    mcpServers[name] = { command: 'node', args: [`${dir}/.mcp-start.js`] };
  }
  writeFileSync(cfgPath, JSON.stringify({ mcpServers }), 'utf8');
}

function makeVaultDir(dir) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'CLAUDE.md'), '');
  mkdirSync(join(dir, 'raw'), { recursive: true });
  mkdirSync(join(dir, 'wiki'), { recursive: true });
}

describe('disconnect command', () => {
  it('throws for invalid vault name', async () => {
    const { run } = await import('../../src/commands/disconnect.js');
    await expect(
      run('bad/name', { cfgPath: join(tmp, '.claude.json'), skipConfirm: true })
    ).rejects.toThrow();
  });

  it('throws when vault not registered', async () => {
    const cfgPath = join(tmp, '.claude.json');
    writeFileSync(cfgPath, JSON.stringify({ mcpServers: {} }), 'utf8');
    const { run } = await import('../../src/commands/disconnect.js');
    await expect(
      run('Unknown', { cfgPath, skipConfirm: true })
    ).rejects.toThrow(/not registered/i);
  });

  it('throws when directory does not look like a vault', async () => {
    const dir = join(tmp, 'NotAVault');
    mkdirSync(dir);
    // Empty dir — no .obsidian, no CLAUDE.md+raw+wiki
    const cfgPath = join(tmp, '.claude.json');
    writeCfg(cfgPath, { NotAVault: dir });
    const { run } = await import('../../src/commands/disconnect.js');
    await expect(
      run('NotAVault', { cfgPath, skipConfirm: true })
    ).rejects.toThrow(/does not look like/i);
  });

  it('removes the local directory when skipConfirm is true', async () => {
    const vaultDir = join(tmp, 'MyVault');
    makeVaultDir(vaultDir);
    const cfgPath = join(tmp, '.claude.json');
    writeCfg(cfgPath, { MyVault: vaultDir });
    const { run } = await import('../../src/commands/disconnect.js');
    await run('MyVault', { cfgPath, skipConfirm: true, skipMcp: true });
    expect(existsSync(vaultDir)).toBe(false);
  });
});
