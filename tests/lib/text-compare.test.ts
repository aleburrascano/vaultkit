import { describe, it, expect } from 'vitest';
import { plainTextFromMarkdown, similarity, compareSource } from '../../src/lib/text-compare.js';

describe('plainTextFromMarkdown', () => {
  it('strips YAML frontmatter', () => {
    const md = '---\ntitle: Hi\nsource: x\n---\nContent here';
    expect(plainTextFromMarkdown(md)).toBe('Content here');
  });

  it('strips heading markers but keeps text', () => {
    expect(plainTextFromMarkdown('# Hello\n\nWorld')).toBe('Hello World');
    expect(plainTextFromMarkdown('### Sub\n\nbody')).toBe('Sub body');
  });

  it('strips bold and italic', () => {
    expect(plainTextFromMarkdown('**bold** and *italic* and __strong__')).toBe('bold and italic and strong');
  });

  it('strips inline code', () => {
    expect(plainTextFromMarkdown('Run `npm test` now')).toBe('Run npm test now');
  });

  it('strips code fences entirely', () => {
    expect(plainTextFromMarkdown('Before\n```js\nconst x = 1;\n```\nAfter')).toBe('Before After');
  });

  it('reduces links to anchor text', () => {
    expect(plainTextFromMarkdown('See [docs](https://x.com)')).toBe('See docs');
  });

  it('strips images entirely', () => {
    expect(plainTextFromMarkdown('![alt](x.png) text')).toBe('text');
  });

  it('strips bullet markers', () => {
    expect(plainTextFromMarkdown('- one\n- two\n* three')).toBe('one two three');
  });

  it('strips ordered list markers', () => {
    expect(plainTextFromMarkdown('1. first\n2. second')).toBe('first second');
  });

  it('strips blockquote markers', () => {
    expect(plainTextFromMarkdown('> quoted text\n> more')).toBe('quoted text more');
  });

  it('collapses repeated whitespace', () => {
    expect(plainTextFromMarkdown('a\n\n\nb   c')).toBe('a b c');
  });
});

describe('similarity', () => {
  it('returns 1 for identical strings', () => {
    expect(similarity('hello world', 'hello world')).toBe(1);
  });

  it('returns 1 when both inputs are empty', () => {
    expect(similarity('', '')).toBe(1);
  });

  it('returns 0 when one input is empty', () => {
    expect(similarity('', 'something')).toBe(0);
    expect(similarity('something', '')).toBe(0);
  });

  it('is case-insensitive', () => {
    expect(similarity('Hello World', 'hello world')).toBe(1);
  });

  it('returns intermediate score for half-overlapping word sets', () => {
    const score = similarity('a b c d', 'c d e f');
    expect(score).toBeGreaterThan(0.2);
    expect(score).toBeLessThan(0.5);
  });

  it('high score for nearly-identical text with one extra word', () => {
    const score = similarity('the quick brown fox', 'the quick brown fox jumps');
    expect(score).toBeGreaterThan(0.7);
  });

  it('low score for entirely disjoint text', () => {
    const score = similarity('apple banana cherry', 'one two three');
    expect(score).toBe(0);
  });
});

describe('compareSource SSRF allowlist', () => {
  // compareSource is the network surface for `vaultkit refresh`. Frontmatter
  // URLs in raw/<file>.md drive the fetch, so a malicious vault could attempt
  // SSRF or LFI via crafted URLs. The allowlist rejects non-http(s) protocols
  // and internal/private IP ranges before any fetch happens.

  async function expectRejected(url: string, pattern: RegExp): Promise<void> {
    const result = await compareSource(url, 'local body');
    expect(result.kind).toBe('unfetchable');
    if (result.kind === 'unfetchable') {
      expect(result.reason).toMatch(pattern);
    }
  }

  it('rejects non-http(s) protocols (file://, data:, javascript:)', async () => {
    await expectRejected('file:///etc/passwd', /protocol/i);
    await expectRejected('data:text/html,<script>alert(1)</script>', /protocol/i);
    await expectRejected('javascript:alert(1)', /protocol/i);
    await expectRejected('ftp://example.com/file', /protocol/i);
  });

  it('rejects loopback IPv4 (127.0.0.0/8)', async () => {
    await expectRejected('http://127.0.0.1/', /internal|loopback|private/i);
    await expectRejected('http://127.255.255.255/admin', /internal|loopback|private/i);
  });

  it('rejects link-local IPv4 (169.254.0.0/16) — AWS IMDS surface', async () => {
    await expectRejected('http://169.254.169.254/latest/meta-data/', /internal|link-local|private/i);
  });

  it('rejects RFC 1918 private IPv4 ranges', async () => {
    await expectRejected('http://10.0.0.1/', /internal|private/i);
    await expectRejected('http://192.168.1.1/', /internal|private/i);
    await expectRejected('http://172.16.0.1/', /internal|private/i);
    await expectRejected('http://172.31.255.255/', /internal|private/i);
  });

  it('allows IPs just outside the 172.16-31 private range', async () => {
    // 172.32.0.1 is OUTSIDE RFC 1918 — should NOT be rejected by the allowlist
    // (the actual fetch will fail because it's not routable from the test env,
    // but the rejection reason should be a network error, not "private IPv4")
    const result = await compareSource('http://172.32.0.1/', 'local body');
    expect(result.kind).toBe('unfetchable');
    if (result.kind === 'unfetchable') {
      expect(result.reason).not.toMatch(/private|internal/i);
    }
  });

  it('rejects localhost and 0.0.0.0 by hostname', async () => {
    await expectRejected('http://localhost/', /internal|localhost/i);
    await expectRejected('http://0.0.0.0/', /internal|0\.0\.0\.0/i);
  });

  it('rejects IPv6 loopback and link-local', async () => {
    await expectRejected('http://[::1]/', /internal|loopback|IPv6/i);
    await expectRejected('http://[fe80::1]/', /internal|link-local|IPv6/i);
  });

  it('rejects IPv6 unique local addresses (fc00::/7)', async () => {
    await expectRejected('http://[fc00::1]/', /internal|ULA|IPv6/i);
    await expectRejected('http://[fd12:3456:789a::1]/', /internal|ULA|IPv6/i);
  });

  it('rejects malformed URLs', async () => {
    const result = await compareSource('not a url', 'local body');
    expect(result.kind).toBe('unfetchable');
  });
});
