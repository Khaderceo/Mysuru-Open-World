# Mysuru Open World

A small but polished 3D open-world game inspired by Mysuru (Mysore), Karnataka, India — running entirely in a modern web browser.

**Status: Phase 0 — planning complete, awaiting architecture approval. No implementation has begun.**

Stack: **Three.js + TypeScript + Vite**, WebGL2, static hosting. One runtime dependency (`three`). No engine, no framework, no backend, no paid services.

---

## Start here

| If you are… | Read |
|---|---|
| New to the project | [`docs/PROJECT_SPEC.md`](docs/PROJECT_SPEC.md) then [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| About to write code | [`docs/CLAUDE_WORKFLOW.md`](docs/CLAUDE_WORKFLOW.md) → [`docs/TASKS.md`](docs/TASKS.md) → the one architecture doc your task names |
| Reviewing decisions | [`docs/DECISIONS.md`](docs/DECISIONS.md) |
| Checking what "done" means | [`docs/MVP_ACCEPTANCE.md`](docs/MVP_ACCEPTANCE.md) |

`docs/` is the project's persistent memory. Read it instead of re-deriving the architecture.

## Documents

**Foundation** — [PROJECT_SPEC](docs/PROJECT_SPEC.md) · [GAME_DESIGN](docs/GAME_DESIGN.md) · [TECH_STACK](docs/TECH_STACK.md) · [ARCHITECTURE](docs/ARCHITECTURE.md) · [WEB_ARCHITECTURE](docs/WEB_ARCHITECTURE.md)

**World** — [WORLD_DESIGN](docs/WORLD_DESIGN.md) · [CITY_SYSTEM](docs/CITY_SYSTEM.md) · [ASSET_PLAN](docs/ASSET_PLAN.md)

**Systems** — [PLAYER_ARCHITECTURE](docs/PLAYER_ARCHITECTURE.md) · [CAMERA_ARCHITECTURE](docs/CAMERA_ARCHITECTURE.md) · [VEHICLE_ARCHITECTURE](docs/VEHICLE_ARCHITECTURE.md) · [NPC_ARCHITECTURE](docs/NPC_ARCHITECTURE.md) · [TRAFFIC_ARCHITECTURE](docs/TRAFFIC_ARCHITECTURE.md) · [MISSION_ARCHITECTURE](docs/MISSION_ARCHITECTURE.md) · [INTERACTION_ARCHITECTURE](docs/INTERACTION_ARCHITECTURE.md) · [UI_ARCHITECTURE](docs/UI_ARCHITECTURE.md) · [SAVE_SYSTEM](docs/SAVE_SYSTEM.md) · [AUDIO_PLAN](docs/AUDIO_PLAN.md) · [LOCALIZATION_PLAN](docs/LOCALIZATION_PLAN.md)

**Quality & delivery** — [PERFORMANCE](docs/PERFORMANCE.md) · [TESTING_STRATEGY](docs/TESTING_STRATEGY.md) · [BROWSER_COMPATIBILITY](docs/BROWSER_COMPATIBILITY.md) · [DEPLOYMENT](docs/DEPLOYMENT.md) · [CODING_RULES](docs/CODING_RULES.md)

**Process** — [CLAUDE_WORKFLOW](docs/CLAUDE_WORKFLOW.md) · [GITHUB_WORKFLOW](docs/GITHUB_WORKFLOW.md) · [ROADMAP](docs/ROADMAP.md) · [TASKS](docs/TASKS.md) · [DECISIONS](docs/DECISIONS.md) · [RISKS](docs/RISKS.md) · [MVP_ACCEPTANCE](docs/MVP_ACCEPTANCE.md)

## MVP at a glance

~1 km² Mysuru-inspired district · third-person player (walk/run/jump/collide) · Mysore Palace · market street, residential lanes, main road · pedestrians · one drivable auto-rickshaw · basic traffic · one complete mission with a ₹ reward · minimap · save/load · day/night · basic audio · stable 60 FPS on a mid-range desktop browser.

## Privacy

No accounts, no servers, no cookies, no analytics, no data collection. Saved games live in your own browser's local storage. The game makes no external network requests after loading.
