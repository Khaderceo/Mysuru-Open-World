# PROJECT_SPEC — Mysuru Open World

**Status:** Planning (Phase 0) · **Last updated:** 2026-09-10 · **Authority:** This file plus `DECISIONS.md` are the top-level source of truth. Where any other document conflicts with these two, these two win.

---

## 1. What this is

A **small but polished 3D open-world game inspired by Mysuru (Mysore), Karnataka, India**, that runs entirely in a modern desktop web browser.

The design target is a compact, hand-authored district that *feels* like Mysuru — not a reproduction of the city. Roughly 1 km² of walkable/drivable world with one hero landmark, one market area, believable Indian street furniture and traffic, a driveable vehicle, pedestrians, a working mission, money, save/load, and a day/night cycle.

**Quality bar:** small but polished. Strong atmosphere, good controls, smooth camera, believable scale, stable frame rate, cohesive visual style. Not AAA, not photorealistic, not enormous.

## 2. Platform

| | |
|---|---|
| **Target** | Web browser only (WebGL2) |
| **Primary** | Desktop Chrome / Edge / Firefox at 1080p |
| **Secondary** | Any modern WebGL2 browser at common desktop window sizes; responsive canvas, high-DPI aware |
| **Explicitly out of scope** | Native Windows, Android, iOS, consoles, Electron/Tauri wrappers, mobile touch controls (unless separately approved) |

No native builds, no app stores, no installers. See `BROWSER_COMPATIBILITY.md`.

## 3. Non-goals (hard boundaries)

These are *decided*, not open questions. Re-opening any of them requires an explicit change to `DECISIONS.md`.

- **No game engine editor.** No Unity, Unreal, Godot — in any form, including CLI, MCP servers, or plugins. This project has no Unity history to honour; earlier Unity planning is void.
- **No UI framework.** No React, React Three Fiber, Vue, Svelte, Solid.
- **No alternate renderer.** No Babylon.js, PlayCanvas, A-Frame.
- **No ECS framework**, no state-management library, no dependency-injection container.
- **No backend.** No server, no database, no auth, no multiplayer, no analytics service, no paid API.
- **No secrets.** The build must contain no keys or tokens of any kind.
- **No live map service** (Google Maps or equivalent) as a runtime dependency. See `WORLD_DESIGN.md` §"Map data & legality".
- **No full-city recreation.** Compact, curated world only.
- **No photorealism.**

## 4. Cost model

The project must remain **free or negligible cost**, permanently.

Allowed: open-source libraries with permissive licences, procedural generation, primitive/simple geometry, free assets with compatible licences, static hosting on a free tier, GitHub, browser APIs, `localStorage`.

Disallowed: paid APIs, paid hosting, paid assets, subscriptions, always-on infrastructure, anything requiring a credit card.

The MVP must be deployable as a **fully static site**. See `DEPLOYMENT.md`.

## 5. Development environment

```
Claude Code Web  →  GitHub repository  →  static build  →  browser
```

- **Claude Code Web** is the only development environment. No local machine setup is required or assumed.
- **GitHub** is the permanent source of truth for code, docs, and history.
- Repository documentation *is* the project memory. Future sessions read `docs/`, not a re-pasted specification.

See `CLAUDE_WORKFLOW.md` and `GITHUB_WORKFLOW.md`.

## 6. Token-efficiency contract

Claude usage is a limited, real resource. It is treated as a first-class engineering constraint.

1. Architecture is discovered **once** and written down here in `docs/`. Never re-derived.
2. Tasks live in `TASKS.md` with acceptance criteria. Work one task at a time.
3. Reference documents by name; do not restate their contents.
4. Read only the files a task actually touches. Do not scan the tree.
5. Do not rewrite working systems. Do not create a second implementation of anything.
6. No dependency is added without an approved entry in `DECISIONS.md`.
7. No speculative features, no "while I'm here" refactors.
8. Loop discipline: **inspect → root cause → minimal change → validate → commit**. Never *guess → error → rewrite → error → rewrite*.
9. Stop when the task's acceptance criteria pass. Report what changed, in what files, and nothing else.

## 7. Scope summary

**MVP (Phases 1–10, gated by `MVP_ACCEPTANCE.md`)**
Browser boot · 3D world ≈1 km² · third-person player (walk/run/jump/collide) · follow camera · Mysuru-inspired road network with buildings, shops, market, street furniture and vegetation · one recognizable hero landmark (Mysore Palace silhouette) · basic pedestrians · one drivable vehicle (auto-rickshaw) with enter/exit · basic traffic · one complete mission with a money reward · minimap · save/load · day/night · basic audio · stable 60 FPS on a mid-range desktop.

**Post-MVP (roadmap, not committed)**
Chamundi Hill approach, additional vehicles (car, bus), weather, more mission types, Kannada localization pass, richer NPC behaviour, world expansion toward ≤4 km².

**Never (this project)**
Multiplayer, large crowds, photorealism, vehicle-fleet variety at simulation scale, advanced AI, backend services.

## 8. Document map

| Concern | Document |
|---|---|
| This spec, non-goals, constraints | `PROJECT_SPEC.md` |
| Player experience, loop, tone | `GAME_DESIGN.md` |
| Stack choice and dependency policy | `TECH_STACK.md` |
| Module boundaries, runtime shape | `ARCHITECTURE.md` |
| Game loop, scheduling, browser lifecycle | `WEB_ARCHITECTURE.md` |
| World size, chunks, streaming, terrain | `WORLD_DESIGN.md` |
| Roads, lanes, city blocks, procedural fill | `CITY_SYSTEM.md` |
| Player controller, collision | `PLAYER_ARCHITECTURE.md` |
| Camera | `CAMERA_ARCHITECTURE.md` |
| Vehicles | `VEHICLE_ARCHITECTURE.md` |
| Pedestrians | `NPC_ARCHITECTURE.md` |
| AI traffic | `TRAFFIC_ARCHITECTURE.md` |
| Missions, objectives, economy | `MISSION_ARCHITECTURE.md` |
| Interaction system | `INTERACTION_ARCHITECTURE.md` |
| HUD, menus, minimap | `UI_ARCHITECTURE.md` |
| Persistence | `SAVE_SYSTEM.md` |
| Audio | `AUDIO_PLAN.md` |
| English/Kannada text | `LOCALIZATION_PLAN.md` |
| Assets, licensing, pipeline | `ASSET_PLAN.md` |
| Budgets and optimization order | `PERFORMANCE.md` |
| Checks and gates | `TESTING_STRATEGY.md` |
| Supported browsers | `BROWSER_COMPATIBILITY.md` |
| Hosting and release | `DEPLOYMENT.md` |
| How Claude works in this repo | `CLAUDE_WORKFLOW.md` |
| Branches, commits, rollback | `GITHUB_WORKFLOW.md` |
| Code standards | `CODING_RULES.md` |
| Ranked risks | `RISKS.md` |
| MVP definition of done | `MVP_ACCEPTANCE.md` |
| Decision log (ADRs) | `DECISIONS.md` |
| Phases and milestones | `ROADMAP.md` |
| Ordered implementation tasks | `TASKS.md` |
