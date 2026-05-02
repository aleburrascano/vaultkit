---
name: test
description: Sweeps the repo for test debt by default — files with no test partner, thin coverage, marginal assertions, skipped/todo tests — and produces a ranked punch list. On user pick of items from the list, runs the six-aspect deep audit (unit / mocked-integration / e2e / edge cases / security / cross-platform) and writes tests on approval. Pass an explicit target (file path under `src/`, command name, or free text) to skip the sweep and go straight to the deep audit.
---

You are a testing expert. Your job is to break this code, not to praise it.

Target: "$ARGUMENTS".
- **Empty (default)** → Mode A: codebase sweep. Run Phase A1-A2 below, then ask the user which items to deep-audit.
- File path under `src/` → Mode B: skip the sweep, deep-audit that file.
- Command name (e.g. `init`, `destroy`) → Mode B: deep-audit `src/commands/<name>.ts` end-to-end.
- Free text description → Mode B: identify the implementing files first, then deep-audit them.

Read [.claude/rules/testing.md](../rules/testing.md) before doing anything in either mode — it tells you the runner (vitest), the helpers in `tests/helpers/`, the live-test conventions (`vk-live-*` prefix, `liveDescribe` skips Windows, `makeLocalVault` for non-GitHub vaults), the sacred tests rule, and the cleanup invariants.

---

# Mode A — codebase sweep (no target)

The sweep is **cheap**. It does not dispatch sub-agents. It uses direct Glob, Grep, and `wc -l` calls to surface candidates, then ranks them. Sub-agents are reserved for the deep audit on items the user picks.

## Phase A1: Discovery

Run all of these in parallel (single message, multiple tool calls). Order matters only when later steps depend on earlier outputs — these don't.

1. **Source/test cross-reference.**
   - `Glob src/**/*.ts` → set S of source files.
   - `Glob tests/**/*.test.ts` → set T of test files.
   - For each file in S (excluding `src/types.ts` and pure constants/messages files), enumerate candidate test paths:
     - `tests/lib/<basename>.test.ts`
     - `tests/commands/<basename>.test.ts`
     - `tests/commands/<basename>-mocked.test.ts`
   - Files in S with **zero** matching test paths in T → flag as **NO_TEST**. (The `prereqs.ts` audit that produced this command shape was a NO_TEST hit.)
2. **LOC ratio.**
   - For each S-file with ≥1 matching test, compute `test_loc / source_loc` (sum across all matching test files).
   - Flag as **THIN_COVERAGE** when `source_loc ≥ 80` AND `ratio < 0.5`. The heuristic rules out small leaf utilities; tune up if too noisy.
3. **Marginal-assertion grep.** Run these patterns across `tests/**/*.test.ts`:
   - `expect\([^)]+\)\.toBeDefined\(\)` — frequently a stand-in for "I didn't know what to assert".
   - `expect\([^)]+\)\.toBeTruthy\(\)` and `\.toBeFalsy\(\)` — same.
   - `\.toMatchSnapshot\(\)` — flag the test only if no other `expect` follows in the same `it(...)` block (snapshot-pinning internal state).
   - `\.rejects\.toThrow\(\)` with no string/regex argument — passes for *any* throw, including the wrong throw.
   - `expect\([^)]+\)\.toMatch\(/\.\*?/\)` — regex matches anything.
   Group hits by test file; flag files with ≥2 hits as **MARGINAL_TESTS**.
4. **Skipped / TODO enumeration.** Grep `tests/**/*.test.ts` for `\bit\.skip\(`, `\bit\.todo\(`, `\bdescribe\.skip\(`, `\bxit\(`, `\bxdescribe\(`. Each hit is a deferred test — flag as **SKIPPED**.
5. **Branch density vs `it` density (cheap proxy).**
   - Per source file: count of `\bif\b`, `\belse if\b`, `\bswitch\b`, `\bcase\b`, `\?[^:]+:`, `\|\|`, `\&\&` (rough branch count).
   - Per matching test file: count of `\bit\(`.
   - Flag as **UNDER_BRANCHED** when `branch_count > 5 × it_count` (test count grew slower than branches).

## Phase A2: Punch list

Merge the five flag classes into a single ranked list. Apply blast-radius weighting:

- **HIGHEST** — `src/lib/*.ts` files flagged NO_TEST. Lib modules are single sources of truth shared by many commands; a bug ripples widely.
- **HIGH** — files in the security-invariants list ([.claude/rules/security-invariants.md](../rules/security-invariants.md): `destroy.ts`, `disconnect.ts`, `connect.ts`, `init.ts`, `registry.ts`, `vault.ts`, `github.ts`) with any flag.
- **HIGH** — `src/commands/*.ts` files flagged NO_TEST or missing a `-mocked.test.ts` partner.
- **MEDIUM** — THIN_COVERAGE and UNDER_BRANCHED hits in `src/lib/` or `src/commands/`.
- **MEDIUM** — MARGINAL_TESTS in any test file (regardless of source file's risk).
- **LOW** — SKIPPED tests and marginal assertions in test files for leaf utilities.

Output in this exact format:

```
Sweep summary
  src files audited: <N>     (excluded: types.ts, constants.ts, messages.ts)
  test files audited: <N>
  no_test:        <N>
  thin_coverage:  <N>
  marginal_tests: <N>
  skipped/todo:   <N>
  under_branched: <N>

Top <N> findings (blast radius, highest first):
  1. [HIGHEST] src/lib/<file>.ts — NO_TEST
     Why: <one-line reason — "single source of truth shared by setup/init">
  2. [HIGH]    src/commands/<file>.ts — THIN_COVERAGE (test:source ratio 0.21)
     Why: <one-line reason>
  3. [HIGH]    tests/commands/<file>.test.ts — MARGINAL_TESTS (3 hits: toBeDefined×2, rejects.toThrow×1)
     Why: <one-line reason>
  4. ...

Pick items to deep-audit. Examples:
  • "deep 1, 3"      — run the six-aspect audit on items 1 and 3 in parallel
  • "deep all"       — audit every item (expensive — confirm twice for >5 items)
  • "explain 4"      — show the raw greps / file paths behind finding 4
  • "skip"           — exit without auditing
```

Cap the punch list at 10 by default. If the sweep produces more, name the top 10 and report the residual count (`+ 7 more — say "deep all" to expand"`).

## Phase A3: User pick → deep audit

When the user names items (e.g. "deep 1, 3, 5"), expand each into a Mode B run. Multi-item picks dispatch the six-agent audits **in parallel** when items are independent (different files). When items overlap (same file flagged for two reasons), merge into a single audit run.

Single-item pick → straight to Mode B Phase B1 with the picked item as target.

---

# Mode B — targeted deep audit

This is the existing six-aspect flow. Use it directly when the user passes `$ARGUMENTS`, or transitively from Mode A Phase A3.

## Phase B1: Reconnaissance

Read in full:
- The source file(s) you're auditing.
- All matching test files: `tests/lib/<name>.test.ts`, `tests/commands/<name>.test.ts`, `tests/commands/<name>-mocked.test.ts`.
- Helpers the source imports.

State, in your head: what does this code do, what inputs does it take, what side effects does it produce, where does it fail?

## Phase B2: Six-aspect parallel review

Dispatch **six Explore subagents in parallel** (single message, multiple Agent tool calls). Each gets the same target context but a single concern. The split prevents one agent from trading concerns off against each other.

Hand each subagent: the target's source file paths, the existing test file paths, and the relevant rule file (`.claude/rules/testing.md` for all six; `.claude/rules/security-invariants.md` for sub-reviewer 5; `.claude/rules/architecture.md` for sub-reviewer 6).

**Important framing for every sub-reviewer:** the items listed under each concern are **starting points, not a closed checklist**. Use them to ground your thinking, then surface anything else within the concern's scope that the example list didn't anticipate — locale-specific bugs the boundary list missed, race conditions the state list didn't enumerate, security gaps the OWASP-style examples didn't cover, platform-specific failure modes nobody named yet. The examples are intentionally non-exhaustive. If a gap belongs in your concern's territory, surface it even if no example pointed at it. Conversely, don't pad findings with examples that don't actually apply to the target — speculative gaps degrade the report.

The six concerns:

1. **Unit-test gaps** — pure functions, library helpers in `src/lib/`. Branches and return shapes covered? Boundary returns (null, empty, undefined) covered? Async failure paths covered?
2. **Mocked-integration gaps** — command-level paths in `src/commands/` where execa / @inquirer / fs are mocked. Failure modes covered? Mock argv shapes match what the migrated `gh api` callers actually invoke (post-2.7.1)? Log-line assertions present?
3. **End-to-end gaps** — live tests, real GitHub round-trips. Anything that only manifests on a real round-trip not covered today? Should this scenario use `liveDescribe` (Ubuntu only) or `makeLocalVault` (no GitHub remote)?
4. **Edge-case enumeration** — adversarial. Boundary inputs (0, 1, max, max+1, NaN, null, undefined, empty string), invalid state transitions, race conditions, encoding (Unicode, BOM, locale), length (empty / single / very long / exactly-at-limit), timing, ordering.
5. **Security gaps** — path traversal in vault names (`../`, absolute paths), shell injection in execa args, hash mismatches (launcher modified outside vaultkit), privilege-escalation order (`delete_repo` requested before `isAdmin` check), JSON-unsafe content. Cross-reference [.claude/rules/security-invariants.md](../rules/security-invariants.md).
6. **Cross-platform gaps** — Windows path handling, `findTool` fallbacks, line endings, file locks, case sensitivity. Should the test wrap in `liveDescribe` (skip Windows) or run on both OSes?

Each subagent returns ≤200 words: a list of **specific scenarios that the target should but doesn't currently cover**. No test-type recommendations from subagents — that's the merge step's job.

## Phase B3: Merge + prioritize

Take the six findings and merge into a single coverage matrix. Deduplicate (multiple agents may surface the same gap from different angles — collapse them). Order by **blast radius**: production-impacting bugs first, latent code paths second, defense-in-depth third.

For each gap, recommend the cheapest test that would catch it, in this order:
- **Unit** in `tests/lib/<name>.test.ts` — pure function or library helper.
- **Mocked integration** in `tests/commands/<name>-mocked.test.ts` — `vi.mock` for execa / @inquirer / fs.
- **Local-vault integration** with `makeLocalVault` from `tests/helpers/local-vault.ts` — needs real vault layout, no GitHub remote.
- **Live test in `tests/commands/<name>.test.ts` wrapped in `liveDescribe`** — needs real GitHub (Ubuntu CI only).
- **Launcher integration** in `tests/lib/launcher-integration.test.ts` — spawns real Node against the byte-immutable template.

Never invent new test scaffolding when a helper exists.

## Phase B4: Coverage report

Output in this exact format:

```
Target: <file or command>
Existing tests: <list of test file paths + LOC>

Already covered:
  - <scenario> → <test name>

Marginal coverage (vacuous assertion or wrong path):
  - <scenario> → <test name>: <why it's marginal>

Missing (priority order, highest blast radius first):
  1. <scenario>: <why it matters> → recommended: <test type> in <file>
  2. ...

Sub-reviewer breakdown:
  Unit: <N> · Integration: <N> · E2E: <N> · Edges: <N> · Security: <N> · Cross-platform: <N>
```

Close with: **"Want me to write tests for items N–M?"**

When multiple targets were deep-audited (Mode A multi-pick), produce one block per target, separated by `---`, then a final aggregated `Want me to write tests for [target.item], [target.item], ...?` close.

---

# Implementation (Mode A or B, only on user approval)

For each approved scenario in priority order:

1. Write the test asserting the expected behavior.
2. Run the targeted file: `npx vitest run <test-file>`.
3. Confirm the test fails for the **right** reason.
   - Wrong reason (mock missing, fixture wrong) → fix setup, rerun.
   - **Right** reason and the implementation doesn't handle the edge case → surface to user. **This is the gold** — a real bug found before users hit it. Ask whether to fix the implementation now or capture it as a follow-up.
4. Make the test pass.
5. After all scenarios: `npm run check && npm run build && npm test` for full-suite confirmation.

Per CLAUDE.md commit cadence: commit each independently-shippable scenario as you go. A bug fix bundled with its regression test is one shippable unit; a suite of new coverage tests with no source changes is another.

---

# Anti-patterns this command refuses

- **Editing existing tests** without explicit approval. Sacred tests rule per [CLAUDE.md](../../CLAUDE.md): if a test seems wrong, ask before changing it. Adding a new `it(...)` block to an existing file is fine; modifying an existing assertion is not.
- **Vacuous assertions** — `expect(result).toBeDefined()` when you should assert the actual value; `await expect(p).rejects.toThrow()` on a no-throw path; `toMatch(/.*?/)` that matches anything.
- **Mocking the function under test** — you're testing the mock, not the function.
- **Snapshot-pinning internal state** — assert observed behavior, not internal data structures.
- **Coverage theater** — adding tests that hit lines without exercising failure modes. Coverage % rises, bug-finding power doesn't.
- **Inventing new test scaffolding** when an existing helper covers the case (`liveDescribe`, `makeLocalVault`, `arrayLogger`, `writeCfg`, `mockGitConfig`).
- **Dispatching agents in Mode A Phase A1.** The sweep is cheap on purpose. Glob/Grep/`wc` only — agents are reserved for the deep audit.
- **Auto-implementing without a pick.** Mode A Phase A2 always closes with a punch list and waits. Multi-file edits without an explicit user pick get out of hand fast.
