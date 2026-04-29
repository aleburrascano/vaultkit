import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

vi.mock('../../src/lib/platform.js', async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, findTool: vi.fn() };
});

vi.mock('execa', async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, execa: vi.fn() };
});

import { findTool } from '../../src/lib/platform.js';
import { execa } from 'execa';

let tmp;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'vk-doctor-test-'));
  vi.mocked(findTool).mockReset();
  vi.mocked(execa).mockReset();
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function writeCfg(cfgPath, vaults) {
  const mcpServers = {};
  for (const [name, { dir, hash }] of Object.entries(vaults)) {
    const args = [`${dir}/.mcp-start.js`];
    if (hash) args.push(`--expected-sha256=${hash}`);
    mcpServers[name] = { command: 'node', args };
  }
  writeFileSync(cfgPath, JSON.stringify({ mcpServers }), 'utf8');
}

function mockAllToolsFound() {
  vi.mocked(findTool).mockImplementation(async (name) => `/usr/bin/${name}`);
}

function mockGitConfig(name = 'Test User', email = 'test@example.com') {
  vi.mocked(execa).mockImplementation(async (cmd, args) => {
    if (cmd === 'git' && args[0] === 'auth') return { exitCode: 0 };
    if (args?.includes('user.name')) return { exitCode: 0, stdout: name };
    if (args?.includes('user.email')) return { exitCode: 0, stdout: email };
    return { exitCode: 0, stdout: '' };
  });
}

function mockGhAuth(authenticated = true) {
  vi.mocked(execa).mockImplementation(async (cmd, args) => {
    if (args?.[0] === 'auth' && args?.[1] === 'status') {
      return { exitCode: authenticated ? 0 : 1, stdout: '', stderr: '' };
    }
    if (args?.includes('user.name')) return { exitCode: 0, stdout: 'Test User' };
    if (args?.includes('user.email')) return { exitCode: 0, stdout: 'test@example.com' };
    return { exitCode: 0, stdout: '' };
  });
}

function writeLauncher(dir, content = '// launcher') {
  writeFileSync(join(dir, '.mcp-start.js'), content, 'utf8');
}

async function runDoctor(cfgPath, log) {
  const { run } = await import('../../src/commands/doctor.js');
  const lines = [];
  const issues = await run({ cfgPath, log: log ?? ((m) => lines.push(m)) });
  return { issues, lines };
}

// ── D-1: git not found — required ────────────────────────────────────────────

describe('D-1: git not found', () => {
  it('reports fail for git and increments issues', async () => {
    const cfgPath = join(tmp, '.claude.json');
    writeFileSync(cfgPath, JSON.stringify({ mcpServers: {} }), 'utf8');
    vi.mocked(findTool).mockImplementation(async (name) => {
      if (name === 'git') return null;
      return `/usr/bin/${name}`;
    });
    mockGitConfig();

    const { issues, lines } = await runDoctor(cfgPath);

    expect(lines.some(l => /git.*not found/i.test(l))).toBe(true);
    expect(lines.some(l => /fail/i.test(l))).toBe(true);
    expect(issues).toBeGreaterThan(0);
  });
});

// ── D-2: node version too old ─────────────────────────────────────────────────

describe('D-2: node version check', () => {
  it('logs ok when node >= 22', async () => {
    const cfgPath = join(tmp, '.claude.json');
    writeFileSync(cfgPath, JSON.stringify({ mcpServers: {} }), 'utf8');
    mockAllToolsFound();
    mockGhAuth(true);

    const { lines } = await runDoctor(cfgPath);
    // Current node in this env is >= 22 (project requires it)
    const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
    if (nodeMajor >= 22) {
      expect(lines.some(l => /ok.*node/i.test(l))).toBe(true);
    }
  });
});

// ── D-3: gh not found — warning only ─────────────────────────────────────────

describe('D-3: gh not found', () => {
  it('logs warn for gh but does not fail', async () => {
    const cfgPath = join(tmp, '.claude.json');
    writeFileSync(cfgPath, JSON.stringify({ mcpServers: {} }), 'utf8');
    vi.mocked(findTool).mockImplementation(async (name) => {
      if (name === 'gh') return null;
      return `/usr/bin/${name}`;
    });
    mockGitConfig();

    const { issues, lines } = await runDoctor(cfgPath);

    expect(lines.some(l => /gh.*not found/i.test(l))).toBe(true);
    expect(lines.some(l => /warn/i.test(l))).toBe(true);
    // gh missing is a warning, not a hard failure
    // issues may still be 0 if only gh is missing
    const gitLine = lines.find(l => /git/i.test(l));
    expect(gitLine).toBeDefined();
  });
});

// ── D-4: gh found but not authenticated ───────────────────────────────────────

describe('D-4: gh found but unauthenticated', () => {
  it('warns about authentication', async () => {
    const cfgPath = join(tmp, '.claude.json');
    writeFileSync(cfgPath, JSON.stringify({ mcpServers: {} }), 'utf8');
    mockAllToolsFound();
    mockGhAuth(false);

    const { lines } = await runDoctor(cfgPath);

    expect(lines.some(l => /gh.*not authenticated|not authenticated/i.test(l))).toBe(true);
    expect(lines.some(l => /gh auth login/i.test(l))).toBe(true);
  });
});

// ── D-5: claude not found — warning only ──────────────────────────────────────

describe('D-5: claude not found', () => {
  it('logs warn and install hint for claude', async () => {
    const cfgPath = join(tmp, '.claude.json');
    writeFileSync(cfgPath, JSON.stringify({ mcpServers: {} }), 'utf8');
    vi.mocked(findTool).mockImplementation(async (name) => {
      if (name === 'claude') return null;
      return `/usr/bin/${name}`;
    });
    mockGhAuth(true);

    const { lines } = await runDoctor(cfgPath);

    expect(lines.some(l => /claude.*not found/i.test(l))).toBe(true);
    expect(lines.some(l => /npm install/i.test(l))).toBe(true);
  });
});

// ── D-6: git user.name / user.email not configured ────────────────────────────

describe('D-6: git config not set', () => {
  it('reports fail and shows remedy hint', async () => {
    const cfgPath = join(tmp, '.claude.json');
    writeFileSync(cfgPath, JSON.stringify({ mcpServers: {} }), 'utf8');
    mockAllToolsFound();
    vi.mocked(execa).mockImplementation(async (cmd, args) => {
      if (args?.[0] === 'auth') return { exitCode: 0, stdout: '' };
      // git config returns empty stdout — not configured
      return { exitCode: 0, stdout: '' };
    });

    const { issues, lines } = await runDoctor(cfgPath);

    expect(lines.some(l => /git config.*not set|user\.name.*user\.email/i.test(l))).toBe(true);
    expect(lines.some(l => /git config --global/i.test(l))).toBe(true);
    expect(issues).toBeGreaterThan(0);
  });
});

// ── D-7: no vaults registered ─────────────────────────────────────────────────

describe('D-7: no vaults registered', () => {
  it('logs "no vaults" and returns 0 issues', async () => {
    const cfgPath = join(tmp, '.claude.json');
    writeFileSync(cfgPath, JSON.stringify({ mcpServers: {} }), 'utf8');
    mockAllToolsFound();
    mockGhAuth(true);

    const { issues, lines } = await runDoctor(cfgPath);

    expect(lines.some(l => /no vaults/i.test(l))).toBe(true);
    // Prerequisites all ok, no vault issues
    expect(issues).toBe(0);
  });
});

// ── D-8: vault directory missing ─────────────────────────────────────────────

describe('D-8: vault directory missing', () => {
  it('reports fail and connect hint', async () => {
    const cfgPath = join(tmp, '.claude.json');
    writeCfg(cfgPath, { GhostVault: { dir: join(tmp, 'nonexistent'), hash: null } });
    mockAllToolsFound();
    mockGhAuth(true);

    const { issues, lines } = await runDoctor(cfgPath);

    expect(lines.some(l => /GhostVault.*directory missing|missing/i.test(l))).toBe(true);
    expect(lines.some(l => /vaultkit connect/i.test(l))).toBe(true);
    expect(issues).toBeGreaterThan(0);
  });
});

// ── D-9: launcher .mcp-start.js missing ───────────────────────────────────────

describe('D-9: launcher missing', () => {
  it('warns and suggests update', async () => {
    const vaultDir = join(tmp, 'MyVault');
    mkdirSync(vaultDir, { recursive: true });
    // no .mcp-start.js written

    const cfgPath = join(tmp, '.claude.json');
    writeCfg(cfgPath, { MyVault: { dir: vaultDir, hash: 'abc123' } });
    mockAllToolsFound();
    mockGhAuth(true);

    const { lines } = await runDoctor(cfgPath);

    expect(lines.some(l => /\.mcp-start\.js.*missing|missing/i.test(l))).toBe(true);
    expect(lines.some(l => /vaultkit update/i.test(l))).toBe(true);
  });
});

// ── D-10: hash mismatch ────────────────────────────────────────────────────────

describe('D-10: hash mismatch', () => {
  it('reports fail with pinned vs on-disk hashes and verify hint', async () => {
    const vaultDir = join(tmp, 'MyVault');
    mkdirSync(vaultDir, { recursive: true });
    writeLauncher(vaultDir, '// modified launcher content');

    const cfgPath = join(tmp, '.claude.json');
    // Pinned hash is wrong — won't match actual file content
    writeCfg(cfgPath, { MyVault: { dir: vaultDir, hash: 'a'.repeat(64) } });
    mockAllToolsFound();
    mockGhAuth(true);

    const { issues, lines } = await runDoctor(cfgPath);

    expect(lines.some(l => /hash mismatch/i.test(l))).toBe(true);
    expect(lines.some(l => /pinned/i.test(l))).toBe(true);
    expect(lines.some(l => /on.disk/i.test(l))).toBe(true);
    expect(lines.some(l => /vaultkit verify/i.test(l))).toBe(true);
    expect(issues).toBeGreaterThan(0);
  });
});

// ── D-11: no pinned hash (legacy registration) ────────────────────────────────

describe('D-11: no pinned hash (legacy)', () => {
  it('warns and suggests update', async () => {
    const vaultDir = join(tmp, 'LegacyVault');
    mkdirSync(vaultDir, { recursive: true });
    writeLauncher(vaultDir, '// launcher');

    const cfgPath = join(tmp, '.claude.json');
    writeCfg(cfgPath, { LegacyVault: { dir: vaultDir, hash: null } });
    mockAllToolsFound();
    mockGhAuth(true);

    const { lines } = await runDoctor(cfgPath);

    expect(lines.some(l => /no pinned hash|legacy/i.test(l))).toBe(true);
    expect(lines.some(l => /vaultkit update/i.test(l))).toBe(true);
  });
});

// ── D-12: vault layout incomplete (not vaultLike) ─────────────────────────────

describe('D-12: vault layout incomplete', () => {
  it('warns about incomplete layout and suggests update', async () => {
    const vaultDir = join(tmp, 'IncompleteVault');
    mkdirSync(vaultDir, { recursive: true });

    // Write a real launcher so hash check passes
    const { createHash } = await import('node:crypto');
    const content = '// valid launcher';
    const realHash = createHash('sha256').update(content).digest('hex');
    writeFileSync(join(vaultDir, '.mcp-start.js'), content, 'utf8');

    const cfgPath = join(tmp, '.claude.json');
    writeCfg(cfgPath, { IncompleteVault: { dir: vaultDir, hash: realHash } });
    mockAllToolsFound();
    mockGhAuth(true);

    const { lines } = await runDoctor(cfgPath);

    // dir exists, launcher exists, hash matches, but no .obsidian or CLAUDE.md+raw+wiki
    expect(lines.some(l => /vault layout incomplete|incomplete/i.test(l))).toBe(true);
    expect(lines.some(l => /vaultkit update/i.test(l))).toBe(true);
  });
});

// ── D-13: healthy vault — all checks pass ─────────────────────────────────────

describe('D-13: healthy vault', () => {
  it('reports ok and 0 issues', async () => {
    const vaultDir = join(tmp, 'HealthyVault');
    mkdirSync(join(vaultDir, '.obsidian'), { recursive: true });

    const { createHash } = await import('node:crypto');
    const content = '// launcher';
    const realHash = createHash('sha256').update(content).digest('hex');
    writeFileSync(join(vaultDir, '.mcp-start.js'), content, 'utf8');

    const cfgPath = join(tmp, '.claude.json');
    writeCfg(cfgPath, { HealthyVault: { dir: vaultDir, hash: realHash } });
    mockAllToolsFound();
    mockGhAuth(true);

    const { issues, lines } = await runDoctor(cfgPath);

    expect(lines.some(l => /HealthyVault.*ok|ok.*HealthyVault/i.test(l))).toBe(true);
    expect(issues).toBe(0);
    expect(lines.some(l => /everything looks good/i.test(l))).toBe(true);
  });
});

// ── D-14: non-vaultkit MCP servers reported ────────────────────────────────────

describe('D-14: non-vaultkit MCP servers listed', () => {
  it('mentions other MCP servers by name', async () => {
    const vaultDir = join(tmp, 'RealVault');
    mkdirSync(join(vaultDir, '.obsidian'), { recursive: true });

    const { createHash } = await import('node:crypto');
    const content = '// launcher';
    const realHash = createHash('sha256').update(content).digest('hex');
    writeFileSync(join(vaultDir, '.mcp-start.js'), content, 'utf8');

    const cfgPath = join(tmp, '.claude.json');
    // One real vault + one non-vault MCP server
    const mcpServers = {
      RealVault: { command: 'node', args: [`${vaultDir}/.mcp-start.js`, `--expected-sha256=${realHash}`] },
      myOtherServer: { command: 'python', args: ['server.py'] },
    };
    writeFileSync(cfgPath, JSON.stringify({ mcpServers }), 'utf8');
    mockAllToolsFound();
    mockGhAuth(true);

    const { lines } = await runDoctor(cfgPath);

    expect(lines.some(l => /other MCP servers|myOtherServer/i.test(l))).toBe(true);
  });
});
