# DEPLOYMENT — static hosting

---

## 1. Recommendation

**Primary: GitHub Pages, deployed by GitHub Actions from `main`.** ADR-008.

| Option | Cost | Fit | Verdict |
|---|---|---|---|
| **GitHub Pages** | Free for public repos, unlimited bandwidth in practice (soft 100 GB/month), 1 GB site limit | Already where the source of truth lives; zero new accounts, zero new credentials, deploys with the same Actions workflow that runs CI; custom domain + HTTPS free | **Chosen.** Nothing else adds value for this project. |
| Cloudflare Pages | Free tier, 500 builds/month, better global CDN + Brotli, easy preview URLs | Requires a Cloudflare account and a repo authorization | **Documented fallback.** Swap is a workflow file; the build output is identical. |
| Netlify / Vercel free tiers | Free with limits | Extra account, more aggressive free-tier changes historically | Not needed |
| Self-hosted / VPS | Paid, always-on | Violates the cost model (`PROJECT_SPEC.md` §4) | Rejected |
| itch.io (as a mirror) | Free | Nice distribution surface post-release; not the build target | Optional later |

The site is 100 % static: HTML, JS, CSS, GLB, KTX2/WebP, OGG/M4A, WOFF2. No server, no API, no database, no secrets.

## 2. Build configuration for subpath hosting

GitHub Pages serves a project site at `https://<user>.github.io/<repo>/`, so paths must not be root-absolute.

```ts
// vite.config.ts (essentials)
base: process.env.DEPLOY_BASE ?? '/Mysuru-Open-World/',
build: {
  target: 'es2020',
  sourcemap: true,                       // small, and makes production bug reports actionable
  rollupOptions: { output: { manualChunks: { three: ['three'] } } },
  assetsInlineLimit: 0,                  // keep asset URLs stable and cacheable
},
define: { __DEV__: JSON.stringify(false), __E2E__: JSON.stringify(false) },
```

- All runtime asset URLs are built from `import.meta.env.BASE_URL + manifestPath` in exactly one helper (`assets/url.ts`). A static check fails on any root-absolute asset path (`TESTING_STRATEGY.md` §3).
- `base` is overridable via `DEPLOY_BASE` so a Cloudflare Pages deploy (which serves at `/`) needs only an env var, not a code change.
- `three` is a separate chunk so it stays in the browser cache across game updates.

## 3. Workflows

```
.github/workflows/ci.yml       on: push, pull_request     → npm ci; npm run check
.github/workflows/deploy.yml   on: push to main (+ manual) → npm ci; npm run check; build; upload-pages-artifact; deploy-pages
```

- Deploy runs the **full gate** first; a red gate never publishes.
- Uses the official `actions/configure-pages`, `actions/upload-pages-artifact`, `actions/deploy-pages` with `permissions: { pages: write, id-token: write }` — no personal access token, no stored secret.
- `concurrency: { group: 'pages', cancel-in-progress: true }` so rapid pushes do not race.
- Node version pinned in the workflow and in `package.json` `engines`.
- No `gh-pages` branch and no committed `dist/` — the artifact-based flow keeps build output out of git history.

## 4. Caching and cache-busting

- Vite content-hashes JS/CSS filenames → safe to cache immutably; GitHub Pages sets sensible defaults and `index.html` is revalidated.
- **Asset files (GLB/KTX2/audio) are not hashed by Vite** because they live in `public/`. Policy: when a `public/` asset changes incompatibly, its filename gets a version suffix (`kit_building_v2.glb`) and the manifest is updated. This avoids stale-cache bugs without a service worker.
- **No service worker in the MVP.** It adds a whole class of "users stuck on an old build" bugs for offline support nobody asked for. Documented as a post-release option if offline play becomes a goal.

## 5. Release process

1. Merge feature work into `main` (gate green) — `GITHUB_WORKFLOW.md`.
2. Deploy runs automatically; verify the live URL loads and the smoke path works (2-minute manual pass).
3. For a milestone release: tag `vX.Y.Z`, write release notes listing what changed, the manual acceptance checklist result, known issues, and the browser matrix pass.
4. `README.md` links the live URL, the controls, the browser requirements and the credits.

## 6. Rollback

- **Fast path:** re-run the `deploy` workflow from the last known-good commit (Actions → Run workflow → choose ref). Live in ~2 minutes, no git history rewrite.
- **Code path:** `git revert` the offending commit on `main` (never force-push `main`), which triggers a fresh deploy.
- Every milestone is tagged, so a known-good ref always exists (`GITHUB_WORKFLOW.md` §Rollback).

## 7. Domain, privacy, security

- Default `github.io` URL; a custom domain is optional (CNAME file + DNS), free, and adds nothing functionally.
- HTTPS enforced (Pages default). Mixed content is impossible since the game makes **no external requests at all** after load — no CDN, no fonts from Google, no analytics, no telemetry. Fonts, models and audio are all self-hosted.
- **No secrets in the repository or the build.** There is nothing to leak: no keys, no tokens, no endpoints. A CI secret scan enforces this (`TESTING_STRATEGY.md` §3).
- A `Content-Security-Policy` meta tag is set as defence-in-depth (`default-src 'self'`; `img-src 'self' data:`; no `unsafe-eval`). Confirmed compatible with Vite's production output (dev mode is exempt).
- No cookies, no tracking, no personal data collected or stored. Saves are local to the player's browser. The README states this plainly.

## 8. Size limits to respect

GitHub Pages: 1 GB per site, 100 GB/month soft bandwidth, 10 builds/hour. Our target is ~15 MB per deploy (`PERFORMANCE.md` §2) — three orders of magnitude inside the site limit, and the bandwidth ceiling would take ~6,500 full first-loads per month to approach. Not a constraint at any realistic scale for this project.
