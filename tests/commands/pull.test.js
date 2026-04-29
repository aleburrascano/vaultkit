import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execa } from 'execa';

let tmp;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'vk-pull-test-')); });
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

function writeCfg(cfgPath, vaults) {
  const mcpServers = {};
  for (const [name, dir] of Object.entries(vaults)) {
    mcpServers[name] = { command: 'node', args: [`${dir}/.mcp-start.js`] };
  }
  writeFileSync(cfgPath, JSON.stringify({ mcpServers }), 'utf8');
}

async function makeRepo(dir) {
  await execa('git', ['init', '-b', 'main', dir]);
  await execa('git', ['-C', dir, 'config', 'user.email', 'test@test.com']);
  await execa('git', ['-C', dir, 'config', 'user.name', 'Test']);
  writeFileSync(join(dir, 'README.md'), 'hello');
  await execa('git', ['-C', dir, 'add', '.']);
  await execa('git', ['-C', dir, 'commit', '-m', 'init']);
}

describe('pull command', () => {
  it('reports skipped vault when directory missing', async () => {
    const cfgPath = join(tmp, '.claude.json');
    writeCfg(cfgPath, { MissingVault: '/nonexistent/path/vault' });
    const { run } = await import('../../src/commands/pull.js');
    const lines = [];
    await run({ cfgPath, log: (msg) => lines.push(msg) });
    expect(lines.some(l => /missing|skip/i.test(l))).toBe(true);
  });

  it('reports already up to date for a local repo at HEAD', async () => {
    const bare = join(tmp, 'bare.git');
    const vaultDir = join(tmp, 'MyVault');
    await execa('git', ['init', '--bare', '-b', 'main', bare]);
    await execa('git', ['clone', bare, vaultDir]);
    await execa('git', ['-C', vaultDir, 'config', 'user.email', 'test@test.com']);
    await execa('git', ['-C', vaultDir, 'config', 'user.name', 'Test']);
    writeFileSync(join(vaultDir, 'README.md'), 'hello');
    await execa('git', ['-C', vaultDir, 'add', '.']);
    await execa('git', ['-C', vaultDir, 'commit', '-m', 'init']);
    await execa('git', ['-C', vaultDir, 'push', '-u', 'origin', 'main']);

    const cfgPath = join(tmp, '.claude.json');
    writeCfg(cfgPath, { MyVault: vaultDir });

    const { run } = await import('../../src/commands/pull.js');
    const lines = [];
    await run({ cfgPath, log: (msg) => lines.push(msg) });
    expect(lines.some(l => /up.to.date|already/i.test(l))).toBe(true);
  });

  it('handles empty registry gracefully', async () => {
    const cfgPath = join(tmp, '.claude.json');
    writeFileSync(cfgPath, JSON.stringify({ mcpServers: {} }), 'utf8');
    const { run } = await import('../../src/commands/pull.js');
    await run({ cfgPath, log: () => {} });
  });
});
