import { existsSync } from 'node:fs';
import { chromium, defineConfig, devices } from '@playwright/test';

// SwiftShader gives Chromium a real WebGL2 context on runners with no GPU
// (TESTING_STRATEGY.md §5); Firefox needs prefs instead — see FIREFOX_WEBGL_PREFS.
const WEBGL_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'];

/**
 * This container ships one Chromium build that need not match the pinned Playwright
 * version, and browser downloads are disabled in it. CI installs the matching build, so
 * the default executable is used there and this returns nothing.
 */
function containerChromium(): { executablePath?: string } {
  if (existsSync(chromium.executablePath())) return {};
  const fallback = '/opt/pw-browsers/chromium';
  return existsSync(fallback) ? { executablePath: fallback } : {};
}

// Firefox has no SwiftShader switch: on a GPU-less runner it blocklists WebGL and
// `getContext('webgl2')` returns null, so these prefs are the engine's equivalent of
// WEBGL_ARGS — force WebGL on past the blocklist and render it in software.
const FIREFOX_WEBGL_PREFS = {
  'webgl.force-enabled': true,
  'webgl.disabled': false,
  'gfx.webrender.software': true,
};

/**
 * Firefox is part of the documented matrix but is not present in every environment, and
 * downloads are disabled here. It is included only when its browser is actually
 * installed, so the gate is honest locally and covers both engines in CI.
 */
function firefoxProjects(): { name: string; use: Record<string, unknown> }[] {
  const root = process.env['PLAYWRIGHT_BROWSERS_PATH'];
  const installed =
    root === undefined || existsSync(`${root}/firefox`) || existsSync(`${root}/firefox-1`);
  return installed
    ? [
        {
          name: 'firefox',
          use: {
            ...devices['Desktop Firefox'],
            // Headless Firefox has no window for its GL providers to bind to, so WebGL
            // creation fails however the prefs are set. CI runs the gate under Xvfb and
            // therefore runs Firefox headed; locally it stays headless.
            headless: process.env['CI'] === undefined,
            launchOptions: { firefoxUserPrefs: FIREFOX_WEBGL_PREFS },
          },
        },
      ]
    : [];
}

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env['CI']),
  retries: 0,
  reporter:
    process.env['CI'] === undefined
      ? [['list']]
      : // `html` is what actually writes playwright-report/, which ci.yml uploads on
        // failure; without it that step finds no files.
        [['github'], ['list'], ['html', { open: 'never' }]],
  use: {
    // The e2e build is what is served: production config with __E2E__ true, nothing else.
    baseURL: 'http://127.0.0.1:4173/Mysuru-Open-World/',
    trace: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: { args: WEBGL_ARGS, ...containerChromium() },
      },
    },
    ...firefoxProjects(),
  ],
  webServer: {
    // `--host 127.0.0.1` is load-bearing: vite preview otherwise binds whatever
    // `localhost` resolves to first, which is IPv6 on GitHub runners while Playwright
    // polls IPv4 — the server then never appears and the run times out.
    command: 'npm run build:e2e && npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173/Mysuru-Open-World/',
    // Never reuse: the command rebuilds, and reusing a live server silently serves a
    // stale build, which would let the gate pass against output nobody just produced.
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
