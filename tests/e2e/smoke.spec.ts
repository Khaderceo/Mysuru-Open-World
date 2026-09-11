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

test('boots cleanly, renders, and exposes the e2e hook', async ({ page }, testInfo) => {
  const collected = collect(page);
  // `testworld=1` builds T-2.4's grey-box content: it replaced T-1.5a's test box, so it
  // is what the "did the renderer draw" assertion below now looks at.
  await page.goto('?e2e=1&testworld=1');

  // 1. The loading screen is static markup, so it is always in the DOM; it must go away.
  const boot = page.locator('#boot');
  await expect(boot).toBeAttached();
  await expect(boot).toBeHidden({ timeout: 20_000 });

  // The fatal handler also hides the loading screen, so the assertion above passes on a
  // failed boot too. Everything needed to explain such a boot is gathered here, before
  // any assertion that could mask it, and attached so CI keeps it.
  const fatal = page.locator('#fatal');
  const diagnostics = [
    `pageErrors: ${collected.pageErrors.join(' | ') || 'none'}`,
    `consoleErrors: ${collected.consoleErrors.join(' | ') || 'none'}`,
    `failedRequests: ${collected.failedRequests.join(' | ') || 'none'}`,
    `fatalPanel: ${((await fatal.count()) > 0 ? await fatal.innerText() : 'absent').replace(/\s+/g, ' ')}`,
    `bootStatus: ${(await page.locator('#boot-status').textContent()) ?? ''}`,
    // Decisive for telling an environment without WebGL2 apart from an application fault.
    `webgl2Available: ${String(
      await page.evaluate(() => document.createElement('canvas').getContext('webgl2') !== null),
    )}`,
    `consoleAll: ${collected.allMessages.slice(0, 12).join(' | ') || 'none'}`,
  ].join('\n');
  await testInfo.attach('boot-diagnostics', { body: diagnostics, contentType: 'text/plain' });

  // Ordered so the cause reports itself: a crash, then a fatal panel, before the hook.
  expect(collected.pageErrors, diagnostics).toEqual([]);
  expect(collected.consoleErrors, diagnostics).toEqual([]);
  await expect(fatal, diagnostics).toHaveCount(0);

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
  expect(snapshot, `the ?e2e=1 hook should exist in the e2e build\n${diagnostics}`).not.toBeNull();
  expect(snapshot?.width).toBeGreaterThan(0);
  expect(snapshot?.height).toBeGreaterThan(0);
  expect(snapshot?.calls).toBeGreaterThan(0);
  expect(snapshot?.running).toBe(true);

  // 9. No context loss and no shader compile failures.
  expect(collected.allMessages.filter((m) => /context lost/i.test(m))).toEqual([]);
  expect(collected.allMessages.filter((m) => /WebGLProgram/i.test(m))).toEqual([]);
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
