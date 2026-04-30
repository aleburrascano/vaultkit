import { existsSync } from 'node:fs';
import { getAllVaults } from '../lib/registry.js';
import { pull } from '../lib/git.js';
import type { RunOptions } from '../types.js';

export async function run({ cfgPath, log = console.log }: RunOptions = {}): Promise<void> {
  const vaults = await getAllVaults(cfgPath);

  if (vaults.length === 0) {
    log('No vaults registered.');
    return;
  }

  let synced = 0;
  let skipped = 0;

  for (const vault of vaults) {
    if (!existsSync(vault.dir)) {
      log(`  ${vault.name}: skipped — directory missing (${vault.dir})`);
      skipped++;
      continue;
    }

    const timeout = parseInt(process.env.VAULTKIT_PULL_TIMEOUT ?? '30000', 10);
    const result = await pull(vault.dir, { timeout });

    if (result.timedOut) {
      log(`  ${vault.name}: pull timed out`);
      skipped++;
    } else if (!result.success) {
      const firstLine = result.stderr ? result.stderr.trim().split('\n')[0] ?? '' : '';
      const hint = firstLine ? `: ${firstLine}` : '';
      log(`  ${vault.name}: pull failed${hint}`);
      log(`    Hint: cd "${vault.dir}" && git status`);
      skipped++;
    } else if (result.upToDate) {
      log(`  ${vault.name}: already up to date`);
      synced++;
    } else {
      log(`  ${vault.name}: synced`);
      synced++;
    }
  }

  log(`\n${synced} vault(s) synced, ${skipped} skipped`);
}
