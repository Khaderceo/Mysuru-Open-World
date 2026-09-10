import { defineConfig } from 'vitest/config';

// Needed from T-1.9 onward: vitest's default `include` also matches `tests/e2e/*.spec.ts`,
// which are Playwright specs and cannot run under vitest. Nothing else is configured.
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
  },
  // This file replaces vite.config.ts for test runs, so the build-flag defines have to be
  // restated here or code guarded by them throws ReferenceError under vitest. Unit tests
  // run with the dev flag set, matching the behaviour they had before this config existed.
  define: {
    __DEV__: JSON.stringify(true),
    __E2E__: JSON.stringify(false),
  },
});
