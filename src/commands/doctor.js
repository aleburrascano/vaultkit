import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execa } from 'execa';
import { getAllVaults } from '../lib/registry.js';
import { sha256, isVaultLike } from '../lib/vault.js';
import { findTool } from '../lib/platform.js';

async function checkTool(name, required, log) {
  const path = await findTool(name);
  if (!path) {
    const level = required ? 'x fail' : '! warn';
    log(`  ${level}  ${name}: not found`);
    return false;
  }
  log(`  + ok   ${name}: ${path}`);
  return true;
}

export async function run({ cfgPath, log = console.log } = {}) {
  let issues = 0;

  log('Prerequisites:');

  // git — required
  const gitOk = await checkTool('git', true, log);
  if (!gitOk) issues++;

  // node version — required >= 22
  const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
  if (nodeMajor < 22) {
    log(`  x fail  node: v${process.versions.node} (v22+ required)`);
    issues++;
  } else {
    log(`  + ok   node: v${process.versions.node}`);
  }

  // gh — recommended
  const ghPath = await findTool('gh');
  if (!ghPath) {
    log('  ! warn  gh: not found (recommended — install from https://cli.github.com)');
  } else {
    // Check auth
    const authResult = await execa(ghPath, ['auth', 'status'], { reject: false });
    if (authResult.exitCode !== 0) {
      log(`  ! warn  gh: found but not authenticated (run: gh auth login)`);
    } else {
      log(`  + ok   gh: authenticated`);
    }
  }

  // claude — recommended
  const claudePath = await findTool('claude');
  if (!claudePath) {
    log('  ! warn  claude: not found (run: npm install -g @anthropic-ai/claude-code)');
  } else {
    log(`  + ok   claude: ${claudePath}`);
  }

  // git config
  const nameResult = await execa('git', ['config', 'user.name'], { reject: false });
  const emailResult = await execa('git', ['config', 'user.email'], { reject: false });
  if (!nameResult.stdout?.trim() || !emailResult.stdout?.trim()) {
    log('  x fail  git config: user.name or user.email not set');
    log('    Run: git config --global user.name "Your Name"');
    log('         git config --global user.email "you@example.com"');
    issues++;
  } else {
    log(`  + ok   git config: ${nameResult.stdout.trim()} <${emailResult.stdout.trim()}>`);
  }

  log('');

  // Vault health
  const vaults = await getAllVaults(cfgPath);
  if (vaults.length === 0) {
    log('No vaults registered.');
  } else {
    log('Vaults:');
    for (const vault of vaults) {
      if (!existsSync(vault.dir)) {
        log(`  x fail  ${vault.name}: directory missing (${vault.dir})`);
        log(`    Hint: vaultkit connect ${vault.name}`);
        issues++;
        continue;
      }

      const launcherPath = join(vault.dir, '.mcp-start.js');
      if (!existsSync(launcherPath)) {
        log(`  ! warn  ${vault.name}: .mcp-start.js missing`);
        log(`    Hint: vaultkit update ${vault.name}`);
        continue;
      }

      const onDiskHash = await sha256(launcherPath);

      if (!vault.hash) {
        log(`  ! warn  ${vault.name}: no pinned hash (legacy registration)`);
        log(`    Hint: vaultkit update ${vault.name}`);
        continue;
      }

      if (vault.hash !== onDiskHash) {
        log(`  x fail  ${vault.name}: hash mismatch`);
        log(`    Pinned:  ${vault.hash}`);
        log(`    On-disk: ${onDiskHash}`);
        log(`    Hint: vaultkit verify ${vault.name}`);
        issues++;
        continue;
      }

      if (!isVaultLike(vault.dir)) {
        log(`  ! warn  ${vault.name}: vault layout incomplete`);
        log(`    Hint: vaultkit update ${vault.name}`);
        continue;
      }

      log(`  + ok   ${vault.name} (${vault.dir})`);
      log(`         ${vault.hash}`);
    }

    // Count non-vault MCP servers
    const { readFileSync } = await import('node:fs');
    try {
      const cfg = JSON.parse(readFileSync(cfgPath ?? (await import('../lib/platform.js')).claudeJsonPath(), 'utf8'));
      const allServers = Object.keys(cfg?.mcpServers ?? {});
      const vaultNames = new Set(vaults.map(v => v.name));
      const others = allServers.filter(n => !vaultNames.has(n));
      if (others.length > 0) {
        log(`\n  Other MCP servers (not managed by vaultkit): ${others.join(', ')}`);
      }
    } catch { /* ignore */ }
  }

  log('');
  if (issues === 0) {
    log('Everything looks good.');
  } else {
    log(`${issues} issue(s) found — address the items marked with x above.`);
  }

  return issues;
}
