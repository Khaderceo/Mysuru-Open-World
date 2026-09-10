# NPC_ARCHITECTURE — pedestrians

Goal: the *illusion* of a populated Mysuru street at a fixed, small cost. Never a crowd simulation.

---

## 1. Budgets

| | MVP | Post-MVP ceiling |
|---|---|---|
| Instantiated (pool size) | 48 | 64 |
| Visible at once | ≤ 40 | ≤ 56 |
| Full-simulation (10 Hz) | ≤ 12 (nearest) | ≤ 16 |
| Cheap-simulation (2 Hz) | ≤ 28 | ≤ 40 |
| Dormant | remainder (pooled, hidden, zero cost) | — |
| Total CPU per frame | ≤ 1.0 ms | ≤ 1.5 ms |
| Draw calls | ≤ 6 (skinned batches by variant) | ≤ 10 |

Density is scaled per zone (market 3×, main road 1.5×, residential 0.6×, palace 1×) and per time of day (night 0.4×), but the global cap always wins.

## 2. LOD tiers

| Tier | Radius | Update | Behaviour | Visual |
|---|---|---|---|---|
| **A — Full** | 0–25 m | 10 Hz | Full state machine, local avoidance, head look, interaction eligible | Skinned mesh, full animation, shadows on |
| **B — Cheap** | 25–80 m | 2 Hz | Path advance only along the sidewalk polyline; no avoidance, no reactions | Skinned mesh, animation at reduced rate, no shadow |
| **C — Distant** | 80–140 m | 0.5 Hz | Position extrapolated along the path; no logic | Optional: low-poly or hidden. MVP hides beyond 100 m — fog covers it. |
| **D — Dormant** | >140 m or off-graph | never | Returned to pool | Hidden |

Promotion/demotion has hysteresis (±5 m) so an NPC at a boundary does not flicker between tiers.

## 3. Navigation: sidewalk graph, no navmesh

NPCs walk the **sidewalk polylines and crossing links** already derived by `RoadGraph` (`CITY_SYSTEM.md` §1). There is no navmesh, no A* over a grid, no pathfinding library.

- A pedestrian holds `{ pathRef, t, direction, speed, goal }` — a position along a polyline, not a free-space position.
- At a path end it picks a connected path, weighted by: continue-straight bias, zone attractiveness, and whether a crossing is required.
- **Crossings:** a crossing link has a state from the intersection's signal group. A pedestrian at a crossing waits (state `Waiting`) until the link is walkable, then traverses with a fixed duration. Traffic honours pedestrians on crossings via the same signal state (`TRAFFIC_ARCHITECTURE.md`).
- Lateral offset within the sidewalk width keeps two NPCs on the same polyline from overlapping (offset assigned on spawn, jittered, and biased by direction so opposing streams separate — cheap and reads convincingly).
- Free-roam areas (market plaza, palace lawn) use small authored loop paths rather than free navigation.

This is the single biggest cost saving in the NPC system, and it is invisible to the player because pedestrians in a real city do walk on sidewalks and cross at crossings.

## 4. State machine

```
Spawn → Walking ⇄ Waiting(crossing / signal / obstacle)
           │  ├→ Idling (shop front, stall, bench: 3–12 s, plays a variant idle)
           │  ├→ Talking (paired with another NPC or the player; MVP: player-facing dialogue only)
           │  └→ Reacting (startled by a vehicle/horn: 1.2 s, then resume)
           ▼
        Despawn (out of range, off-camera preferred)
```

Every state is a few lines. No behaviour trees, no GOAP, no utility AI — the cost/benefit does not justify them at this scale, and the token cost of maintaining them is real.

## 5. Local avoidance (Tier A only)

Extremely cheap steering:
1. Query up to 4 nearest Tier-A neighbours from the same broadphase grid the physics world uses.
2. If a neighbour is within 0.8 m ahead within a 60° cone, apply a lateral offset nudge and reduce speed.
3. If a vehicle OBB is within 2.5 m ahead, enter `Waiting` (do not step into traffic).
4. Static geometry is handled by the sidewalk graph itself — NPCs cannot walk into buildings because their positions are constrained to the sidewalk. **NPCs do not collide-sweep against the world**, which removes the largest per-agent cost.

## 6. Spawning and despawning

- Spawn points are chunk-provided descriptors on sidewalks (`WORLD_DESIGN.md` §3), weighted by zone density.
- Spawn ring: 45–110 m from the player, preferring positions **outside the camera frustum** so nobody pops into existence on screen; if no off-screen point is available, spawn behind an occluder or defer.
- Despawn at >140 m, or at >100 m when off-screen, returning the instance to the pool.
- Target population is recomputed at 2 Hz: `target = clamp(zoneDensity × timeMultiplier × qualityScale, 0, cap)`. Spawns are rate-limited to 2 per second so populations grow smoothly.
- All instances come from a preallocated pool created during load — **no runtime construction of characters**, no GLB parsing mid-game.

## 7. Visual variants

One skinned base mesh (or two: male/female silhouettes) with variation from:
- Material/texture atlas region swap for clothing (kurta, sari, shirt-and-trousers, school uniform, lungi) — 8–12 combinations from one atlas.
- Colour tint per instance via an instanced attribute or per-material clone from a small cache.
- Scale variation ±4 %, and a small offset in animation phase so a group is not in lockstep.

Skinned instancing is not used in the MVP (`InstancedMesh` does not skin without extra work); instead, characters are pooled `SkinnedMesh` clones sharing geometry and one of ~4 shared materials, batched by variant. This lands within the ≤6 draw-call budget and requires no custom shaders. If profiling shows skinning cost dominating, the documented escalation is a shared-skeleton texture-based instancing pass — recorded as a post-MVP optimization, not a starting point.

## 8. Animation

Clips: `idle`, `idle_variant`, `walk`, `walk_slow`, `talk`, `startle`. Playback rate scaled to speed. Crossfade 0.2 s. Tier B updates the mixer at 2 Hz with the accumulated dt (visibly fine at distance); Tier C does not update mixers at all.

## 9. Dialogue and interaction

A pedestrian may carry an `interactable` descriptor (`INTERACTION_ARCHITECTURE.md`) — mission givers do. Dialogue is data (`data/dialogue.ts`) keyed by localization string ids (`LOCALIZATION_PLAN.md`), rendered by `ui`, with subtitles always on for accessibility. NPCs do not own dialogue text or mission logic; they own a *reference*.

Mission-relevant NPCs are **pinned**: they are never despawned while their mission is active, and they occupy a reserved slot outside the density budget.

## 10. Data

```ts
interface NpcArchetype {
  id: string;                       // 'shopper' | 'vendor' | 'student' | 'commuter' | 'officer'
  meshVariant: number; clothingRegion: number;
  speed: [min: number, max: number];
  idleBias: number;                 // probability of stopping at points of interest
  zones: ZoneType[];                // where this archetype spawns
  timeWindows: [startHour: number, endHour: number][];
  interactable?: InteractableRef;
}
```

Archetypes are data; the agent implementation is one class.

## 11. Explicit non-goals

No crowd flow fields, no group behaviours, no schedules/needs simulation, no persistent NPC identities, no NPC memory across despawn, no ragdolls, no combat reactions, no traffic-rule-breaking pedestrians (they are cheap to add later if the city feels too orderly).
