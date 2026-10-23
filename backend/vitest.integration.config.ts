import { defineConfig } from 'vitest/config';

/** Integration tests on real PostgreSQL/Redis; files share one database, so they run serially. */
export default defineConfig({
  test: {
    include: ['test/**/*.spec.ts'],
    environment: 'node',
    setupFiles: ['test/setup/env.ts', 'test/setup/ts-node.ts'],
    globalSetup: ['test/setup/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
