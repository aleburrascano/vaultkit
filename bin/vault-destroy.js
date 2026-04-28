#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const cwd = resolve(import.meta.dirname, '..');
const env = { ...process.env };
env.VAULT_INIT_CWD = process.cwd();

let bash = 'bash';

if (process.platform === 'win32') {
  const toUnix = p => p
    .replace(/\\/g, '/')
    .replace(/^([A-Za-z]):\//, (_, d) => `/${d.toLowerCase()}/`)
    .replace(/\/$/, '');

  env.VAULT_INIT_CWD = toUnix(process.cwd());

  const gitRoots = [
    process.env.PROGRAMFILES         && join(process.env.PROGRAMFILES,         'Git'),
    process.env['PROGRAMFILES(X86)'] && join(process.env['PROGRAMFILES(X86)'], 'Git'),
    process.env.LOCALAPPDATA         && join(process.env.LOCALAPPDATA,         'Programs', 'Git'),
  ].filter(Boolean);

  let bashPath = null;
  for (const root of gitRoots) {
    const candidate = join(root, 'bin', 'bash.exe');
    if (existsSync(candidate)) { bashPath = candidate; break; }
  }

  if (!bashPath) {
    const where = spawnSync('where', ['bash'], { encoding: 'utf8' });
    const found = (where.stdout || '').trim().split('\n')
      .map(s => s.trim())
      .filter(s => s && !s.toLowerCase().includes('system32'));
    if (found.length > 0) {
      bashPath = found[0];
    } else {
      process.stderr.write(
        'vault-destroy: Git for Windows bash not found.\n' +
        'Install Git for Windows: https://git-scm.com\n'
      );
      process.exit(1);
    }
  }
  bash = bashPath;

  const REQUIRED = [
    { name: 'gh', url: 'https://cli.github.com' },
  ];

  const toolDirs = new Set([dirname(bash), dirname(process.execPath)]);
  const missing = [];

  for (const { name, url } of REQUIRED) {
    const r = spawnSync('where', [name], { encoding: 'utf8' });
    if (r.status === 0 && r.stdout.trim()) {
      toolDirs.add(dirname(r.stdout.trim().split('\n')[0].trim()));
    } else {
      missing.push(`  ${name.padEnd(6)} → ${url}`);
    }
  }

  if (missing.length > 0) {
    process.stderr.write('vault-destroy: missing required tools:\n' + missing.join('\n') + '\n');
    process.exit(1);
  }

  // Optional: find claude for MCP removal
  const claudeWhere = spawnSync('where', ['claude'], { encoding: 'utf8' });
  if (claudeWhere.status === 0 && claudeWhere.stdout.trim()) {
    toolDirs.add(dirname(claudeWhere.stdout.trim().split('\n')[0].trim()));
  }

  const existing = (env.PATH || '').split(';').filter(Boolean).map(toUnix);
  env.PATH = [...new Set([...[...toolDirs].map(toUnix), ...existing])].join(':');
}

const result = spawnSync(bash, ['vault-destroy.sh', ...process.argv.slice(2)], {
  cwd,
  stdio: 'inherit',
  env,
});

if (result.error) {
  process.stderr.write(`vault-destroy: failed to launch bash — ${result.error.message}\n`);
  process.exit(1);
}
process.exit(result.status ?? 1);
