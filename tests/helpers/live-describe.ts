import { describe } from 'vitest';

/**
 * `describe` that skips on Windows so live tests run only on Ubuntu in CI.
 *
 * Why: live tests hit GitHub's REST API (create + delete real `vk-live-*`
 * repos), and running the same suite on both Ubuntu and Windows doubles
 * the burst footprint without adding coverage — the gh CLI behaves
 * identically on both platforms, and OS-specific concerns (path
 * separators, `findTool` resolution, launcher SHA-256) are exercised by
 * the much larger mocked + lib test surface, which still runs on both
 * matrix legs.
 *
 * Trade-off: a regression that surfaces *only* on Windows in a real-gh
 * code path would slip past CI. We accept that trade-off because the
 * gh-on-Windows surface inside vaultkit is tiny (we shell out to gh.exe
 * with the same argv we use elsewhere) and the rate-limit cost of
 * running live tests on both legs is what tripped the v2.7.0 release.
 *
 * See docs/roadmap.md and CHANGELOG.md 2.7.1 entry for context.
 */
export const liveDescribe = process.platform === 'win32' ? describe.skip : describe;
