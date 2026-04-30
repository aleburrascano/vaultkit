# VaultKit

CLI that connects Claude Code to Obsidian vaults via MCP. TypeScript source compiled to `dist/` at publish time.

## Commands
build:      npm run build
check:      npm run check    (tsc --noEmit)
test:       npm test
test:watch: npm run test:watch

## Architecture

**Runtime**: Node.js ≥22, ESM (`"type": "module"`), TypeScript source under [bin/](bin/), [src/](src/), [tests/](tests/).

**Dispatch flow**: `vaultkit <cmd>` → [bin/vaultkit.ts](bin/vaultkit.ts) (commander) → [src/commands/](src/commands/)`<cmd>.ts`. The compiled package ships [dist/bin/vaultkit.js](dist/bin/vaultkit.js) → `dist/src/commands/<cmd>.js`.

**Build**: `npm run build` runs `tsc -p tsconfig.build.json` then [scripts/post-build.mjs](scripts/post-build.mjs) (which copies `lib/*.tmpl` into `dist/lib/` and chmods the bin executable on Unix). `prepublishOnly` runs the build before `npm publish`.

**State**: `~/.claude.json` — the `mcpServers` object is the vault registry. Commands read it via [src/lib/registry.ts](src/lib/registry.ts).

**Launcher template**: [lib/mcp-start.js.tmpl](lib/mcp-start.js.tmpl) is the single source of truth for the per-vault `.mcp-start.js`. **It stays as raw JavaScript** — every existing user vault verifies its SHA-256 on every Claude Code session, so the byte content is immutable. `init.ts` and `update.ts` `copyFileSync` it from `<repo>/lib/` (in dev) or `<install-root>/dist/lib/` (post-install — populated by the post-build script).

**Windows**: [src/lib/platform.ts](src/lib/platform.ts) provides `findTool`, `isWindows`, `vaultsRoot`, `claudeJsonPath`. Never assume `gh` or `claude` are on PATH — use `findTool`.

**Audit logging**: Set `VAULTKIT_LOG=<path>` to append TSV rows (timestamp, command, args, exit code, duration) to a file.

## Command → Module Map

| Command    | Module                     |
|-----------|----------------------------|
| init       | src/commands/init.ts       |
| connect    | src/commands/connect.ts    |
| disconnect | src/commands/disconnect.ts |
| destroy    | src/commands/destroy.ts    |
| pull       | src/commands/pull.ts       |
| update     | src/commands/update.ts     |
| doctor     | src/commands/doctor.ts     |
| verify     | src/commands/verify.ts     |
| status     | src/commands/status.ts     |
| backup     | src/commands/backup.ts     |
| visibility | src/commands/visibility.ts |

To add a command: see `/add-command`.

## Shared Libraries — `src/lib/`

| File | Key Exports |
|---|---|
| `registry.ts` | `getAllVaults`, `getVaultDir`, `getExpectedHash`, `addToRegistry`, `removeFromRegistry` — reads/writes `~/.claude.json` |
| `vault.ts` | `Vault` class (`tryFromName`, `fromRecord`, `launcherPath`, `existsOnDisk`, `isVaultLike`, `hasGitRepo`, `hasLauncher`, `sha256OfLauncher`); `validateName`, `isVaultLike`, `sha256`; `render*` template builders |
| `platform.ts` | `isWindows`, `claudeJsonPath`, `vaultsRoot`, `findTool`, `npmGlobalBin` |
| `git.ts` | `init`, `add`, `commit`, `push`, `pull`, `getStatus`, `pushOrPr`, `archiveZip`, `clone` (function form — `GitClient` class evaluated and rejected per Phase 6 stop signal) |
| `github.ts` | `createRepo`, `deleteRepo`, `repoExists`, `isAdmin`, `getVisibility`, `enablePages`, `setPagesVisibility`, `disablePages`, `pagesExist`, `getPagesVisibility`, `getCurrentUser`, `getUserPlan`, `isAuthenticated`, `ensureDeleteRepoScope` |

[src/types.ts](src/types.ts) holds shared types: `ClaudeConfig`, `McpServerEntry`, `VaultRecord`, `LogFn`, `RunOptions`, `GitPushResult`, `GitPullResult`, `GitStatus`, `GitPushOrPrResult`, `GhUserResponse`, `GhRepoResponse`, `GhPagesResponse`, `GhRepoInfo`, `Visibility`.

## Templates — `lib/`

| File | Purpose |
|---|---|
| [lib/mcp-start.js.tmpl](lib/mcp-start.js.tmpl) | Single source of truth for `.mcp-start.js`. SHA-256 self-verification on every Claude Code session. **Byte-immutable for backward compatibility.** Copied into `dist/lib/` by [scripts/post-build.mjs](scripts/post-build.mjs). |
| [lib/deploy.yml.tmpl](lib/deploy.yml.tmpl) | GitHub Actions workflow for Quartz/GitHub Pages deployment. |

Both ship inside `dist/lib/` after the post-build copy. Source `lib/` exists for in-repo dev (`src/commands/init.ts`'s `'../../lib/<tmpl>'` path resolves to `<repo>/lib/<tmpl>` from raw source and to `<install-root>/dist/lib/<tmpl>` from compiled output, because the post-build copy keeps the relative offset constant).

## Local Development

```bash
npm install
npm run build              # compile TS → dist/, copy templates, chmod bin
npm link                   # one-time: point global vaultkit at dist/bin/vaultkit.js
vaultkit <command>
npm unlink -g @aleburrascano/vaultkit   # undo when done
```

For iterative development, `npm run build` produces fresh `dist/` output each time. `npm test` runs vitest against the TS source directly (no build needed for tests).

## Adding a New Command (summary — use `/add-command` for guided scaffold)

1. Create `src/commands/<name>.ts`. Export `async function run(params, options?: <Name>Options): Promise<...>` where `<Name>Options extends RunOptions` adds command-specific fields.
2. Add `.command('<name> ...')` to the `program` in [bin/vaultkit.ts](bin/vaultkit.ts) with a dynamic `import('../src/commands/<name>.js')` inside `wrap()`. (The `.js` specifier is correct in TS source — Node ESM's `NodeNext` resolution maps it to the `.ts` file at compile time.)
3. `package.json#files` is `["dist/"]` and `bin` is `"dist/bin/vaultkit.js"` — no change needed for new commands.
4. Add a row to [README.md](README.md).
5. Add an entry under `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md).
6. Add `tests/commands/<name>.test.ts` covering happy path + key error cases.

## Security Invariants — Never Break These

- **Vault names** must match `^[a-zA-Z0-9_-]+$`, max 64 chars. Use `validateName` from `src/lib/vault.ts` (also enforced by `Vault.tryFromName`).
- **Vault paths** for destructive ops must come from the MCP registry (`getVaultDir` from `src/lib/registry.ts`, or `Vault.tryFromName` which calls it), never raw user input or filesystem fallbacks. `connect`/`init` are the only commands allowed to create new entries.
- **MCP registration** must include `--expected-sha256=<hash>` so the launcher can self-verify on every Claude Code session.
- **`gh repo delete`** must be preceded by an explicit ownership check (`isAdmin` from `src/lib/github.ts`) and a typed-name confirmation.
- **`isVaultLike`** (or `Vault.isVaultLike()`) must be checked before any directory deletion.
- **`delete_repo` scope** must be requested only when actually about to delete (skip for collaborators who can't delete anyway).

## Hard Invariants

- TypeScript source compiles to `dist/` at publish time. Only `dist/` is shipped via `package.json#files`.
- The launcher template [lib/mcp-start.js.tmpl](lib/mcp-start.js.tmpl) stays as raw JavaScript — its SHA-256 is byte-pinned in every existing user vault. Never edit it carelessly.
- Windows compatibility is mandatory — use `platform.ts` helpers; test Windows path branches.
- Never duplicate the launcher template inline — `copyFileSync` from `lib/mcp-start.js.tmpl`.
- ESM only — `"type": "module"` in package.json; no `require()`.

## Standing Workflows
- Bug fix: write a failing test that reproduces the bug first. Show it fail. Fix it. Show it pass. Run full suite.
- Feature: run full test suite before and after.
- Refactor: confirm all tests pass before touching anything; confirm they still pass after.

## Known Hallucination Patterns
@.claude/rules/hallucination-patterns.md
