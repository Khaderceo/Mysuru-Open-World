# ROADMAP — phases and milestones

Each phase: objective · dependencies · tasks · acceptance · risk · complexity · postponed.
Task ids reference `TASKS.md`. Milestones (M1–M10) are the demonstrable checkpoints and are tagged in git.

---

## PHASE 0 — Planning and architecture ✅ (this deliverable)

- **Objective** Decide the stack, design the architecture, identify risks, produce the planning document set, roadmap, task breakdown and MVP acceptance criteria.
- **Dependencies** none.
- **Tasks** the 31 documents in `docs/`.
- **Acceptance** All documents exist; ADR-001…015 recorded; `TASKS.md` ordered with acceptance criteria; MVP defined.
- **Risk** Low. **Complexity** Medium (breadth).
- **Postponed** All implementation. No code, no dependencies, no scaffolding until the architecture is approved.

---

## PHASE 1 — Browser technical foundation → **M1: the browser opens a 3D scene**

- **Objective** A deployable Vite/TS/Three.js application with the runtime skeleton, loop, scheduler, error handling, debug overlay and CI.
- **Dependencies** Phase 0 approval.
- **Tasks** T-1.1 … T-1.9.
- **Acceptance** `npm run check` passes; the page loads a lit scene with a ground plane and a test box at 60 FPS; the debug overlay shows FPS, draw calls, triangles; a WebGL2-missing panel works; CI green; deployed to GitHub Pages and loading from the subpath.
- **Risk** Low. **Complexity** Low–Medium.
- **Postponed** Everything gameplay.

---

## PHASE 2 — Player, camera, test world → **M2: the player can walk, run, jump and collide**

- **Objective** The controls and camera feel good in a grey-box test world. This is the phase that decides whether the game is pleasant.
- **Dependencies** M1.
- **Tasks** T-2.1 … T-2.9.
- **Acceptance** MVP_ACCEPTANCE C1–C8 pass in a grey-box scene; step-up/slope/tunnelling unit tests pass; collider visualisation works; no frame >33 ms; feel checklist signed off.
- **Risk** Medium (`RISKS.md` R-7 controller feel).
- **Complexity** High — the hardest bespoke system in the project.
- **Postponed** Animation polish (proxy character is acceptable), vehicle entry, real assets.

---

## PHASE 3 — Mysuru environment foundation → **M3/M4: walkable district with a real road network**

- **Objective** The road graph, chunk streaming, procedural blocks, props and vegetation — a full 1 km² district in Phase-A primitives.
- **Dependencies** M2.
- **Tasks** T-3.1 … T-3.12.
- **Acceptance** MVP_ACCEPTANCE B1–B6; `RoadNetworkView` published and unit-tested; deterministic generation test passes; streaming shows no frame >33 ms at boundaries; draw calls ≤400 with all four zones populated; lane/sidewalk overlay works.
- **Risk** Medium (streaming bugs R-10, performance R-3).
- **Complexity** High.
- **Postponed** Authored art (Phase 4 / B assets), landmarks, NPCs, traffic.

---

## PHASE 4 — Mysuru landmarks and visual identity → **M5: the Palace exists**

- **Objective** Swap primitives for the modular kit; build Mysore Palace, the market hero pieces and the Chamundi silhouette; signage; the look lands.
- **Dependencies** M4, Q-1 answered.
- **Tasks** T-4.1 … T-4.8.
- **Acceptance** MVP_ACCEPTANCE J1–J4, B3, B7; texture memory ≤256 MB; asset credits complete and the CI credits check passes; the "recognizable within 30 s" judgement recorded.
- **Risk** Medium–High (`RISKS.md` R-4 licensing, R-15 art bandwidth, R-5 memory).
- **Complexity** Medium (mostly content).
- **Postponed** Night-lighting polish (Phase 9), interiors (never).

---

## PHASE 5 — Vehicles → **M6: the auto-rickshaw drives**

- **Objective** One drivable auto-rickshaw with arcade dynamics, enter/exit, vehicle camera and audio hooks.
- **Dependencies** M2 (collision), M4 (roads), Q-2 answered.
- **Tasks** T-5.1 … T-5.8.
- **Acceptance** MVP_ACCEPTANCE D1–D7; handling feel checklist signed off; no frame >33 ms while driving the benchmark route.
- **Risk** Medium (`RISKS.md` R-9 handling feel).
- **Complexity** Medium.
- **Postponed** Car and bus specs, damage, fuel, honking polish.

---

## PHASE 6 — Traffic → **M7: the streets have traffic**

- **Objective** Lane-based AI vehicles with car-following, signals, junction yielding, spawning and pooling.
- **Dependencies** M6, road graph lanes.
- **Tasks** T-6.1 … T-6.8.
- **Acceptance** MVP_ACCEPTANCE E4–E7; ≤1.0 ms/frame at 24 agents; no gridlock in a 5-minute observation; IDM and signal unit tests pass.
- **Risk** Medium (`RISKS.md` R-8).
- **Complexity** Medium–High.
- **Postponed** Lane changing/overtaking, buses, emergency vehicles.

---

## PHASE 7 — NPCs → **M8: the streets have people**

- **Objective** Pedestrians navigating the sidewalk graph with LOD tiers, crossings, idles and reactions.
- **Dependencies** M4 (sidewalks), M7 (signal groups).
- **Tasks** T-7.1 … T-7.7.
- **Acceptance** MVP_ACCEPTANCE E1–E3, E6–E7; ≤1.0 ms/frame at 40 pedestrians; ≤6 draw calls; no clipping through buildings; density scales by zone and time.
- **Risk** Medium (skinning cost, `NPC_ARCHITECTURE.md` §7).
- **Complexity** Medium.
- **Postponed** Dialogue variety, schedules, group behaviours, jaywalking.

---

## PHASE 8 — Interaction, missions, progression → **M9: a complete mission**

- **Objective** The interaction system, mission runtime with all six objective primitives, economy, progression, and `M_TIFFIN_RUN` end to end.
- **Dependencies** M6, M8. Note: the UI host and localization core are **pulled forward into T-8.0** — Phase 8 writes UI files and string ids, so building them in Phase 10 would have meant a throwaway panel plus a rewrite.
- **Tasks** T-8.0 … T-8.9.
- **Acceptance** MVP_ACCEPTANCE F1–F7; objective and economy unit tests pass; interactable disposal verified with no phantom prompts; mission completes and rewards exactly once.
- **Risk** Low–Medium (lifecycle leaks).
- **Complexity** Medium.
- **Postponed** Additional missions, branching dialogue, soft timers, spending sinks.

---

## PHASE 9 — Day/night, audio, weather scaffolding

- **Objective** Time of day driving sun/sky/fog/lights, the full audio graph and ambience system, and the weather scaffolding (clear/cloudy only; rain post-MVP).
- **Dependencies** M4 (streetlights, emissive materials), M9 (event hooks).
- **Tasks** T-9.1 … T-9.8.
- **Acceptance** MVP_ACCEPTANCE I1–I6; night readable and floodlit Palace; ≤8 point lights; audio ≤24 voices; autoplay-blocked path verified; mix balance checklist signed off.
- **Risk** Low–Medium (night performance, mix balance R-13).
- **Complexity** Medium.
- **Postponed** Rain, thunder, wet-road materials, dynamic music.

---

## PHASE 10 — Save/load, UI polish, localization architecture → **M10: save/load works**

- **Objective** Versioned persistence, the full HUD/menu/minimap/settings set, localization plumbing with the Kannada pass.
- **Dependencies** M9, Phase 9.
- **Tasks** T-10.1 … T-10.10.
- **Acceptance** MVP_ACCEPTANCE G1–G8, H1–H5; migration fixtures pass; corrupt-save quarantine verified; Kannada layout pass with no clipping; string-id coverage check green.
- **Risk** Low–Medium (`RISKS.md` R-12 save drift, Q-4 translation quality).
- **Complexity** Medium.
- **Postponed** Key rebinding UI, fullscreen map, multiple save slots in the UI.

---

## PHASE 11 — Performance optimization

- **Objective** Meet every budget in `PERFORMANCE.md` §2 on the reference machine and hold ≥30 FPS on the low tier.
- **Dependencies** Phase 10 (the full game must exist before it is optimized).
- **Tasks** T-11.1 … T-11.8.
- **Acceptance** MVP_ACCEPTANCE K1–K6; perf baseline committed; the escalation ladder documented with before/after numbers for each change made.
- **Risk** Medium (`RISKS.md` R-3).
- **Complexity** Medium — but strictly measurement-driven; no speculative work.
- **Postponed** Worker-based chunk merging and impostors unless measurement demands them.

---

## PHASE 12 — Release

- **Objective** Ship `v0.1.0` publicly on GitHub Pages with credits, controls, README and known issues.
- **Dependencies** Phase 11, all of `MVP_ACCEPTANCE.md`.
- **Tasks** T-12.1 … T-12.6.
- **Acceptance** All of A–L in `MVP_ACCEPTANCE.md`; browser matrix pass recorded; credits panel complete; tag and release notes published; live URL verified from a cold cache.
- **Risk** Low. **Complexity** Low.
- **Postponed** everything on the post-MVP list.

---

## Milestone ladder

| Milestone | Demonstrates | Phase |
|---|---|---|
| **M1** | The browser opens a 3D scene | 1 |
| **M2** | The player moves, jumps and collides | 2 |
| **M3** | The player walks through a small environment | 3 |
| **M4** | A Mysuru-style road network with a populated district exists | 3 |
| **M5** | The Palace landmark exists and reads as Mysuru | 4 |
| **M6** | A vehicle can be entered and driven | 5 |
| **M7** | Traffic flows and obeys signals | 6 |
| **M8** | Pedestrians populate the streets | 7 |
| **M9** | A complete mission can be played for a reward | 8 |
| **M10** | Save/load restores a session | 10 |
| **v0.1.0** | The MVP is public | 12 |

Each milestone is independently demonstrable and tagged. No phase begins before the previous milestone's acceptance criteria pass — this is what prevents stacking untested systems.

---

## Post-MVP backlog (not committed, not scheduled)

Chamundi Hill drivable approach and viewpoint · car and bus specs · lane changing and overtaking · rain and wet roads · more missions (passenger, bulk delivery, sightseeing) using existing primitives · spending sinks (fuel, vehicle purchase) · key rebinding UI · fullscreen map · multiple save slots · reviewed Kannada translation · night bloom · gamepad support · world expansion toward 2.25 km² (after impostors, occlusion and graph paging) · a service worker for offline play.
