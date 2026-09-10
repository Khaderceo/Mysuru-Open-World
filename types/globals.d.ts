// The single ambient-declaration file permitted by CODING_RULES.md section 1.
// Nothing else in the project may declare globals.

/** True in the dev server build; false in any production build. Gates `debug/` so it is dead-code-eliminated. */
declare const __DEV__: boolean;

/** True only in the `build:e2e` build, which exposes the read-only test hook. False in the deployed build. */
declare const __E2E__: boolean;

/**
 * Minimal `process.env` shape used by vite.config.ts for the DEPLOY_BASE override
 * (DEPLOYMENT.md section 2). Declared here rather than installing `@types/node`,
 * which is not in the approved dependency set (DECISIONS.md ADR-013).
 */
declare const process: { readonly env: Readonly<Record<string, string | undefined>> };
