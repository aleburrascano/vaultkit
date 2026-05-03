---
paths:
  - "src/commands/destroy.ts"
  - "src/commands/disconnect.ts"
  - "src/commands/connect.ts"
  - "src/commands/init.ts"
  - "src/commands/refresh.ts"
  - "src/lib/registry.ts"
  - "src/lib/vault.ts"
  - "src/lib/github.ts"
  - "src/lib/text-compare.ts"
---

# Security Invariants — Never Break These

- **Vault names** must match `^[a-zA-Z0-9_-]+$`, max 64 chars. Use `validateName` from [src/lib/vault.ts](../../src/lib/vault.ts) (also enforced by `Vault.tryFromName`).
- **Vault paths** for destructive ops must come from the MCP registry (`getVaultDir` from [src/lib/registry.ts](../../src/lib/registry.ts), or `Vault.tryFromName` which calls it), never raw user input or filesystem fallbacks. `connect`/`init` are the only commands allowed to create new entries.
- **MCP registration** must include `--expected-sha256=<hash>` so the launcher can self-verify on every Claude Code session.
- **Repo deletion** (whether via `gh repo delete` shorthand or `gh api --method DELETE /repos/<slug>`) must be preceded by an explicit ownership check (`isAdmin` from [src/lib/github.ts](../../src/lib/github.ts)) and a typed-name confirmation. The argv shape changed in 2.7.1 (migrated to `gh api` for header-aware retry); the precondition is unchanged. `deleteRepo` is the single source of truth for the call shape.
- **`isVaultLike`** (or `Vault.isVaultLike()`) must be checked before any directory deletion.
- **`delete_repo` scope** must be requested only when actually about to delete (skip for collaborators who can't delete anyway).
- **`--vault-dir` (refresh)** is direct user input — must be resolved to absolute and validated via `isVaultLike` before any filesystem read or write. Without this, `vaultkit refresh --vault-dir /etc` would walk arbitrary paths and `mkdirSync(<path>/wiki/_freshness, ...)` into system directories.
- **Frontmatter URLs in `raw/<file>.md`** drive `compareSource`'s HTTP fetch on `vaultkit refresh`. The URL is direct attacker-controllable input from the upstream vault, so `compareSource` rejects via `_rejectInternalUrl` before any fetch: non-http(s) protocols, localhost / 0.0.0.0, IPv4 loopback (127.0.0.0/8), link-local (169.254.0.0/16 — covers AWS IMDS), RFC 1918 private (10/8, 172.16-31/12, 192.168/16), IPv6 loopback / link-local / ULA. This does NOT defend against DNS rebinding (a public hostname that resolves to an internal IP); add resolver-level guards if the threat model expands.
