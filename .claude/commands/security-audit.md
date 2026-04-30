---
name: security-audit
description: Audit vaultkit command modules for security invariants
---

Security audit for vaultkit.

Target: "$ARGUMENTS" (if empty, audit all `src/commands/*.ts` modules).

For each command module, verify:

1. **Vault name validation** — uses `validateName` (or `Vault.tryFromName`, which calls it) before any operation. Pattern enforced: `^[a-zA-Z0-9_-]+$` and ≤64 chars.
2. **No raw path acceptance** for destructive operations — paths come from `Vault.tryFromName` / `getVaultDir` (MCP registry), never raw user input or filesystem fallbacks.
3. **Vault structure check** — `Vault.isVaultLike()` (or `isVaultLike(dir)`) is called before any `rmSync({ recursive: true, force: true })`.
4. **MCP registration pins the hash** — every `claude mcp add` includes `--expected-sha256=<hash>`. SHA-256 is shown to user + `[y/N]` prompt before registration (see `connect.ts`).
5. **GitHub ownership check** — `gh repo delete` is preceded by an explicit `isAdmin(slug)` check from `src/lib/github.ts`; `delete_repo` scope is requested via `ensureDeleteRepoScope()` only when about to delete.
6. **Transactional rollback** — `connect.ts`/`init.ts`/destructive flows use a `try { ... } catch { rollback }` (or `cloned` flag + `finally`) to undo partial work on failure.
7. **No command injection** — user input is never interpolated directly into `execa` args without validation. `execa` calls take args as arrays, never as a single shell-interpreted string.
8. **Windows safety** — paths use `node:path` join/dirname; tool discovery via `findTool` from `src/lib/platform.ts`, not bare assumptions about PATH.
9. **JSON parsing** — `JSON.parse(...)` results cast to typed shapes (e.g., `as ClaudeConfig`) and narrowed at the boundary; no silent `any`.

Report: list each check as PASS / FAIL / N/A with the specific line number for any FAIL.
