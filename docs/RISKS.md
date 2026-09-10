# RISKS — ranked

Scored as probability × impact on shipping a polished MVP. Reviewed at every phase boundary.

Legend — Probability: Low / Med / High. Impact: Low / Med / High / Critical.

---

## R-1 · Scope creep (P: High · I: Critical)

**The single largest risk in the project.** "Open world inspired by a real city" invites unbounded growth: more streets, more landmarks, more vehicles, more mission types, more NPC behaviour.

**Mitigation** — `PROJECT_SPEC.md` §3 non-goals are binding; the world is fixed at 1 km²; the MVP is enumerated in `MVP_ACCEPTANCE.md` and nothing is added to it; every phase names what it *postpones*; new ideas go to a post-MVP list, never into the current phase; `TASKS.md` is worked in order.
**Fallback** — Cut content, never quality: drop to two zones and one mission rather than shipping a large, rough world.

## R-2 · Token / context budget exhaustion (P: High · I: High)

Claude usage is finite. Re-deriving architecture, re-reading files, and rewrite loops can consume the budget before the game exists.

**Mitigation** — `docs/` as durable memory; `CLAUDE_WORKFLOW.md` §1 three-step session start; one task at a time with explicit acceptance criteria; the inspect→root-cause→minimal-change loop; stop-after-two-failed-fixes rule; short reports; no unrelated refactors.
**Fallback** — Reduce phase granularity (fewer, larger acceptance-tested milestones), and freeze documentation edits to only what changed.

## R-3 · Browser performance below 60 FPS (P: Med · I: High)

Draw calls, shadow cost, or simulation cost pushes the reference machine under budget, and open-world games degrade in ways that are hard to claw back late.

**Mitigation** — Budgets defined up front (`PERFORMANCE.md` §2); the debug overlay and benchmark route exist from Phase 1, so every phase is measured; merging and instancing are designed in, not retrofitted; tiered simulation with hard caps; CI perf gate on the deterministic metrics.
**Fallback** — The escalation ladder (`PERFORMANCE.md` §8); quality presets; shrink the detailed chunk radius; reduce NPC/traffic caps; adaptive resolution. Worst case, drop shadows entirely and lean on the stylized art direction.

## R-4 · Asset licensing failure (P: Med · I: Critical)

An asset with an unclear or incompatible licence ships, or a real-building model of dubious provenance is used. Legally and reputationally the worst possible outcome, and it can force a rebuild of the visual identity.

**Mitigation** — `ASSET_PLAN.md` §7–8: preference for procedural and original content; a mandatory credits row per file in the same commit; CI fails on an unregistered asset; explicit bans on unknown-licence, ripped, scanned, and map-derived content; the Palace is an original reinterpretation; a licence copy is committed for every OFL/CC-BY asset.
**Fallback** — Replace with procedural or CC0 equivalents; the asset-key indirection means gameplay code is unaffected by a swap.

## R-5 · Asset memory / VRAM and load time (P: Med · I: High)

Textures and models exceed the 256 MB / 15 MB budgets, causing long loads, jank, or crashes on integrated GPUs.

**Mitigation** — Atlas-first texturing with ≤6 resident textures; KTX2 with WebP fallback; tiered loading so the first playable moment does not wait on everything; measured `bytes` in the manifest and a CI size check; reference-counted disposal on chunk unload.
**Fallback** — Halve atlas resolution on the Low preset; move landmark LOD0 to tier 2; drop tier-2 audio.

## R-6 · Claude-generated code quality drift (P: Med · I: High)

Subtly wrong physics, leaked resources, duplicated systems, or plausible-looking code that fails under a case nobody tested.

**Mitigation** — `CODING_RULES.md` bans the specific failure patterns; strict TS; static checks for cycles, layering and manifest integrity; unit tests targeted at exactly the areas where silent breakage is expensive (`TESTING_STRATEGY.md` §4); the disposal-discipline rule with a leak check; small tasks with concrete acceptance criteria so wrongness surfaces immediately; collider/graph visualisation from Phase 1.
**Fallback** — Revert the squash commit and re-approach with a narrower task (`GITHUB_WORKFLOW.md` §5).

## R-7 · Collision / character-controller feel (P: Med · I: Med)

A custom collision system is the right call, but "stuck on a kerb", "jitter against a wall" and "fell through the world" are exactly where bespoke controllers fail, and they are highly visible.

**Mitigation** — Yaw-only OBBs to keep the math tractable; sub-stepped sweeps; a 4-iteration slide resolver; analytic ground floor clamp; the six explicit guards in `PLAYER_ARCHITECTURE.md` §9, each with a test; collider visualisation; feel tuning as its own acceptance-gated task.
**Fallback** — Adopt Rapier (documented trigger and contained swap path, `PLAYER_ARCHITECTURE.md` §1) accepting the ~1.2 MB cost.

## R-8 · Traffic and NPC simulation cost or believability (P: Med · I: Med)

Either it costs too much CPU, or it looks wrong (vehicles clipping through each other, pedestrians walking into traffic, gridlock at every junction).

**Mitigation** — Agents constrained to lanes and sidewalk polylines, which eliminates most failure modes structurally; IDM for plausible following; signal groups shared between traffic and pedestrians so they never contradict; conflict-slot reservation with a starvation guard; hard caps and tiered rates; lane-graph debug overlay.
**Fallback** — Lower densities (a quieter street still reads as a street); disable unsignalled-junction crossing traffic; make distant traffic purely visual.

## R-9 · Vehicle handling feel (P: Med · I: Med)

An arcade kinematic model can feel floaty or twitchy, and "the driving is bad" would undermine a driving-centred game.

**Mitigation** — All handling values in `data/vehicles.ts` for fast iteration; speed-dependent steering falloff; visual body spring for weight; feel tuning is its own acceptance task with a written checklist; the same model drives AI, so it gets exercised constantly.
**Fallback** — Add a simple lateral-slip/grip term or, at the extreme, a raycast-suspension model — both contained within `vehicles/`.

## R-10 · World size / streaming complexity (P: Low · I: High)

Streaming bugs (hitching at boundaries, popping, colliders not registered, leaks on unload) are hard to diagnose and player-visible.

**Mitigation** — Small, fixed 8×8 grid; hysteresis between load and unload radii; chunks become visible only when fully built; budgeted build queue; chunk boundary and collider overlays; deterministic seeding so a bug reproduces exactly; a prewarmed 3×3 behind the loading screen.
**Fallback** — At 1 km² the whole world *can* be loaded at once as an emergency measure (accepting a longer load), because the chunk contents are the same either way.

## R-11 · WebGL compatibility and context loss (P: Low · I: High)

A player's browser or driver cannot create a WebGL2 context, or loses it mid-session.

**Mitigation** — Explicit capability check with a clear message; single detection site; no exotic extensions required; KTX2 with a WebP fallback; context-loss/restore handling; CI smoke in Chromium and Firefox; no custom GLSL beyond a trivial sky gradient.
**Fallback** — Documented minimum browsers and a plain-language help panel; Safari treated as best-effort.

## R-12 · Save-data corruption or content-version drift (P: Low · I: Med)

A schema change or a world edit strands existing saves, or a hand-edited save crashes the game.

**Mitigation** — Versioned saves with a tested migration chain and committed fixtures; `worldSeed`/`worldDataVersion` checks; full validation of untrusted input; quarantine-never-delete; mission self-invalidation when anchors disappear; settings stored separately from the save.
**Fallback** — Reset with a clear notice; the quarantined copy remains for diagnosis.

## R-13 · Audio autoplay and mixing (P: Low · I: Low)

Audio blocked until a gesture, or an unbalanced/annoying mix (honking).

**Mitigation** — Suspended context + resume on gesture + "click to enable sound" notice + silent-mode degradation; per-bus volume sliders; global one-shot rate limiting; a mix-balance item on the manual acceptance checklist.
**Fallback** — Ship with ambience quieter by default; honking rate is a data value.

## R-14 · Static-hosting and path pitfalls (P: Low · I: Med)

The game works locally and 404s on GitHub Pages because of a root-absolute path or a case-sensitivity mismatch.

**Mitigation** — Single URL helper using `BASE_URL`; a static check that fails on absolute asset paths; lowercase `snake_case` filenames; the deploy workflow runs the full gate and a post-deploy manual load check; `DEPLOY_BASE` env override.
**Fallback** — Cloudflare Pages (serves at `/`), a workflow-only change.

## R-15 · Solo/agent bandwidth on art (P: Med · I: Med)

The stylized-realism target still needs a modular kit, a character, a vehicle and a Palace — the most human-effort-intensive part of the project, and the hardest for an agent to produce.

**Mitigation** — Phase A primitives make the game *playable and testable* before any art exists; the kit is deliberately ≤30 meshes; CC0 kit sourcing is an accepted path; the asset-key indirection makes art land incrementally with no code change; the Palace is the only bespoke hero asset in the MVP.
**Fallback** — Ship the MVP in a consistent stylized-primitive look (which can itself be attractive if lighting and colour are good) and treat the authored kit as a post-MVP visual upgrade.

---

## Watchlist (tracked, not yet risks)

Bundle growth from casual Three.js imports · shader compile hitches on first material use (mitigated by warming during load) · Kannada font subset size and shaping correctness · headless CI perf noise producing flaky gates · GitHub Actions free-tier minute usage on a public repo (effectively unlimited today).
