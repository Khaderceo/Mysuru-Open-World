import { expect, test, type ConsoleMessage, type Page } from '@playwright/test';

// TESTING_STRATEGY.md §5. Phase 1 implements steps 1-3 and 9; the player, vehicle,
// mission and save steps land with their milestones, and step 8 (a 404'd optional asset
// producing a notice) needs the asset system, which is T-2.8.

/**
 * Messages the headless WebGL stack emits on runners without a GPU. Reviewed whenever
 * this list changes — everything else is a failure.
 */
const BENIGN_CONSOLE = [
  /automatic fallback to software webgl/i,
  /swiftshader/i,
  /GroupMarkerNotSet/i,
  /GPU stall due to ReadPixels/i,
];

interface Collected {
  readonly consoleErrors: string[];
  readonly pageErrors: string[];
  readonly allMessages: string[];
  /** URLs the browser could not load, so a console 404 names the resource. */
  readonly failedRequests: string[];
}

function collect(page: Page): Collected {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const allMessages: string[] = [];
  page.on('console', (message: ConsoleMessage) => {
    const text = message.text();
    allMessages.push(text);
    if (message.type() !== 'error') return;
    if (BENIGN_CONSOLE.some((pattern) => pattern.test(text))) return;
    consoleErrors.push(text);
  });
  // Playwright reports uncaught exceptions and unhandled rejections here.
  page.on('pageerror', (error: Error) => pageErrors.push(error.message));
  const failedRequests: string[] = [];
  page.on('response', (response) => {
    if (response.status() >= 400)
      failedRequests.push(`${String(response.status())} ${response.url()}`);
  });
  page.on('requestfailed', (request) => {
    failedRequests.push(`failed ${request.url()} (${request.failure()?.errorText ?? 'unknown'})`);
  });
  return { consoleErrors, pageErrors, allMessages, failedRequests };
}

test('boots cleanly, renders, and exposes the e2e hook', async ({ page }) => {
  const collected = collect(page);
  await page.goto('?e2e=1');

  // 1. The loading screen is static markup, so it is always in the DOM; it must go away.
  const boot = page.locator('#boot');
  await expect(boot).toBeAttached();
  await expect(boot).toBeHidden({ timeout: 20_000 });

  // 3. Canvas has real size and the renderer actually drew something.
  const snapshot = await page.evaluate(() => {
    const hook = (
      window as unknown as {
        __mow?: {
          canvas: { width: number; height: number };
          render: { calls: number };
          running: boolean;
        };
      }
    ).__mow;
    return hook === undefined
      ? null
      : { ...hook.canvas, calls: hook.render.calls, running: hook.running };
  });
  expect(snapshot, 'the ?e2e=1 hook should exist in the e2e build').not.toBeNull();
  expect(snapshot?.width).toBeGreaterThan(0);
  expect(snapshot?.height).toBeGreaterThan(0);
  expect(snapshot?.calls).toBeGreaterThan(0);
  expect(snapshot?.running).toBe(true);

  // 9. No context loss and no shader compile failures.
  expect(collected.allMessages.filter((m) => /context lost/i.test(m))).toEqual([]);
  expect(collected.allMessages.filter((m) => /WebGLProgram/i.test(m))).toEqual([]);

  // The fatal panel must not have appeared on a healthy boot.
  await expect(page.locator('#fatal')).toHaveCount(0);

  // 2. Asserted last so the earlier failures report first, which is more diagnosable.
  expect(
    collected.consoleErrors,
    `failed requests: ${collected.failedRequests.join(' | ')}`,
  ).toEqual([]);
  expect(collected.pageErrors).toEqual([]);
});

test('without WebGL2 it shows the compatibility panel instead of a blank page', async ({
  page,
}) => {
  // BROWSER_COMPATIBILITY.md §7 requires this to be verified by forcing the context null.
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function patched(
      this: HTMLCanvasElement,
      type: string,
      ...rest: unknown[]
    ) {
      if (type === 'webgl2' || type === 'webgl') return null;
      return (original as (...args: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof HTMLCanvasElement.prototype.getContext;
  });

  await page.goto('');

  const panel = page.locator('#fatal');
  await expect(panel).toBeVisible({ timeout: 20_000 });
  await expect(panel).toContainText('WebGL2');
  await expect(panel.locator('button')).toHaveText('Reload');
  await expect(panel.locator('small')).toHaveText('capability.webgl2');
  // The loading screen must be gone, not left spinning behind the panel.
  await expect(page.locator('#boot')).toBeHidden();
});
