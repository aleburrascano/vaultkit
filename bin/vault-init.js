#!/usr/bin/env node
'use strict';
const { spawnSync } = require('child_process');
const { existsSync } = require('fs');
const path = require('path');

const cwd = path.resolve(__dirname, '..');
const env = { ...process.env };

let bash = 'bash';

if (process.platform === 'win32') {
  const toUnix = p => p
    .replace(/\\/g, '/')
    .replace(/^([A-Za-z]):\//, (_, d) => `/${d.toLowerCase()}/`)
    .replace(/\/$/, '');

  // Find Git for Windows bash.
  // C:\Windows\System32\bash.exe is the WSL launcher — it boots a Linux environment
  // where node/git/npm/gh are invisible, so we must skip it.
  const gitRoots = [
    process.env.PROGRAMFILES         && path.join(process.env.PROGRAMFILES,         'Git'),
    process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Git'),
    process.env.LOCALAPPDATA         && path.join(process.env.LOCALAPPDATA,         'Programs', 'Git'),
  ].filter(Boolean);

  let bashPath = null;
  for (const root of gitRoots) {
    const candidate = path.join(root, 'bin', 'bash.exe');
    if (existsSync(candidate)) { bashPath = candidate; break; }
  }

  if (bashPath) {
    bash = bashPath;
  } else {
    // Fall back to PATH, but never pick the WSL shim in System32.
    const where = spawnSync('where', ['bash'], { encoding: 'utf8' });
    const found = (where.stdout || '').trim().split('\n')
      .map(s => s.trim())
      .filter(s => s && !s.toLowerCase().includes('system32'));
    if (found.length > 0) {
      bash = found[0];
    } else {
      process.stderr.write(
        'vault-init: Git for Windows bash not found.\n' +
        'Install Git for Windows from https://git-scm.com and re-run.\n' +
        '(C:\\Windows\\System32\\bash.exe is WSL — it cannot see Windows tools.)\n'
      );
      process.exit(1);
    }
  }

  // Build a POSIX PATH that Git Bash can use.
  // Prepend bash's own bin dir and node's dir so all tools are guaranteed findable.
  const entries = (env.PATH || '').split(';').filter(Boolean).map(toUnix);
  entries.unshift(toUnix(path.dirname(process.execPath)));
  entries.unshift(toUnix(path.dirname(bash)));
  env.PATH = [...new Set(entries)].join(':');
}

const result = spawnSync(bash, ['vault-init.sh', ...process.argv.slice(2)], {
  cwd,
  stdio: 'inherit',
  env,
});

if (result.error) {
  process.stderr.write(`vault-init: failed to launch bash — ${result.error.message}\n`);
  process.exit(1);
}
process.exit(result.status ?? 1);
