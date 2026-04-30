---
name: debug-command
description: Debug a vaultkit command for issues
---

Help me debug the vaultkit command "$ARGUMENTS".

1. Read `src/commands/$ARGUMENTS.ts` in full. Read its test files at `tests/commands/$ARGUMENTS.test.ts` and `tests/commands/$ARGUMENTS-mocked.test.ts` (if it exists).
2. Check for these common issues:
   - Vault name not validated — should use `Vault.tryFromName(name, cfgPath)` (which calls `validateName` internally) or `validateName(name)` directly from `src/lib/vault.ts`.
   - Vault path resolution uses `Vault.tryFromName` or `getVaultDir` (MCP registry), not raw user input or filesystem fallbacks for destructive ops.
   - Windows: paths via `path.join`/`path.dirname`; PATH lookup via `findTool` (`src/lib/platform.ts`), not bare `gh`/`claude` assumptions.
   - MCP registration includes `--expected-sha256=<hash>` (re-check after `claude mcp add` calls).
   - `gh` or `claude` calls that assume the binary is on PATH — `init.ts` shows the probe pattern for first-time `gh` discovery.
   - Vault structure check (`Vault.isVaultLike()` or `isVaultLike(dir)`) before any `rm -rf` (`rmSync({ recursive: true, force: true })`).
   - execa stdout/stderr accesses use `String(result.stdout ?? '').trim()` (execa's wide stdout type).
3. Show how to run the command directly for isolated testing:
   ```bash
   npm run build
   node dist/bin/vaultkit.js $ARGUMENTS [typical-args]
   ```
   Or run the targeted tests:
   ```bash
   npx vitest run tests/commands/$ARGUMENTS.test.ts
   ```
4. If `npm link` is not active, remind me to run `npm run build && npm link` so I don't need to publish.
5. Report findings as a concise list: what's fine, what might be the issue.
