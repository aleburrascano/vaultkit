---
name: debug-command
description: Use when the user wants to debug a vaultkit command for issues, investigate a failing behavior, or trace a bug. Walks through investigation, reproducer-first verification (write a failing test that reproduces the bug BEFORE the fix), then implements the fix and confirms green.
---

Help me debug the vaultkit command "$ARGUMENTS". The discipline: **don't fix anything until you have a failing test that reproduces the bug.** A fix without a regression test is a fix that will silently regress.

Read [.claude/rules/testing.md](../rules/testing.md) and [.claude/rules/code-style.md](../rules/code-style.md) before starting.

## Phase 1: Investigation

1. Read `src/commands/$ARGUMENTS.ts` in full. Read its test files at `tests/commands/$ARGUMENTS.test.ts` and `tests/commands/$ARGUMENTS-mocked.test.ts` (if it exists). Read the helpers it imports.

2. Check for these common issues:
   - **Vault name not validated** — should use `Vault.tryFromName(name, cfgPath)` (which calls `validateName` internally) or `validateName(name)` directly from `src/lib/vault.ts`.
   - **Vault path resolution** uses `Vault.tryFromName` or `getVaultDir` (MCP registry), not raw user input or filesystem fallbacks for destructive ops.
   - **Windows**: paths via `path.join` / `path.dirname`; PATH lookup via `findTool` (`src/lib/platform.ts`), not bare `gh`/`claude` assumptions.
   - **MCP registration** includes `--expected-sha256=<hash>` (re-check after `claude mcp add` calls).
   - **Vault structure check** (`Vault.isVaultLike()` or `isVaultLike(dir)`) before any `rm -rf` (`rmSync({ recursive: true, force: true })`).
   - **execa stdout/stderr** access uses `String(result.stdout ?? '').trim()` (execa's wide stdout type).
   - **gh API failure classification** — does the call go through `ghJson` (which classifies via `_classifyGhFailure`)? Or does it bypass with raw `execa(ghPath, ...)` and miss the rate-limit / abuse-flag handling?

## Phase 2: Reproducer-first — write a failing test that triggers the bug

Once you've identified the suspected root cause, **don't fix it yet**. First write a test that reproduces the symptom.

- For unit-level bugs (logic in `src/lib/`): add to `tests/lib/<name>.test.ts`.
- For command-level bugs: add to `tests/commands/$ARGUMENTS-mocked.test.ts` (or the live test file if the bug only manifests against real GitHub).
- Use existing helpers from `tests/helpers/` — never invent new scaffolding when `liveDescribe`, `makeLocalVault`, `arrayLogger`, `writeCfg`, or `mockGitConfig` covers the case.

Run only the new test: `npx vitest run tests/...`. **Confirm it fails.** If it fails for the wrong reason (mock missing, fixture wrong), fix setup and rerun. If it fails for the *right* reason (the bug as described actually surfaces), you've reproduced it. If it doesn't fail at all, your understanding of the bug is wrong — go back to Phase 1.

## Phase 3: Fix and verify

Implement the fix in `src/commands/$ARGUMENTS.ts` (or wherever the root cause lives). Run the regression test from Phase 2. Confirm GREEN.

Then run the targeted test file and the FULL suite to confirm no regressions:
```bash
npx vitest run tests/commands/$ARGUMENTS.test.ts
npx vitest run tests/commands/$ARGUMENTS-mocked.test.ts
npm run check && npm run build && npm test
```

All must pass.

## Phase 4: Surface adjacent gaps

After the fix, ask: did the bug expose a thinness in the test surface for this command? If yes, suggest invoking [`/test $ARGUMENTS`](test.md) to do a full six-aspect audit — the same root cause may have siblings hiding in unrelated paths.

## Phase 5: Direct-run for ad-hoc isolation

If you need to reproduce something interactively (the bug needs visual inspection, environmental state, or a real flow), show the user how:
```bash
npm run build
node dist/bin/vaultkit.js $ARGUMENTS [typical-args]
```
If `npm link` isn't active, run `npm run build && npm link` first so you don't need to publish.

## Anti-patterns this command refuses

- **Fix-then-test** — applying the fix before reproducing the bug means you can't tell whether your fix actually addressed the cause or just masked it. Reproducer first.
- **Editing existing tests to make them pass** — the sacred tests rule (per [CLAUDE.md](../../CLAUDE.md)) says existing tests are read-only. If a test seems wrong, ask first.
- **Symptom suppression** — silencing an error or short-circuiting a code path so the visible failure goes away. Find the root cause; don't paper over it.
- **Fixing without confirming** — every fix must be verified by a green test. Trust the failing test, not "looks right."

Report findings as a concise list at the end: what's fine, what was the root cause, what was added (regression test path), and what's left as follow-up.
