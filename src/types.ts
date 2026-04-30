/**
 * Shared type definitions for vaultkit.
 * Adopted file-by-file as each module migrates from .js to .ts.
 */

// ─── Claude config / MCP registry ───────────────────────────────────────

/** Single entry in `~/.claude.json#mcpServers`. */
export interface McpServerEntry {
  command: string;
  args?: unknown[];
}

/** Top-level `~/.claude.json` shape — only fields vaultkit reads. */
export interface ClaudeConfig {
  mcpServers?: Record<string, McpServerEntry>;
}

/** Registry's logical view of a vault. */
export interface VaultRecord {
  name: string;
  dir: string;
  hash: string | null;
}

// ─── Command runtime options ────────────────────────────────────────────

/** Logger function compatible with `console.log`. */
export type LogFn = (...args: unknown[]) => void;

/** Common options accepted by every command's `run` function. */
export interface RunOptions {
  cfgPath?: string;
  log?: LogFn;
}

// ─── Git operation results (src/lib/git) ────────────────────────────────

export interface GitPushResult {
  success: boolean;
  stderr: string;
}

export interface GitPullResult {
  success: boolean;
  upToDate: boolean;
  timedOut: boolean;
  stderr: string;
}

export interface GitStatus {
  branch: string;
  dirty: boolean;
  ahead: number;
  behind: number;
  lastCommit: string | null;
  remote: string | null;
}

export type GitPushOrPrResult =
  | { mode: 'direct' }
  | { mode: 'pr'; branch: string };

// ─── GitHub API response narrowings (src/lib/github) ────────────────────

/** Subset of `gh api user` response that vaultkit reads. */
export interface GhUserResponse {
  login?: string;
  plan?: { name?: string };
}

/** Subset of `gh api repos/:slug` response that vaultkit reads. */
export interface GhRepoResponse {
  visibility?: string;
  permissions?: { admin?: boolean };
}

/** Subset of `gh api repos/:slug/pages` response that vaultkit reads. */
export interface GhPagesResponse {
  public?: boolean;
  visibility?: string;
}

/** Repo info distilled by `_parseRepoJson`. */
export interface GhRepoInfo {
  visibility: string;
  isAdmin: boolean;
}

/** Visibility values vaultkit accepts as input. */
export type Visibility = 'public' | 'private';
