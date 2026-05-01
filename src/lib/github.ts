import { execa } from 'execa';
import { findTool } from './platform.js';
import type {
  GhUserResponse,
  GhRepoResponse,
  GhPagesResponse,
  GhRepoInfo,
  Visibility,
} from '../types.js';

interface GhResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

async function gh(...args: string[]): Promise<GhResult> {
  const ghPath = await findTool('gh');
  if (!ghPath) throw new Error('gh CLI not found. Install from https://cli.github.com');
  const result = await execa(ghPath, args, { reject: false });
  return {
    stdout: String(result.stdout ?? ''),
    stderr: String(result.stderr ?? ''),
    exitCode: result.exitCode ?? 1,
  };
}

async function ghJson(...args: string[]): Promise<string> {
  const result = await gh(...args);
  if (result.exitCode !== 0) throw new Error(`gh ${args.join(' ')}: ${result.stderr}`);
  return result.stdout;
}

// ── Pure JSON parsers (exported for unit tests) ───────────────────────────────

export function _parseUserJson(json: string): string {
  const data = JSON.parse(json) as GhUserResponse;
  if (!data.login) throw new Error('login field missing from user response');
  return data.login;
}

export function _parsePlanJson(json: string): string {
  const data = JSON.parse(json) as GhUserResponse;
  return data?.plan?.name ?? 'free';
}

export function _parseRepoJson(json: string): GhRepoInfo {
  const data = JSON.parse(json) as GhRepoResponse;
  return {
    visibility: data.visibility ?? '',
    isAdmin: data?.permissions?.admin === true,
  };
}

export function _parsePagesJson(json: string | null | undefined): Visibility | null {
  if (!json) return null;
  try {
    const data = JSON.parse(json) as GhPagesResponse;
    if (typeof data.public === 'boolean') return data.public ? 'public' : 'private';
    if (data.visibility) return data.visibility === 'public' ? 'public' : 'private';
    return 'public';
  } catch {
    return null;
  }
}

// ── Live gh wrappers ──────────────────────────────────────────────────────────

export async function getCurrentUser(): Promise<string> {
  const json = await ghJson('api', 'user');
  return _parseUserJson(json);
}

export async function getUserPlan(): Promise<string> {
  const json = await ghJson('api', 'user');
  return _parsePlanJson(json);
}

export async function isAuthenticated(): Promise<boolean> {
  const result = await gh('auth', 'status');
  return result.exitCode === 0;
}

export interface CreateRepoOptions {
  visibility?: Visibility;
}

export async function createRepo(name: string, { visibility = 'private' }: CreateRepoOptions = {}): Promise<void> {
  await ghJson('repo', 'create', name, `--${visibility}`, '--confirm');
}

export async function deleteRepo(slug: string): Promise<void> {
  await ghJson('repo', 'delete', slug, '--yes');
}

export async function repoExists(slug: string): Promise<boolean> {
  const result = await gh('repo', 'view', slug);
  return result.exitCode === 0;
}

export async function isAdmin(slug: string): Promise<boolean> {
  try {
    const json = await ghJson('api', `repos/${slug}`);
    return _parseRepoJson(json).isAdmin;
  } catch {
    return false;
  }
}

export async function getVisibility(slug: string): Promise<string> {
  const json = await ghJson('api', `repos/${slug}`);
  return _parseRepoJson(json).visibility;
}

export async function setRepoVisibility(slug: string, visibility: Visibility): Promise<void> {
  await ghJson('repo', 'edit', slug, '--visibility', visibility, '--accept-visibility-change-consequences');
}

export interface EnablePagesOptions {
  buildType?: 'workflow' | 'legacy';
}

export async function enablePages(slug: string, { buildType = 'workflow' }: EnablePagesOptions = {}): Promise<void> {
  await ghJson('api', `repos/${slug}/pages`, '--method', 'POST',
    '--field', `build_type=${buildType}`,
    '--field', 'source[branch]=main',
    '--field', 'source[path]=/');
}

export async function setPagesVisibility(slug: string, visibility: Visibility): Promise<void> {
  await ghJson('api', `repos/${slug}/pages`, '--method', 'PUT',
    '--field', `public=${visibility === 'public'}`);
}

export async function disablePages(slug: string): Promise<void> {
  await gh('api', `repos/${slug}/pages`, '--method', 'DELETE');
}

export async function pagesExist(slug: string): Promise<boolean> {
  const result = await gh('api', `repos/${slug}/pages`);
  return result.exitCode === 0;
}

export async function getPagesVisibility(slug: string): Promise<Visibility | null> {
  const result = await gh('api', `repos/${slug}/pages`);
  if (result.exitCode !== 0) return null;
  return _parsePagesJson(result.stdout);
}

export async function ensureDeleteRepoScope(): Promise<void> {
  const ghPath = await findTool('gh');
  if (!ghPath) throw new Error('gh CLI not found');
  await execa(ghPath, ['auth', 'refresh', '-h', 'github.com', '-s', 'delete_repo'], { timeout: 10_000, reject: false });
}

// ─── URL builders ─────────────────────────────────────────────────────────

/**
 * Public URL of a GitHub repository. With `path`, returns a sub-page URL
 * (e.g. `repoUrl('owner/repo', 'settings/pages')`). Single source of
 * truth so a hypothetical github.com → ghe.example.com swap edits one
 * file, not ten.
 */
export function repoUrl(slug: string, path?: string): string {
  return path ? `https://github.com/${slug}/${path}` : `https://github.com/${slug}`;
}

/** HTTPS clone URL for a repository (`.git` suffix). */
export function repoCloneUrl(owner: string, repo: string): string {
  return `https://github.com/${owner}/${repo}.git`;
}

/** Public site URL for a GitHub Pages-enabled repository (with trailing slash). */
export function pagesUrl(owner: string, repo: string): string {
  return `https://${owner}.github.io/${repo}/`;
}
