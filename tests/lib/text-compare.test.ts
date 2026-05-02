import { describe, it, expect } from 'vitest';
import { plainTextFromMarkdown, similarity } from '../../src/lib/text-compare.js';

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
