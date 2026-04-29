# Unit Test Edge Cases — Comprehensive Coverage Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the Vitest suite from 98 tests to cover every realistic failure mode, partial-state scenario, and edge case a new or experienced vaultkit user could encounter.

**Architecture:** Tests live in `tests/commands/` and `tests/lib/`, mirroring the source tree. All external I/O (git, gh CLI, filesystem writes) is mocked via `vi.mock` / `vi.spyOn` at the module boundary. Commands that need a real git repo continue to use `tmp` directories as today — but all network and GitHub CLI calls are mocked.

**Tech Stack:** Node.js 22+, Vitest 4.x, ESM, `vi.mock`, `vi.spyOn`, `os.tmpdir()` for temp dirs.

---

## Current Coverage Snapshot

| Command / Module | Test File Exists? | What's Covered | Critical Gaps |
|---|---|---|---|
| `lib/vault.js` | ✅ | validateName, isVaultLike, sha256, all renders | sha256 on missing file, render with special chars |
| `lib/git.js` | ✅ | init, add, commit, push, pull, getStatus, archiveZip | merge conflicts, detached HEAD, pushOrPr, getStatus on non-git dir |
| `lib/github.js` | ✅ | JSON parsers only | all CLI-calling functions (createRepo, deleteRepo, etc.) |
| `lib/platform.js` | ✅ | isWindows, claudeJsonPath, vaultsRoot | missing env vars, macOS, findTool |
| `lib/registry.js` | ✅ | getAllVaults, getVaultDir, getExpectedHash | duplicate names, config is directory |
| `commands/connect.js` | ✅ | `_normalizeInput` only | actual run(), MCP registration, clone failures |
| `commands/backup.js` | ✅ | name validation, unregistered vault, happy path | dirty vault warning, no commits, custom backupsDir |
| `commands/destroy.js` | ✅ | name validation, unregistered, not-vault-like, happy path | skipConfirm flow, GitHub deletion, partial failures |
| `commands/disconnect.js` | ✅ | name validation, unregistered, not-vault-like, happy path | skipConfirm flow, MCP removal, missing dir |
| `commands/pull.js` | ✅ | missing dir, up-to-date, empty registry | actual new commits, conflicts, dirty state, multiple vaults |
| `commands/update.js` | ✅ | name validation, unregistered, creates missing files | hash-match skip, MCP re-registration, push failure → PR |
| `commands/init.js` | ❌ | nothing | everything |
| `commands/doctor.js` | ❌ | nothing | everything |
| `commands/verify.js` | ❌ | nothing | everything |
| `commands/status.js` | ❌ | nothing | everything |
| `commands/visibility.js` | ❌ | nothing | everything |

---

## Edge Case Catalog (for user review)

**Read this section before the implementation tasks. These are the scenarios we're proposing to test. Review each command and let us know: (1) anything you've actually hit that isn't listed, (2) anything listed you think isn't worth testing.**

---

### `init` — Create vault from scratch

| # | Perspective | Scenario | Expected Behavior |
|---|---|---|---|
| I-1 | New user | Invalid name (slash: `owner/repo`) | Throws with clear "provide vault name only" message |
| I-2 | New user | Invalid name (dot: `my.vault`) | Throws with char-set error |
| I-3 | New user | Name too long (65 chars) | Throws with length error |
| I-4 | New user | Node.js < 22 | Throws "Node.js 22+ required" before doing anything |
| I-5 | New user | `gh` not found, user declines install | Throws cleanly |
| I-6 | New user | `gh` not found, user accepts, install succeeds | Continues to auth check |
| I-7 | New user | Not authenticated to GitHub, user cancels login | Throws cleanly |
| I-8 | New user | git user.name/email missing, user provides values | Continues |
| I-9 | New user | git user.name/email missing, user cancels | Throws |
| I-10 | New user | Vault directory already exists | Throws before touching GitHub |
| I-11 | New user | Free plan + picks auth-gated mode | Throws "Pro+ required" |
| I-12 | New user | Private mode, full success | Files + dirs + MCP all created |
| I-13 | New user | Public mode, full success | Pages enabled, deploy.yml committed |
| I-14 | New user | GitHub repo creation fails (network) | Rolls back: dir deleted, no MCP registered |
| I-15 | New user | GitHub push fails after repo created | Rolls back: GitHub repo deleted, dir deleted |
| I-16 | New user | MCP registration fails (claude not found) | Vault kept, user sees manual registration instructions |
| I-17 | Existing user | Name already registered in MCP | Throws before creating anything |
| I-18 | Existing user | VAULTKIT_HOME set to custom path | Vault created at custom location |

---

### `connect` — Clone and register external vault

| # | Perspective | Scenario | Expected Behavior |
|---|---|---|---|
| C-1 | New user | `owner/repo` format | Normalizes, clones, registers |
| C-2 | New user | HTTPS URL `https://github.com/owner/repo` | Normalizes correctly |
| C-3 | New user | HTTPS URL with `.git` suffix | Strips .git, normalizes |
| C-4 | New user | SSH URL `git@github.com:owner/repo.git` | Normalizes correctly |
| C-5 | New user | Unrecognized format (e.g. `notarepo`) | Throws "unrecognized format" |
| C-6 | New user | Repo doesn't exist on GitHub | Clone fails → throws, no dir created |
| C-7 | New user | Name already registered as MCP vault | Throws "already connected" before cloning |
| C-8 | New user | Clone succeeds, no `.mcp-start.js` in repo | Warns user, skips MCP registration, vault dir kept |
| C-9 | New user | Clone succeeds, `.mcp-start.js` present | MCP registered with correct SHA-256 hash |
| C-10 | Existing user | Reconnect after disconnect (same name, same repo) | Succeeds (dir gone, name not in registry) |
| C-11 | Existing user | Name collision with a different repo (same vault name, different origin) | Throws before cloning |

---

### `pull` — Sync all vaults from remote

| # | Perspective | Scenario | Expected Behavior |
|---|---|---|---|
| P-1 | New user | No vaults registered | Exits cleanly, prints "no vaults" or similar |
| P-2 | New user | One vault, already up to date | Logs "up to date" for that vault |
| P-3 | New user | One vault, new commits upstream | Pulls, logs which vault was updated |
| P-4 | Existing user | Vault dir missing from filesystem | Logs "missing / skipping", continues |
| P-5 | Existing user | Multiple vaults, all up to date | Processes all without error |
| P-6 | Existing user | Multiple vaults, some missing dirs | Skips missing, pulls the rest |
| P-7 | Existing user | Vault with dirty working directory | Pull succeeds if clean merge; fails if conflict |
| P-8 | Existing user | Vault with uncommitted changes + upstream changes | Reports conflict, logs stderr, continues to other vaults |
| P-9 | Existing user | Vault has no remote configured | Reports failure, continues to other vaults |
| P-10 | Existing user | Network timeout on one vault | Reports timeout per vault, continues others |
| P-11 | Existing user | `VAULTKIT_PULL_TIMEOUT=2000` env var | Respects the shorter timeout |
| P-12 | Existing user | Vault with local commits ahead of remote | Pull succeeds (fast-forward not needed if already ahead) |

---

### `doctor` — System health check

| # | Perspective | Scenario | Expected Behavior |
|---|---|---|---|
| D-1 | New user | Everything OK | Returns 0 issues |
| D-2 | New user | Node.js < 22 | Reports issue, still checks rest |
| D-3 | New user | `git` not found | Reports issue, skips git-dependent checks |
| D-4 | New user | `gh` not found | Reports issue |
| D-5 | New user | `gh` not authenticated | Reports issue |
| D-6 | New user | git user.name not set | Reports issue |
| D-7 | New user | git user.email not set | Reports issue |
| D-8 | New user | No vaults registered | 0 vault issues |
| D-9 | Existing user | Vault dir missing | Reports per-vault issue |
| D-10 | Existing user | Vault has no `.mcp-start.js` | Reports per-vault issue |
| D-11 | Existing user | Vault hash mismatch (file modified locally) | Reports per-vault issue |
| D-12 | Existing user | Vault missing layout files (raw/, wiki/, CLAUDE.md) | Reports per-vault issue |
| D-13 | Existing user | Non-vault MCP server in config (e.g. claude_desktop) | Not flagged as an issue |
| D-14 | Existing user | Multiple vaults, mixed healthy/broken | Returns correct issue count |

---

### `verify` — Launcher integrity check

| # | Perspective | Scenario | Expected Behavior |
|---|---|---|---|
| V-1 | New user | Vault not registered | Throws |
| V-2 | New user | `.mcp-start.js` missing | Throws with clear message |
| V-3 | Existing user | Hash matches pinned hash | Logs "verified OK", no changes |
| V-4 | Existing user | Hash mismatch (file tampered locally) | Re-pins MCP to current on-disk hash |
| V-5 | Existing user | Upstream has new launcher version (ff-able) | Pulls, recomputes hash, re-pins |
| V-6 | Existing user | No remote configured | Verifies local hash only, no upstream check |
| V-7 | Existing user | Upstream not fast-forwardable | Throws: manual intervention required |
| V-8 | Existing user | `claude` CLI not found | Shows manual re-pin instructions |

---

### `status` — Vault state summary

| # | Perspective | Scenario | Expected Behavior |
|---|---|---|---|
| S-1 | New user | No vaults registered | Prints "no vaults" or empty table |
| S-2 | New user | One vault, clean, up to date | Shows name + clean status |
| S-3 | New user | `status <name>` detailed mode, vault not registered | Throws |
| S-4 | Existing user | Summary mode, vault dir missing | Shows `[DIR MISSING]` row |
| S-5 | Existing user | Summary mode, vault not a git repo | Shows `[not a git repo]` |
| S-6 | Existing user | Summary mode, vault dirty | Shows dirty indicator |
| S-7 | Existing user | Summary mode, vault ahead of remote | Shows ahead count |
| S-8 | Existing user | Summary mode, vault behind remote | Shows behind count |
| S-9 | Existing user | Detailed mode, shows full git status output | Output contains git status lines |
| S-10 | Existing user | Multiple vaults, mixed states | All shown correctly in one pass |

---

### `backup` — Create zip snapshot

| # | Perspective | Scenario | Expected Behavior |
|---|---|---|---|
| B-1 | New user | Invalid vault name | Throws |
| B-2 | New user | Vault not registered | Throws |
| B-3 | New user | Vault dir exists but has no `.git` | Throws |
| B-4 | New user | Vault has no commits yet (empty repo) | Throws (git archive requires HEAD) |
| B-5 | New user | Vault with committed files, clean | Creates zip, logs file size |
| B-6 | Existing user | Vault with uncommitted changes | Warns "dirty", creates zip of committed files only |
| B-7 | Existing user | Custom `backupsDir` provided | Zip created at that path |
| B-8 | Existing user | Backups dir doesn't exist yet | Creates dir, then backs up |
| B-9 | Existing user | Backing up same vault twice | Two distinct zips (different timestamps) |

---

### `disconnect` — Remove local vault, keep GitHub

| # | Perspective | Scenario | Expected Behavior |
|---|---|---|---|
| DC-1 | New user | Invalid vault name | Throws |
| DC-2 | New user | Vault not registered | Throws |
| DC-3 | New user | Dir doesn't look like vault | Throws (isVaultLike guard) |
| DC-4 | New user | skipConfirm=false, user types correct name | Proceeds to delete |
| DC-5 | New user | skipConfirm=false, user types wrong name | Aborts, nothing deleted |
| DC-6 | Existing user | Vault dir missing from filesystem | Logs "dir missing", removes MCP entry only |
| DC-7 | Existing user | MCP removal: claude found, removes successfully | MCP entry gone |
| DC-8 | Existing user | MCP removal: claude not found | Warns, still deletes local dir |
| DC-9 | Existing user | skipMcp=true | Skips MCP removal step entirely |

---

### `destroy` — Delete vault everywhere

| # | Perspective | Scenario | Expected Behavior |
|---|---|---|---|
| DE-1 | New user | Invalid vault name | Throws |
| DE-2 | New user | Vault not registered | Throws |
| DE-3 | New user | Dir doesn't look like vault | Throws |
| DE-4 | New user | skipConfirm=false, user types correct name | Full destruction: GitHub + local + MCP |
| DE-5 | New user | skipConfirm=false, user types wrong name | Aborts before touching anything |
| DE-6 | Existing user | User is not admin on GitHub repo | Skips GitHub deletion, proceeds with local + MCP |
| DE-7 | Existing user | GitHub deletion fails (network error) | Logs error, still deletes local + MCP |
| DE-8 | Existing user | Vault has uncommitted changes | Warns user (data will be lost) |
| DE-9 | Existing user | Vault has unpushed commits | Warns user (commits not on GitHub) |
| DE-10 | Existing user | No git remote (no GitHub repo linked) | Skips GitHub step, logs note |
| DE-11 | Existing user | MCP removal fails (claude not found) | Logs warning, not fatal |

---

### `update` — Refresh launcher + restore layout files

| # | Perspective | Scenario | Expected Behavior |
|---|---|---|---|
| U-1 | New user | Invalid vault name | Throws |
| U-2 | New user | Vault not registered | Throws |
| U-3 | New user | Vault dir has no `.git` | Throws |
| U-4 | Existing user | Launcher hash matches template hash | Skips copy, logs "launcher up to date" |
| U-5 | Existing user | Launcher outdated → copies, commits, pushes | Push succeeds, MCP re-registered |
| U-6 | Existing user | Layout files all present | No new files created |
| U-7 | Existing user | Layout files missing | Created + committed alongside launcher |
| U-8 | Existing user | Direct push rejected (protected branch) | Creates PR instead |
| U-9 | Existing user | No upstream tracking branch | Shows manual instructions |
| U-10 | Existing user | `claude` not found for MCP re-registration | Shows manual re-pin instructions |

---

### `visibility` — Toggle public/private/auth-gated

| # | Perspective | Scenario | Expected Behavior |
|---|---|---|---|
| VI-1 | New user | Invalid vault name | Throws |
| VI-2 | New user | Invalid mode (e.g. `secret`) | Throws "mode must be one of: public, private, auth-gated" |
| VI-3 | New user | Vault not registered | Throws |
| VI-4 | New user | No git remote configured | Throws |
| VI-5 | New user | `gh` not found | Throws |
| VI-6 | New user | Not admin on GitHub repo | Throws "you must be an admin" |
| VI-7 | New user | private → public (free plan) | Enables Pages, adds deploy workflow, commits |
| VI-8 | New user | private → auth-gated (free plan) | Throws "Pro+ required for auth-gated" |
| VI-9 | Existing user | private → auth-gated (Pro plan) | Enables Pages with private visibility |
| VI-10 | Existing user | public → private | Disables Pages, changes repo visibility |
| VI-11 | Existing user | Already in target mode (no-op) | Logs "already public/private" |
| VI-12 | Existing user | Repo visibility change succeeds, Pages change fails | Logs warning about inconsistent state |
| VI-13 | Existing user | Push fails → falls back to PR | Creates PR for deploy workflow addition |

---

### Library edge cases

| # | Module | Scenario | Expected Behavior |
|---|---|---|---|
| L-1 | `git.js` | `pushOrPr()` called with uncommitted local changes | Discards them (current behavior) — test documents this |
| L-2 | `git.js` | `getStatus()` on non-git directory | Returns safe defaults, no throw |
| L-3 | `git.js` | `archiveZip()` on repo with no commits | Throws (git archive needs HEAD) |
| L-4 | `git.js` | `pull()` with merge conflict | Returns `{success: false}` with stderr populated |
| L-5 | `platform.js` | `claudeJsonPath()` with HOME unset | Returns a path that includes empty-string component (documents the bug) |
| L-6 | `platform.js` | `vaultsRoot()` with VAULTKIT_HOME set to empty string | Documents current behavior |
| L-7 | `platform.js` | `findTool()` for unknown tool name | Returns null |
| L-8 | `registry.js` | Config has duplicate vault names | Documents which one wins |
| L-9 | `vault.js` | `sha256()` on non-existent file | Throws with clear message |
| L-10 | `vault.js` | `isVaultLike()` when path is a file (not dir) | Returns false |
| L-11 | `github.js` | `_parseUserJson()` with empty JSON `{}` | Throws (missing login) |
| L-12 | `github.js` | `_parsePagesJson()` with valid JSON but neither `public` nor `visibility` key | Returns 'public' (default) — documents behavior |

---

### Tool Discovery / Path edge cases (`platform.js` + all commands)

The user specifically flagged this: what happens when `gh` or `claude` is installed but **not on PATH**? `findTool()` has extensive probing logic for exactly this — but none of it is currently tested. These are the scenarios where vaultkit should handle things automatically, without telling the user to do anything manually.

| # | Scenario | Expected Behavior |
|---|---|---|
| PT-1 | Windows: `gh` found in `%PROGRAMFILES%\GitHub CLI\gh.exe` (not on PATH) | `findTool('gh')` returns that path — `gh` commands work |
| PT-2 | Windows: `gh` found via WinGet package dir (not on PATH, not in Program Files) | `findTool('gh')` returns the WinGet path |
| PT-3 | Windows: `gh` found via WinGet Links dir | `findTool('gh')` returns that path |
| PT-4 | Windows: `claude` found in `%APPDATA%\npm\claude.cmd` (npm global, not on PATH) | `findTool('claude')` returns that path |
| PT-5 | Windows: `claude` found via `npmGlobalBin()` probe (prefix/claude.cmd) | `findTool('claude')` returns that path |
| PT-6 | Unix: `gh` found via `which` | `findTool('gh')` returns the PATH result |
| PT-7 | Any OS: `gh` genuinely not installed anywhere | `findTool('gh')` returns `null` — commands that need it throw clearly |
| PT-8 | Any OS: `claude` not installed anywhere | `findTool('claude')` returns `null` — commands degrade gracefully (no MCP registration) without asking user to intervene |
| PT-9 | `npmGlobalBin()` when npm is not on PATH | Returns `null` — doesn't throw |
| PT-10 | `findTool('gh')` called by `init.js` when `gh` is in Program Files but not PATH | init succeeds — it finds gh automatically |

**Key design principle these tests encode:** *vaultkit must never require the user to manually add tools to PATH or run extra commands.* If a tool is installed in a known location, vaultkit finds it. If it truly isn't installed, vaultkit fails with a clear error — not an instruction set.

The tests will mock `existsSync` and `execa` to simulate filesystem states without needing real tool installations.

---

### Auto-recovery vs. manual intervention

Several existing and proposed tests say "shows manual instructions when X not found." These need to be categorized carefully:

| Scenario | Current behavior | Should auto-recover? |
|---|---|---|
| `claude` not on PATH but in known location | Already handled by `findTool()` — auto-found | Yes, and this should be tested (PT-1 through PT-5) |
| `claude` genuinely not installed | Shows manual `claude mcp add` command | No — can't install it without user consent; but the vault itself should still be created successfully |
| `gh` not on PATH but in known location | Already handled by `findTool()` — auto-found | Yes (PT-1 through PT-3) |
| `gh` genuinely not installed | Prompts to install via winget/brew/apt | Reasonable — interactive install is the recovery path |
| Push rejected by branch protection | Falls back to creating a PR | Yes, auto-handled — test this (U-8) |
| `claude` not found for MCP re-registration in `verify` | Shows `claude mcp add` instructions | Acceptable — user must do this one time |

Tests will verify that each "manual instruction" scenario is actually the last resort — vaultkit tried all automatic paths first.

---

### Transactional guarantees — all state-mutating commands

**User requirement:** Every command is all-or-nothing. If a command fails partway through, the system must return to the state it was in before the command ran. No partial states left behind.

This is currently only partially implemented in `init.js` (tracks `createdDir`/`createdRepo`/`registeredMcp` flags). All other commands are NOT transactional.

The two commands where strict atomicity is inherently impossible (GitHub API + local filesystem = two separate systems) need a different guarantee: **clear reporting of exactly what did and didn't happen**, plus a recovery path.

#### What each command's "transaction" covers:

| Command | Step sequence | Rollback requirement |
|---|---|---|
| `init` | create dir → git init → create GitHub repo → push → Pages → MCP | If step N fails: undo steps 1..N-1. Vault must not exist in any partial state. |
| `connect` | git clone → MCP register | If MCP fails: delete cloned dir. Pre-command state = no dir, no MCP entry. |
| `disconnect` | remove MCP → delete local dir | If MCP removal fails: abort dir deletion. Pre-command state = dir intact + MCP entry intact. |
| `destroy` | delete GitHub → remove MCP → delete local dir | If GitHub step fails: stop. Report what happened. Do NOT delete local if GitHub delete failed — user needs local to retry. |
| `update` | copy launcher → git commit → push → MCP re-register | If push fails: revert launcher file, unstage. Pre-command state = original launcher file. |
| `visibility` | change repo visibility → Pages → commit workflow → push | If Pages change fails after repo visibility changed: report inconsistent state explicitly with exact recovery command. |

#### New test scenarios (TX prefix):

| # | Command | Failure point | Expected behavior |
|---|---|---|---|
| TX-I-1 | `init` | Git init fails | Vault dir deleted; GitHub never touched |
| TX-I-2 | `init` | GitHub repo create fails | Vault dir deleted; nothing on GitHub |
| TX-I-3 | `init` | Push fails (repo created) | GitHub repo deleted + vault dir deleted |
| TX-I-4 | `init` | Push fails AND GitHub rollback fails | GitHub repo left (reports it), vault dir deleted, user gets recovery command |
| TX-C-1 | `connect` | Clone fails | No dir left behind |
| TX-C-2 | `connect` | MCP registration fails after clone | Cloned dir deleted; pre-command state restored |
| TX-DC-1 | `disconnect` | MCP removal fails | Dir deletion aborted; system unchanged |
| TX-DC-2 | `disconnect` | Dir deletion fails (permissions) | Reports state: MCP removed but dir still exists; gives recovery command |
| TX-DE-1 | `destroy` | GitHub deletion fails | Local dir NOT deleted; MCP NOT removed; full system intact; user can retry |
| TX-DE-2 | `destroy` | MCP removal fails | GitHub already deleted (can't undo); reports partial state clearly |
| TX-U-1 | `update` | Git commit fails after launcher copied | Launcher file reverted to original; no commit left |
| TX-U-2 | `update` | Push fails after commit | Revert commit (reset to pre-command HEAD); launcher file reverted |
| TX-VI-1 | `visibility` | Pages change fails after repo visibility changed | Reports: "repo is now X but Pages are still Y — run: `vaultkit visibility <name> <mode>` to retry" |

**Note on `destroy` specifically:** TX-DE-1 is a deliberate design decision — if GitHub deletion fails, we STOP. The user still has their local vault and can diagnose + retry. Deleting local while GitHub still exists creates an orphan. This is the correct transactional behavior.

**Note on `init` specifically:** TX-I-4 covers rollback failures. Even if `gh repo delete` fails during rollback, the local dir is still cleaned up and the user is given the exact `gh repo delete owner/name` command to run. This is the best we can do with a remote system.

---

## Confirmed Out of Scope

These are intentionally NOT tested at the unit level:
- Actual GitHub API calls (createRepo, deleteRepo, etc.) — manual / E2E only
- Interactive `@inquirer/prompts` confirm/select/input — unit tests use `skipConfirm` params
- Windows-specific install paths (winget) — platform-gated and manual only
- Performance (large vaults, many vaults) — load testing, not unit testing
- Concurrent operations — future concern

---

## File Structure

```
tests/
  commands/
    backup.test.js         ← expand (B-3 through B-9)
    connect.test.js        ← expand (C-6 through C-11)
    destroy.test.js        ← expand (DE-4 through DE-11)
    disconnect.test.js     ← expand (DC-4 through DC-9)
    doctor.test.js         ← NEW (D-1 through D-14)
    init.test.js           ← NEW (I-1 through I-18)
    pull.test.js           ← expand (P-3 through P-12)
    status.test.js         ← NEW (S-1 through S-10)
    update.test.js         ← expand (U-4 through U-10)
    verify.test.js         ← NEW (V-1 through V-8)
    visibility.test.js     ← NEW (VI-1 through VI-13)
  lib/
    git.test.js            ← expand (L-1 through L-4)
    github.test.js         ← expand (L-11 through L-12)
    platform.test.js       ← expand (L-5 through L-7)
    registry.test.js       ← expand (L-8)
    vault.test.js          ← expand (L-9 through L-10)
```

---

## Implementation Tasks

> Each task is a self-contained group of related edge cases. Implement them in this order — earlier tasks teach mocking patterns that later tasks reuse.

---

### Task 1: Library edge cases — foundational

**Files:**
- Expand: `tests/lib/git.test.js`
- Expand: `tests/lib/vault.test.js`
- Expand: `tests/lib/platform.test.js`
- Expand: `tests/lib/registry.test.js`
- Expand: `tests/lib/github.test.js`

- [ ] **Step 1.1: Write failing tests for L-1 through L-12**

Add to the appropriate test files:

```js
// tests/lib/git.test.js
it('getStatus returns defaults on non-git directory', async () => {
  const dir = join(tmp, 'notgit');
  mkdirSync(dir);
  const s = await getStatus(dir);
  expect(s.branch).toBeFalsy();
  expect(s.dirty).toBe(false);
});

it('archiveZip throws on repo with no commits', async () => {
  const dir = join(tmp, 'empty');
  mkdirSync(dir);
  await init(dir);
  await expect(archiveZip(dir, join(tmp, 'out.zip'))).rejects.toThrow();
});

it('pull returns success:false on merge conflict', async () => {
  // Set up: two clones, diverge them, then pull
  // ...see implementation note
  const result = await pull(vaultDir);
  expect(result.success).toBe(false);
  expect(result.stderr).toBeTruthy();
});
```

```js
// tests/lib/vault.test.js
it('sha256 throws on non-existent file', async () => {
  expect(() => sha256('/does/not/exist/file.txt')).toThrow();
});

it('isVaultLike returns false when path is a file', () => {
  const f = join(tmp, 'file.txt');
  writeFileSync(f, 'hello');
  expect(isVaultLike(f)).toBe(false);
});
```

```js
// tests/lib/platform.test.js
it('findTool returns null for unknown tool', async () => {
  const result = await findTool('definitely-not-a-real-tool-xyz123');
  expect(result).toBeNull();
});

it('claudeJsonPath uses empty string when HOME not set', () => {
  const original = process.env.HOME;
  delete process.env.HOME;
  const p = claudeJsonPath();
  expect(p).toBeDefined(); // documents behavior even if path is odd
  process.env.HOME = original;
});
```

```js
// tests/lib/registry.test.js
it('getAllVaults returns first match when duplicate names exist', () => {
  // Two entries with same name — documents which wins
  const cfg = { mcpServers: {
    MyVault: { command: 'node', args: ['/a/.mcp-start.js'] },
  }};
  // can't have duplicate keys in JSON — so test with getAllVaults sorting
  const vaults = getAllVaults(cfgPath);
  const names = vaults.map(v => v.name);
  expect(new Set(names).size).toBe(names.length); // names are unique
});
```

```js
// tests/lib/github.test.js
it('_parseUserJson throws on empty object', () => {
  expect(() => _parseUserJson('{}')).toThrow(/login/);
});

it('_parsePagesJson defaults to public when neither public nor visibility present', () => {
  expect(_parsePagesJson('{"html_url":"https://example.github.io"}')).toBe('public');
});
```

- [ ] **Step 1.2: Run to confirm failures**

```bash
npm test -- --reporter=verbose 2>&1 | head -60
```

Expected: New tests fail with "not implemented" or assertion errors.

- [ ] **Step 1.3: Fixes are documentation, not implementation — all tests should now encode current behavior (some may pass immediately)**

Run: `npm test`

- [ ] **Step 1.4: Commit**

```bash
git add tests/lib/
git commit -m "test(lib): document edge cases — sha256 missing file, getStatus non-git dir, pushOrPr discard, platform env gaps"
```

---

### Task 2: `pull` — multi-vault scenarios

**Files:**
- Expand: `tests/commands/pull.test.js`

This is the highest-priority command for existing users. Covers P-3 through P-12.

- [ ] **Step 2.1: Write failing tests**

```js
import { vi, it, describe, beforeEach, afterEach, expect } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { os } from 'node:os';

// Mock git operations so we don't need network
vi.mock('../../src/lib/git.js', async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, pull: vi.fn() };
});

// P-3: actual new commits
it('logs update when pull finds new commits', async () => {
  mockPull.mockResolvedValueOnce({ success: true, upToDate: false });
  // ... set up registry pointing at a real dir
  const logs = [];
  await run({ cfgPath, log: m => logs.push(m) });
  expect(logs.some(l => /updated|pulled/i.test(l))).toBe(true);
});

// P-7/P-8: dirty vault with conflict
it('logs conflict error and continues to other vaults', async () => {
  mockPull
    .mockResolvedValueOnce({ success: false, stderr: 'CONFLICT (content): Merge conflict in file.md', upToDate: false })
    .mockResolvedValueOnce({ success: true, upToDate: true });
  const logs = [];
  await run({ cfgPath, log: m => logs.push(m) });
  expect(logs.some(l => /conflict|fail/i.test(l))).toBe(true);
  expect(mockPull).toHaveBeenCalledTimes(2); // both vaults attempted
});

// P-9: no remote
it('logs failure for vault with no remote and continues', async () => {
  mockPull.mockResolvedValueOnce({ success: false, stderr: 'No remote configured', upToDate: false });
  const logs = [];
  await run({ cfgPath, log: m => logs.push(m) });
  expect(logs.some(l => /fail|error/i.test(l))).toBe(true);
});

// P-10: timeout
it('logs timeout for vault and continues', async () => {
  mockPull.mockResolvedValueOnce({ success: false, timedOut: true, stderr: '', upToDate: false });
  const logs = [];
  await run({ cfgPath, log: m => logs.push(m) });
  expect(logs.some(l => /timeout|timed/i.test(l))).toBe(true);
});
```

- [ ] **Step 2.2: Run to confirm failures**

```bash
npm test -- tests/commands/pull.test.js --reporter=verbose
```

- [ ] **Step 2.3: Add mocking infrastructure and make tests pass**

The `run()` function in `pull.js` imports from `git.js`. Use `vi.mock` at the top of the test file to mock `pull()` from `src/lib/git.js`. Wire up the cfgPath to point at a temp file with vault entries pointing at real temp directories.

- [ ] **Step 2.4: Run full suite**

```bash
npm test
```

- [ ] **Step 2.5: Commit**

```bash
git add tests/commands/pull.test.js
git commit -m "test(pull): multi-vault scenarios — conflicts, timeouts, no-remote, actual updates"
```

---

### Task 3: `doctor` — system health check

**Files:**
- Create: `tests/commands/doctor.test.js`

Covers D-1 through D-14.

- [ ] **Step 3.1: Write failing tests**

```js
// Mock platform and git so we can control tool presence
vi.mock('../../src/lib/platform.js', async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, findTool: vi.fn() };
});

vi.mock('execa', async (importOriginal) => ({
  execa: vi.fn(),
}));

describe('doctor', () => {
  // D-1: Everything OK
  it('returns 0 issues when environment is healthy', async () => {
    // findTool returns truthy for git, gh, claude
    // execa('git', ['config', 'user.name']) returns name
    // execa('git', ['config', 'user.email']) returns email
    // registry has vaults with correct dirs and hashes
    const issues = await run({ cfgPath, log: () => {} });
    expect(issues).toBe(0);
  });

  // D-2: Node < 22
  it('reports issue for old Node.js', async () => {
    // Override process.version temporarily or mock version check
    const logs = [];
    const issues = await run({ cfgPath, log: m => logs.push(m) });
    expect(issues).toBeGreaterThan(0);
    expect(logs.some(l => /node/i.test(l))).toBe(true);
  });

  // D-3: git not found
  it('reports issue when git is not found', async () => {
    findToolMock.mockResolvedValue(null); // all tools missing
    const logs = [];
    const issues = await run({ cfgPath, log: m => logs.push(m) });
    expect(logs.some(l => /git/i.test(l))).toBe(true);
    expect(issues).toBeGreaterThan(0);
  });

  // D-9: vault dir missing
  it('flags vault with missing directory', async () => {
    // registry has vault, but dir doesn't exist on disk
    const logs = [];
    const issues = await run({ cfgPath, log: m => logs.push(m) });
    expect(logs.some(l => /missing|not found/i.test(l))).toBe(true);
    expect(issues).toBeGreaterThan(0);
  });

  // D-11: hash mismatch
  it('flags vault with hash mismatch', async () => {
    // .mcp-start.js exists but sha256 != registered hash
    const logs = [];
    const issues = await run({ cfgPath, log: m => logs.push(m) });
    expect(logs.some(l => /mismatch|hash/i.test(l))).toBe(true);
    expect(issues).toBeGreaterThan(0);
  });

  // D-13: non-vault MCP server ignored
  it('ignores non-vaultkit MCP servers in config', async () => {
    // config has a claude_desktop entry without .mcp-start.js
    const issues = await run({ cfgPath, log: () => {} });
    expect(issues).toBe(0); // only vault-related issues count
  });

  // D-14: multiple vaults, mix of healthy/broken
  it('returns correct issue count across multiple vaults', async () => {
    // 3 vaults: 1 ok, 1 missing dir, 1 hash mismatch
    const issues = await run({ cfgPath, log: () => {} });
    expect(issues).toBe(2);
  });
});
```

- [ ] **Step 3.2: Run to confirm failures**

```bash
npm test -- tests/commands/doctor.test.js
```

- [ ] **Step 3.3: Implement mocks and make tests pass**

Key mocking targets:
- `src/lib/platform.js` → `findTool()` (controls git/gh/claude presence)
- `execa` → git config calls, gh auth status
- `src/lib/registry.js` → use real module with temp cfgPath file
- `src/lib/vault.js` → use real `sha256()` and `isVaultLike()`

- [ ] **Step 3.4: Run full suite, fix regressions**

```bash
npm test
```

- [ ] **Step 3.5: Commit**

```bash
git add tests/commands/doctor.test.js
git commit -m "test(doctor): comprehensive health check — tools, git config, per-vault hash/dir/layout checks"
```

---

### Task 4: `status` — vault state display

**Files:**
- Create: `tests/commands/status.test.js`

Covers S-1 through S-10.

- [ ] **Step 4.1: Write failing tests**

```js
vi.mock('../../src/lib/git.js', async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, getStatus: vi.fn() };
});

describe('status', () => {
  // S-1: no vaults
  it('prints nothing-registered message with empty registry', async () => {
    const logs = [];
    await run(undefined, { cfgPath: emptyConfig, log: m => logs.push(m) });
    expect(logs.some(l => /no vault|empty/i.test(l))).toBe(true);
  });

  // S-4: dir missing
  it('shows DIR MISSING for vault with missing directory', async () => {
    const logs = [];
    await run(undefined, { cfgPath, log: m => logs.push(m) });
    expect(logs.some(l => /missing/i.test(l))).toBe(true);
  });

  // S-6/7/8: summary with dirty / ahead / behind
  it('shows dirty flag when vault has uncommitted changes', async () => {
    getStatusMock.mockResolvedValue({ branch: 'main', dirty: true, ahead: 0, behind: 0, remote: 'origin' });
    const logs = [];
    await run(undefined, { cfgPath, log: m => logs.push(m) });
    expect(logs.some(l => /dirty|\*/i.test(l))).toBe(true);
  });

  // S-9: detailed mode
  it('shows full git output in detailed mode', async () => {
    const logs = [];
    await run('MyVault', { cfgPath, log: m => logs.push(m) });
    expect(logs.join('\n').length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 4.2: Run to confirm failures, implement, run full suite, commit**

```bash
npm test -- tests/commands/status.test.js
# Fix
npm test
git add tests/commands/status.test.js
git commit -m "test(status): empty registry, dir-missing, dirty/ahead/behind, detailed mode"
```

---

### Task 5: `verify` — launcher integrity

**Files:**
- Create: `tests/commands/verify.test.js`

Covers V-1 through V-8.

- [ ] **Step 5.1: Write failing tests**

```js
vi.mock('../../src/lib/git.js', async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, pull: vi.fn() };
});

vi.mock('execa', () => ({ execa: vi.fn() }));
vi.mock('../../src/lib/platform.js', async (imp) => ({
  ...await imp(),
  findTool: vi.fn(),
}));

describe('verify', () => {
  // V-1: not registered
  it('throws when vault not registered', async () => {
    await expect(run('Ghost', { cfgPath })).rejects.toThrow(/not.*registered/i);
  });

  // V-2: .mcp-start.js missing
  it('throws when .mcp-start.js missing', async () => {
    // vaultDir exists in registry but no launcher file
    await expect(run('MyVault', { cfgPath })).rejects.toThrow(/not found|missing/i);
  });

  // V-3: hash matches — no-op
  it('logs verified OK when hash matches', async () => {
    // Write .mcp-start.js, register with correct hash
    const logs = [];
    await run('MyVault', { cfgPath, log: m => logs.push(m) });
    expect(logs.some(l => /ok|verified|match/i.test(l))).toBe(true);
  });

  // V-4: hash mismatch
  it('re-pins when local hash does not match registered hash', async () => {
    // Write file, register with WRONG hash
    const logs = [];
    await run('MyVault', { cfgPath, log: m => logs.push(m) });
    expect(logs.some(l => /re-pin|repin|updated/i.test(l))).toBe(true);
  });

  // V-8: claude not found
  it('shows manual instructions when claude CLI not found', async () => {
    findToolMock.mockResolvedValue(null);
    const logs = [];
    await run('MyVault', { cfgPath, log: m => logs.push(m) });
    expect(logs.some(l => /manually|claude mcp/i.test(l))).toBe(true);
  });
});
```

- [ ] **Step 5.2: Run → fail → implement → run full suite → commit**

```bash
npm test -- tests/commands/verify.test.js
npm test
git add tests/commands/verify.test.js
git commit -m "test(verify): not-registered, missing launcher, hash match, hash mismatch, claude not found"
```

---

### Task 6: `backup` — expand edge cases

**Files:**
- Expand: `tests/commands/backup.test.js`

Covers B-3 through B-9.

- [ ] **Step 6.1: Write failing tests for B-3 (no .git), B-4 (no commits), B-6 (dirty warning), B-7 (custom dir), B-8 (auto-create dir), B-9 (two backups = two zips)**

- [ ] **Step 6.2: Run → fail → implement → run full suite → commit**

```bash
git commit -m "test(backup): no-git, no-commits, dirty warning, custom backupsDir, idempotent timestamps"
```

---

### Task 7: `disconnect` and `destroy` — confirmation and MCP flows

**Files:**
- Expand: `tests/commands/disconnect.test.js`
- Expand: `tests/commands/destroy.test.js`

Covers DC-4 through DC-9, DE-4 through DE-11.

- [ ] **Step 7.1: Write failing tests for confirmation flows**

```js
// disconnect - wrong name confirmation
it('aborts when user types wrong name', async () => {
  // Mock @inquirer/prompts input() to return wrong name
  vi.mock('@inquirer/prompts', () => ({
    input: vi.fn().mockResolvedValue('WrongName'),
  }));
  await expect(run('MyVault', { cfgPath })).rejects.toThrow(/aborted|cancelled/i);
  expect(existsSync(vaultDir)).toBe(true); // untouched
});

// destroy - not admin on GitHub → skips GH deletion
it('skips GitHub deletion when not admin', async () => {
  vi.mock('../../src/lib/github.js', async (imp) => ({
    ...await imp(),
    isAdmin: vi.fn().mockResolvedValue(false),
    deleteRepo: vi.fn(),
  }));
  const logs = [];
  await run('MyVault', { cfgPath, skipConfirm: true, log: m => logs.push(m) });
  expect(deleteRepoMock).not.toHaveBeenCalled();
  expect(logs.some(l => /skip|not admin/i.test(l))).toBe(true);
  expect(existsSync(vaultDir)).toBe(false); // local still deleted
});

// destroy - GitHub deletion fails, continues
it('continues with local deletion if GitHub deletion throws', async () => {
  deleteRepoMock.mockRejectedValue(new Error('network error'));
  const logs = [];
  await run('MyVault', { cfgPath, skipConfirm: true, log: m => logs.push(m) });
  expect(logs.some(l => /fail|error|warn/i.test(l))).toBe(true);
  expect(existsSync(vaultDir)).toBe(false); // local still deleted
});

// destroy - unpushed commits warning
it('warns when vault has unpushed commits', async () => {
  getStatusMock.mockResolvedValue({ ahead: 3, dirty: false, branch: 'main' });
  const logs = [];
  await run('MyVault', { cfgPath, skipConfirm: true, log: m => logs.push(m) });
  expect(logs.some(l => /unpushed|ahead/i.test(l))).toBe(true);
});
```

- [ ] **Step 7.2: Run → fail → implement → run full suite → commit**

```bash
git commit -m "test(disconnect,destroy): confirmation flow, non-admin GitHub skip, GitHub failure recovery, unpushed warnings"
```

---

### Task 8: `update` — expand existing tests

**Files:**
- Expand: `tests/commands/update.test.js`

Covers U-4 through U-10.

- [ ] **Step 8.1: Write failing tests for launcher hash match (no-op), push-rejected → PR, no upstream, claude not found**

- [ ] **Step 8.2: Run → fail → implement → run full suite → commit**

```bash
git commit -m "test(update): hash-match no-op, push-rejected PR fallback, no-upstream manual, claude-not-found manual"
```

---

### Task 9: `visibility` — mode transition state machine

**Files:**
- Create: `tests/commands/visibility.test.js`

Covers VI-1 through VI-13. This is the most complex — mock github.js extensively.

- [ ] **Step 9.1: Write failing tests for validation (VI-1 through VI-6)**

```js
it('throws for invalid mode', async () => {
  await expect(run('MyVault', 'secret', { cfgPath })).rejects.toThrow(/public.*private.*auth-gated/i);
});

it('throws when not admin', async () => {
  isAdminMock.mockResolvedValue(false);
  await expect(run('MyVault', 'public', { cfgPath })).rejects.toThrow(/admin/i);
});

it('throws auth-gated on free plan', async () => {
  isAdminMock.mockResolvedValue(true);
  getUserPlanMock.mockResolvedValue('free');
  await expect(run('MyVault', 'auth-gated', { cfgPath })).rejects.toThrow(/pro|plan/i);
});
```

- [ ] **Step 9.2: Write failing tests for mode transitions (VI-7 through VI-13)**

```js
// private → public (free)
it('enables pages and commits deploy workflow for private→public', async () => {
  isAdminMock.mockResolvedValue(true);
  getVisibilityMock.mockResolvedValue('private');
  pagesExistMock.mockResolvedValue(false);
  const logs = [];
  await run('MyVault', 'public', { cfgPath, skipConfirm: true, log: m => logs.push(m) });
  expect(enablePagesMock).toHaveBeenCalled();
  expect(logs.some(l => /public/i.test(l))).toBe(true);
});

// already in target mode
it('logs no-op when already in target mode', async () => {
  isAdminMock.mockResolvedValue(true);
  getVisibilityMock.mockResolvedValue('public');
  const logs = [];
  await run('MyVault', 'public', { cfgPath, skipConfirm: true, log: m => logs.push(m) });
  expect(logs.some(l => /already/i.test(l))).toBe(true);
});
```

- [ ] **Step 9.3: Run → fail → implement → run full suite → commit**

```bash
git commit -m "test(visibility): validation, mode transitions, auth-gated plan check, no-op detection"
```

---

### Task 10: `init` — validation + rollback

**Files:**
- Create: `tests/commands/init.test.js`

Covers I-1 through I-18. init is the most complex — focus on validation and rollback; skip interactive prompts.

- [ ] **Step 10.1: Write failing tests for validations that don't need GitHub (I-1 through I-4, I-10, I-17)**

```js
it('throws for invalid vault name', async () => {
  await expect(run('my/vault', { cfgPath })).rejects.toThrow(/owner\/repo/i);
});

it('throws when vault directory already exists', async () => {
  mkdirSync(vaultDir, { recursive: true });
  await expect(run('MyVault', { cfgPath })).rejects.toThrow(/already exists/i);
});

it('throws when name already registered in MCP', async () => {
  // cfgPath has MyVault already registered
  await expect(run('MyVault', { cfgPath })).rejects.toThrow(/already registered/i);
});
```

- [ ] **Step 10.2: Write rollback tests (I-14, I-15) — mock createRepo and push**

```js
it('deletes directory and GitHub repo when push fails', async () => {
  createRepoMock.mockResolvedValue(undefined); // succeeds
  gitPushMock.mockRejectedValue(new Error('push rejected'));
  
  await expect(run('MyVault', { cfgPath })).rejects.toThrow();
  
  expect(existsSync(vaultDir)).toBe(false); // cleaned up
  expect(deleteRepoMock).toHaveBeenCalledWith(expect.stringContaining('MyVault')); // rolled back
});

it('keeps vault and shows manual MCP instructions when claude not found', async () => {
  // Full success except findTool('claude') returns null
  findToolMock.mockImplementation(name => name === 'claude' ? null : '/usr/bin/' + name);
  const logs = [];
  await run('MyVault', { cfgPath, log: m => logs.push(m) });
  expect(existsSync(vaultDir)).toBe(true); // kept
  expect(logs.some(l => /manually|mcp add/i.test(l))).toBe(true);
});
```

- [ ] **Step 10.3: Run → fail → implement → run full suite → commit**

```bash
git commit -m "test(init): name validation, dir-exists guard, already-registered guard, rollback on push failure, no-claude warning"
```

---

### Task 11: Tool discovery — `findTool()` path probing

**Files:**
- Expand: `tests/lib/platform.test.js`

Covers PT-1 through PT-10. These mock `existsSync` and `execa` to simulate filesystem layouts without needing real tool installs. This is the test group that proves vaultkit auto-handles off-PATH installations.

- [ ] **Step 11.1: Write failing tests**

```js
import { vi, it, describe, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';

// Mock the node:fs module existsSync used by platform.js
vi.mock('node:fs', async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, existsSync: vi.fn(real.existsSync) };
});
vi.mock('execa', () => ({ execa: vi.fn() }));

describe('findTool - Windows path probing', () => {
  beforeEach(() => {
    vi.stubEnv('PROGRAMFILES', 'C:\\Program Files');
    vi.stubEnv('APPDATA', 'C:\\Users\\test\\AppData\\Roaming');
    vi.stubEnv('LOCALAPPDATA', 'C:\\Users\\test\\AppData\\Local');
  });

  // PT-1: gh in Program Files, not on PATH
  it('finds gh in Program Files on Windows', async () => {
    vi.stubEnv('PROGRAMFILES', 'C:\\Program Files');
    existsSync.mockImplementation(p =>
      p === 'C:\\Program Files\\GitHub CLI\\gh.exe'
    );
    process.platform = 'win32';
    const path = await findTool('gh');
    expect(path).toContain('GitHub CLI');
  });

  // PT-4: claude in APPDATA/npm
  it('finds claude in APPDATA/npm on Windows', async () => {
    existsSync.mockImplementation(p =>
      p === 'C:\\Users\\test\\AppData\\Roaming\\npm\\claude.cmd'
    );
    process.platform = 'win32';
    const path = await findTool('claude');
    expect(path).toContain('claude.cmd');
  });

  // PT-7: gh genuinely not found
  it('returns null when gh is not found anywhere', async () => {
    existsSync.mockReturnValue(false);
    execa.mockResolvedValue({ exitCode: 1, stdout: '' });
    const path = await findTool('gh');
    expect(path).toBeNull();
  });

  // PT-9: npmGlobalBin when npm fails
  it('npmGlobalBin returns null when npm command fails', async () => {
    execa.mockResolvedValue({ exitCode: 1, stdout: '' });
    const bin = await npmGlobalBin();
    expect(bin).toBeNull();
  });
});

describe('findTool - Unix', () => {
  // PT-6: found via which
  it('finds tool via which on Unix', async () => {
    process.platform = 'linux';
    execa.mockResolvedValue({ exitCode: 0, stdout: '/usr/local/bin/gh\n' });
    const path = await findTool('gh');
    expect(path).toBe('/usr/local/bin/gh');
  });

  // PT-8: claude truly not installed
  it('returns null for claude when not installed on Unix', async () => {
    process.platform = 'linux';
    execa.mockResolvedValue({ exitCode: 1, stdout: '' });
    const path = await findTool('claude');
    expect(path).toBeNull();
  });
});
```

- [ ] **Step 11.2: Run to confirm failures**

```bash
npm test -- tests/lib/platform.test.js --reporter=verbose
```

- [ ] **Step 11.3: Make tests pass (fix mocking setup if needed)**

Key gotcha: `platform.js` uses `import { existsSync } from 'node:fs'` — `vi.mock('node:fs', ...)` must be hoisted. Vitest handles this automatically with `vi.mock` at the top level.

- [ ] **Step 11.4: Run full suite**

```bash
npm test
```

- [ ] **Step 11.5: Commit**

```bash
git add tests/lib/platform.test.js
git commit -m "test(platform): findTool path probing — Windows Program Files, WinGet, npm global, Unix which, not-found"
```

---

### Task 12: Transactional rollback guarantees

**Files:**
- Expand: `tests/commands/init.test.js` (TX-I-1 through TX-I-4)
- Expand: `tests/commands/connect.test.js` (TX-C-1, TX-C-2)
- Expand: `tests/commands/disconnect.test.js` (TX-DC-1, TX-DC-2)
- Expand: `tests/commands/destroy.test.js` (TX-DE-1, TX-DE-2)
- Expand: `tests/commands/update.test.js` (TX-U-1, TX-U-2)
- Create: `tests/commands/visibility.test.js` (TX-VI-1)

These tests verify atomicity: if the command fails, the filesystem, MCP registry, and GitHub state are all back to what they were before the command ran.

- [ ] **Step 12.1: Write failing tests — init rollback (TX-I-1 through TX-I-4)**

```js
// TX-I-2: GitHub repo create fails → dir deleted
it('deletes vault dir when GitHub repo creation fails', async () => {
  createRepoMock.mockRejectedValue(new Error('GitHub API error'));
  
  await expect(run('MyVault', { cfgPath })).rejects.toThrow();
  
  expect(existsSync(vaultDir)).toBe(false); // dir cleaned up
  expect(deleteRepoMock).not.toHaveBeenCalled(); // nothing to delete on GitHub
});

// TX-I-3: Push fails → GitHub repo deleted + dir deleted
it('deletes GitHub repo AND vault dir when push fails', async () => {
  createRepoMock.mockResolvedValue(undefined);
  gitExecaMock.mockRejectedValue(new Error('push rejected'));
  
  await expect(run('MyVault', { cfgPath })).rejects.toThrow();
  
  expect(deleteRepoMock).toHaveBeenCalled(); // rolled back GitHub
  expect(existsSync(vaultDir)).toBe(false); // rolled back local
});

// TX-I-4: Push fails AND GitHub rollback fails — local still cleaned up
it('still cleans up local dir even if GitHub rollback fails', async () => {
  createRepoMock.mockResolvedValue(undefined);
  gitExecaMock.mockRejectedValue(new Error('push rejected'));
  deleteRepoMock.mockRejectedValue(new Error('network'));
  const logs = [];
  
  await expect(run('MyVault', { cfgPath, log: m => logs.push(m) })).rejects.toThrow();
  
  expect(existsSync(vaultDir)).toBe(false); // local always cleaned
  expect(logs.some(l => /gh repo delete/i.test(l))).toBe(true); // recovery command shown
});
```

- [ ] **Step 12.2: Write failing tests — connect rollback (TX-C-2)**

```js
// TX-C-2: Clone succeeds, MCP registration fails → cloned dir deleted
it('deletes cloned dir when MCP registration fails', async () => {
  cloneMock.mockImplementation(() => mkdirSync(vaultDir, { recursive: true }));
  execaMock.mockImplementation((cmd, args) => {
    if (args.includes('mcp')) throw new Error('claude not found');
    return { exitCode: 0, stdout: '' };
  });
  
  await expect(run('owner/MyVault', { cfgPath })).rejects.toThrow();
  
  expect(existsSync(vaultDir)).toBe(false); // cloned dir cleaned up
});
```

- [ ] **Step 12.3: Write failing tests — disconnect rollback (TX-DC-1)**

```js
// TX-DC-1: MCP removal fails → dir NOT deleted; system unchanged
it('aborts dir deletion when MCP removal fails', async () => {
  claudeExecaMock.mockResolvedValue({ exitCode: 1, stderr: 'failed' });
  
  await expect(run('MyVault', { cfgPath, skipConfirm: true })).rejects.toThrow(/mcp.*fail/i);
  
  expect(existsSync(vaultDir)).toBe(true); // dir untouched — system unchanged
});
```

- [ ] **Step 12.4: Write failing tests — destroy rollback (TX-DE-1)**

```js
// TX-DE-1: GitHub deletion fails → stop. Local and MCP untouched.
it('leaves local vault intact when GitHub deletion fails', async () => {
  isAdminMock.mockResolvedValue(true);
  deleteRepoMock.mockRejectedValue(new Error('network error'));
  
  await expect(run('MyVault', { cfgPath, skipConfirm: true })).rejects.toThrow();
  
  expect(existsSync(vaultDir)).toBe(true); // local intact
  expect(mcpRemoveMock).not.toHaveBeenCalled(); // MCP untouched
});
```

- [ ] **Step 12.5: Write failing tests — update rollback (TX-U-1, TX-U-2)**

```js
// TX-U-2: Push fails → commit reverted, launcher file back to original
it('reverts commit and file when push fails', async () => {
  const originalContent = readFileSync(launcherPath, 'utf8');
  pushMock.mockResolvedValue({ success: false, stderr: 'rejected' });
  pushOrPrMock.mockRejectedValue(new Error('push rejected'));
  
  await expect(run('MyVault', { cfgPath })).rejects.toThrow();
  
  const currentContent = readFileSync(launcherPath, 'utf8');
  expect(currentContent).toBe(originalContent); // file reverted
  // git log should show original HEAD, not a new commit
});
```

- [ ] **Step 12.6: Run → fail → implement (add rollback logic to commands where missing) → run full suite**

**This task requires implementation changes, not just tests:**
- `connect.js`: Add rollback to delete cloned dir if MCP registration throws
- `disconnect.js`: Change to throw (not continue) if MCP removal fails
- `destroy.js`: Change to throw (not continue) if GitHub deletion fails — stop entire command
- `update.js`: Add rollback of launcher file + git reset if push fails

- [ ] **Step 12.7: Commit**

```bash
git add tests/commands/ src/commands/
git commit -m "feat(commands): transactional rollback — connect, disconnect, destroy, update now atomic"
```

---

## Verification

After all tasks are complete:

- [ ] Run `npm test` — target: 0 failures, 150+ tests passing
- [ ] Grep for any remaining `vault-*.sh` or `_helpers.sh` references in test files (should be zero)
- [ ] Run `npm run check` — `bin/vaultkit.js` still parses clean
- [ ] Review test output for any warnings about missing mocks
