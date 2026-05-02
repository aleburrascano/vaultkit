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
