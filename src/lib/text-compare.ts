/**
 * Text-compare helper for the freshness check on non-git sources.
 * Fetches a URL, extracts the article body via Mozilla Readability,
 * strips both sides to plain text, and reports a Jaccard similarity
 * score. Format-noise tolerant: a markdown clip whose Web Clipper
 * formatting differs from a fresh fetch's still scores ~1 if the
 * underlying words match.
 *
 * Dynamically imports `jsdom` and `@mozilla/readability` so the
 * runtime cost lands only on `refresh` invocations — other commands
 * don't pay the JSDOM startup tax.
 */

export type CompareResult =
  | { kind: 'compared'; similarity: number }
  | { kind: 'unfetchable'; reason: string };

const USER_AGENT = 'Mozilla/5.0 (compatible; vaultkit-refresh/1.0; +https://github.com/aleburrascano/vaultkit)';

const MIN_ARTICLE_LENGTH = 100;
const FETCH_TIMEOUT_MS = 15_000;

/**
 * Validate a URL against the SSRF allowlist before fetch. Returns null when
 * safe; returns a human-readable rejection reason otherwise. Rejects:
 *   - non-http(s) protocols (file://, data:, javascript:, ftp://, etc.)
 *   - localhost / 0.0.0.0 hostnames
 *   - IPv4 loopback (127.0.0.0/8)
 *   - IPv4 link-local (169.254.0.0/16) — covers AWS IMDS at 169.254.169.254
 *   - IPv4 RFC 1918 private ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
 *   - IPv6 loopback (::1), link-local (fe80::/10), ULA (fc00::/7)
 *
 * Does NOT defend against DNS rebinding (a public hostname that resolves to
 * an internal IP); that requires resolving DNS before the fetch and rejecting
 * the resolved address, which is out of scope. The allowlist covers the
 * static-URL surface a malicious vault frontmatter could exploit.
 */
export function _rejectInternalUrl(url: string): string | null {
  let parsed: URL;
  try { parsed = new URL(url); } catch { return 'invalid URL'; }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return `non-http(s) protocol: ${parsed.protocol}`;
  }

  // URL.hostname returns IPv6 addresses without brackets. Normalize anyway.
  const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();

  if (host === 'localhost' || host === '0.0.0.0') return `internal hostname: ${host}`;

  // IPv4 numeric ranges
  const ipv4 = host.split('.');
  if (ipv4.length === 4 && ipv4.every(p => /^\d{1,3}$/.test(p))) {
    const a = parseInt(ipv4[0] ?? '', 10);
    const b = parseInt(ipv4[1] ?? '', 10);
    if (a === 127) return `loopback IPv4: ${host}`;
    if (a === 10) return `private IPv4: ${host}`;
    if (a === 169 && b === 254) return `link-local IPv4: ${host}`;
    if (a === 172 && b >= 16 && b <= 31) return `private IPv4: ${host}`;
    if (a === 192 && b === 168) return `private IPv4: ${host}`;
  }

  // IPv6 ranges (host already lowercased and bracket-stripped)
  if (host === '::1' || host === '::') return `IPv6 loopback: ${host}`;
  if (host.startsWith('fe80:')) return `IPv6 link-local: ${host}`;
  if (/^fc[0-9a-f]{2}:/.test(host) || /^fd[0-9a-f]{2}:/.test(host)) return `IPv6 ULA: ${host}`;

  return null;
}

/**
 * Strip YAML frontmatter, markdown formatting, and whitespace
 * collapse to get a plain-text projection of a markdown file
 * suitable for comparison against extracted article text.
 */
export function plainTextFromMarkdown(md: string): string {
  return md
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/^>\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Jaccard similarity over word sets, normalized to [0, 1].
 * Cheap and format-tolerant — order doesn't matter, exact-match
 * formatting differences vanish, but real word-level changes
 * reduce the score predictably.
 */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
  if (wordsA.size === 0 && wordsB.size === 0) return 1;
  let intersect = 0;
  for (const w of wordsA) if (wordsB.has(w)) intersect += 1;
  const union = wordsA.size + wordsB.size - intersect;
  return union === 0 ? 1 : intersect / union;
}

/**
 * Fetch the URL, extract its article body, and compare against
 * `localMarkdownText`. Returns `unfetchable` for paywalls/SPAs/
 * 4xx/5xx/network errors so the caller can route those to the
 * report's "manual review" section.
 */
export async function compareSource(
  url: string,
  localMarkdownText: string,
): Promise<CompareResult> {
  // SSRF allowlist: refuse before fetch so a malicious vault's frontmatter
  // URL cannot reach internal services (AWS IMDS, localhost, RFC 1918).
  const rejection = _rejectInternalUrl(url);
  if (rejection) {
    return { kind: 'unfetchable', reason: rejection };
  }

  let response: Response;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: controller.signal,
        redirect: 'follow',
      });
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    const msg = (err as { message?: string })?.message ?? String(err);
    return { kind: 'unfetchable', reason: `fetch failed: ${msg}` };
  }

  if (!response.ok) {
    return { kind: 'unfetchable', reason: `HTTP ${response.status} ${response.statusText || ''}`.trim() };
  }

  const html = await response.text();

  let articleText: string;
  try {
    const { JSDOM } = await import('jsdom');
    const { Readability } = await import('@mozilla/readability');
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();
    if (!article || !article.textContent) {
      return { kind: 'unfetchable', reason: 'Readability returned no article content (likely JS-rendered SPA)' };
    }
    articleText = String(article.textContent).trim().replace(/\s+/g, ' ');
  } catch (err) {
    const msg = (err as { message?: string })?.message ?? String(err);
    return { kind: 'unfetchable', reason: `article extraction failed: ${msg}` };
  }

  if (articleText.length < MIN_ARTICLE_LENGTH) {
    return { kind: 'unfetchable', reason: `article body < ${MIN_ARTICLE_LENGTH} chars (likely JS-rendered SPA)` };
  }

  const localText = plainTextFromMarkdown(localMarkdownText);
  return { kind: 'compared', similarity: similarity(articleText, localText) };
}
