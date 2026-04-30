import { readFileSync } from 'node:fs';
import { execa } from 'execa';
import { getAllVaults } from '../lib/registry.js';
import { Vault } from '../lib/vault.js';
import { findTool, claudeJsonPath } from '../lib/platform.js';
import type { ClaudeConfig, CommandModule, LogFn, RunOptions } from '../types.js';

async function checkTool(name: string, required: boolean, log: LogFn): Promise<boolean> {
  const path = await findTool(name);
  if (!path) {
    const level = required ? 'x fail' : '! warn';
    log(`  ${level}  ${name}: not found`);
    return false;
  }
  log(`  + ok   ${name}: ${path}`);
  return true;
}

export async function run({ cfgPath, log = console.log }: RunOptions = {}): Promise<number> {
  let issues = 0;

  log('Prerequisites:');

  // git — required
  const gitOk = await checkTool('git', true, log);
  if (!gitOk) issues++;

  // node version — required >= 22
  const nodeMajor = parseInt(process.versions.node.split('.')[0] ?? '0', 10);
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
  const userName = String(nameResult.stdout ?? '').trim();
  const userEmail = String(emailResult.stdout ?? '').trim();
  if (!userName || !userEmail) {
    log('  x fail  git config: user.name or user.email not set');
    log('    Run: git config --global user.name "Your Name"');
    log('         git config --global user.email "you@example.com"');
    issues++;
  } else {
    log(`  + ok   git config: ${userName} <${userEmail}>`);
  }

  log('');

  // Vault health
  const records = await getAllVaults(cfgPath);
  if (records.length === 0) {
    log('No vaults registered.');
  } else {
    log('Vaults:');
    for (const record of records) {
      const vault = Vault.fromRecord(record);
      if (!vault.existsOnDisk()) {
        log(`  x fail  ${vault.name}: directory missing (${vault.dir})`);
        log(`    Hint: vaultkit connect ${vault.name}`);
        issues++;
        continue;
      }

      if (!vault.hasLauncher()) {
        log(`  ! warn  ${vault.name}: .mcp-start.js missing`);
        log(`    Hint: vaultkit update ${vault.name}`);
        continue;
      }

      const onDiskHash = await vault.sha256OfLauncher();

      if (!vault.expectedHash) {
        log(`  ! warn  ${vault.name}: no pinned hash (legacy registration)`);
        log(`    Hint: vaultkit update ${vault.name}`);
        continue;
      }

      if (vault.expectedHash !== onDiskHash) {
        log(`  x fail  ${vault.name}: hash mismatch`);
        log(`    Pinned:  ${vault.expectedHash}`);
        log(`    On-disk: ${onDiskHash}`);
        log(`    Hint: vaultkit verify ${vault.name}`);
        issues++;
        continue;
      }

      if (!vault.isVaultLike()) {
        log(`  ! warn  ${vault.name}: vault layout incomplete`);
        log(`    Hint: vaultkit update ${vault.name}`);
        continue;
      }

      log(`  + ok   ${vault.name} (${vault.dir})`);
      log(`         ${vault.expectedHash}`);
    }

    // Count non-vault MCP servers
    try {
      const cfg = JSON.parse(readFileSync(cfgPath ?? claudeJsonPath(), 'utf8')) as ClaudeConfig;
      const allServers = Object.keys(cfg?.mcpServers ?? {});
      const vaultNames = new Set(records.map(v => v.name));
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

// Compile-time check: `run` matches the CommandModule contract.
const _module: CommandModule<[], RunOptions, number> = { run };
void _module;
