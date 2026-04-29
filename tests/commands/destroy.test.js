import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let tmp;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'vk-destroy-test-')); });
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

function writeCfg(cfgPath, vaults) {
  const mcpServers = {};
  for (const [name, dir] of Object.entries(vaults)) {
    mcpServers[name] = { command: 'node', args: [`${dir}/.mcp-start.js`] };
  }
  writeFileSync(cfgPath, JSON.stringify({ mcpServers }), 'utf8');
}

describe('destroy command', () => {
  it('throws for invalid vault name', async () => {
    const { run } = await import('../../src/commands/destroy.js');
    await expect(run('bad/name', { cfgPath: join(tmp, '.claude.json'), skipConfirm: true })).rejects.toThrow();
  });

  it('throws when vault not registered', async () => {
    const cfgPath = join(tmp, '.claude.json');
    writeFileSync(cfgPath, JSON.stringify({ mcpServers: {} }), 'utf8');
    const { run } = await import('../../src/commands/destroy.js');
    await expect(run('Unknown', { cfgPath, skipConfirm: true })).rejects.toThrow(/not.*registered/i);
  });

  it('throws when directory does not look like a vault', async () => {
    const dir = join(tmp, 'BadDir');
    mkdirSync(dir);
    const cfgPath = join(tmp, '.claude.json');
    writeCfg(cfgPath, { BadDir: dir });
    const { run } = await import('../../src/commands/destroy.js');
    await expect(run('BadDir', { cfgPath, skipConfirm: true })).rejects.toThrow(/does not look like/i);
  });

  it('deletes local directory with skipConfirm and skipMcp', async () => {
    const vaultDir = join(tmp, 'MyVault');
    mkdirSync(vaultDir);
    writeFileSync(join(vaultDir, 'CLAUDE.md'), '');
    mkdirSync(join(vaultDir, 'raw'));
    mkdirSync(join(vaultDir, 'wiki'));
    const cfgPath = join(tmp, '.claude.json');
    writeCfg(cfgPath, { MyVault: vaultDir });
    const { run } = await import('../../src/commands/destroy.js');
    await run('MyVault', { cfgPath, skipConfirm: true, skipMcp: true });
    const { existsSync } = await import('node:fs');
    expect(existsSync(vaultDir)).toBe(false);
  });
});
