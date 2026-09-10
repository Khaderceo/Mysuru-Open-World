// Frozen runtime configuration: the bundled build flags plus URL query overrides,
// which WEB_ARCHITECTURE.md section 10 assigns to config because static hosting has
// no runtime config endpoint.
//
// Tuning values do NOT belong here — they live in data/balance.ts (T-2.5).

export interface Config {
  /** True in the dev server build. Mirrors the __DEV__ define. */
  readonly dev: boolean;
  /** True only in the build:e2e build. Mirrors the __E2E__ define. */
  readonly e2e: boolean;
  /** Raw URL query parameters, e.g. `?bench=1`. Consumers interpret their own keys. */
  readonly flags: Readonly<Record<string, string>>;
}

/** `search` is passed in rather than read from `location` so this stays testable. */
export function createConfig(search: string): Config {
  const flags: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(search)) {
    flags[key] = value;
  }
  return Object.freeze({
    dev: __DEV__,
    e2e: __E2E__,
    flags: Object.freeze(flags),
  });
}
