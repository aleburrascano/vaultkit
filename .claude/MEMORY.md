# vaultkit Context Index

This index tracks key project knowledge. Each entry points to a rule file. Files without `paths:` frontmatter load on every session; files with `paths:` frontmatter auto-load only when matching files are touched.

## Always Loaded
- [Domain Language](rules/domain-language.md) — vault, launcher, dispatch, MCP helpers, Vault class, VaultkitError, exit codes
- [Testing Rules](rules/testing.md) — vitest, helpers (silent / arrayLogger / writeCfg / mockGitConfig), sacred tests rule, launcher integration test
- [Hallucination Patterns](rules/hallucination-patterns.md) — populated via `/ce-compound` after slip-ups

## Context-Triggered (auto-loaded by `paths:` frontmatter)
- [Architecture](rules/architecture.md) — stack, dispatch flow, command → module map, shared-library reference (loads on any TS file)
- [Code Style](rules/code-style.md) — TypeScript / ESM conventions, MCP + github wrappers as single source of truth, logging levels (loads on src/commands, src/lib, bin)
- [Doc Sync](rules/doc-sync.md) — what rule files to update when code changes (loads on src/commands, src/lib, bin)
- [Security Invariants](rules/security-invariants.md) — vault names, registry-only path resolution, MCP hash pinning, ownership checks (loads on destructive-op files)
