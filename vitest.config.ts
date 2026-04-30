import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.{js,ts}'],
    environment: 'node',
    testTimeout: 15000,
    hookTimeout: 60_000,
    // Live tests write to ~/.claude.json — run files sequentially to avoid races
    fileParallelism: !process.env.VAULTKIT_LIVE_TEST,
  },
});
