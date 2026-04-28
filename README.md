# vault-init

One command to create a collaborative Obsidian wiki with GitHub Pages, pull-request gating, duplicate source detection, and Claude Code MCP access — fully automated.

## What you get

- **Public site** at `https://your-username.github.io/your-wiki-name` — deployed automatically on every merge
- **PR-gated contributions** — nobody writes directly to `main`; every change goes through a pull request
- **Duplicate source check** — CI blocks PRs that add a source file with a name already in `raw/`
- **Claude Code MCP** — if you use Claude Code, the wiki is queryable from any project via `search_notes`, `get_note`, `get_backlinks`, and 20+ other tools

## Prerequisites

```bash
# Git
git --version

# Node.js 22 or later
node --version   # must be v22+

# GitHub CLI — https://cli.github.com
gh --version
gh auth login    # once

# (Optional) Claude Code — https://claude.ai/code
# Required only for MCP registration. The wiki works without it.
```

**Windows users:** run everything in Git Bash (comes with Git for Windows).

## Install

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/aleburrascano/vault-init/main/install.sh)
```

Or via npm:

```bash
npm install -g @aleburrascano/vault-init
```

## Create your first wiki

```bash
vault-init my-wiki-name            # public repo
vault-init my-wiki-name --private  # private repo
```

That's it. The command:
1. Creates the vault structure (`wiki/`, `raw/`, `index.md`, `log.md`, `CLAUDE.md`)
2. Sets up Quartz (the static site generator)
3. Creates the GitHub repository
4. Enables GitHub Pages
5. Pushes — your site is live in ~60 seconds
6. Registers the wiki as a Claude Code MCP server (if Claude Code is installed)

## Vault structure

```
my-wiki-name/
├── raw/          ← source material (immutable — never edit these)
│   ├── articles/
│   ├── books/
│   ├── notes/
│   └── ...
├── wiki/         ← your authored pages
│   ├── concepts/
│   ├── topics/
│   ├── people/
│   └── sources/
├── index.md      ← page index (one line per page)
├── log.md        ← append-only operation log
└── CLAUDE.md     ← instructions for your AI assistant
```

## Contributing to someone else's wiki

1. Fork the repo on GitHub
2. Add your source file to `raw/` and create wiki pages
3. Open a pull request — CI checks for duplicate source filenames automatically
4. The maintainer reviews and merges

## Using with Claude Code

After `vault-init` runs, your wiki is registered as a Claude Code MCP server. In any project:

```
search_notes    → full-text search across all wiki pages
get_note        → read a specific page
get_backlinks   → find what links to a page
get_tags        → browse by tag
... and 20+ more tools
```

Each wiki you create gets its own MCP namespace — `mcp__architecture-wiki__*`, `mcp__cooking-wiki__*`, etc. — all available simultaneously from any project.

## Updating vault-init

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/aleburrascano/vault-init/main/install.sh)
```
