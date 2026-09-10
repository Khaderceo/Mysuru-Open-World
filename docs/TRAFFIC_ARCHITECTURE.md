# TRAFFIC_ARCHITECTURE — AI vehicles

Goal: a street that *reads* as busy Mysuru traffic at a fixed small cost. Not a traffic simulator.

---

## 1. Budgets

| | MVP | Ceiling |
|---|---|---|
| Pool size | 28 | 40 |
| Active agents | ≤ 24 | ≤ 32 |
| Near tier (20 Hz) | ≤ 10 | ≤ 14 |
| Far tier (5 Hz) | remainder | — |
| CPU per frame | ≤ 1.0 ms | ≤ 1.5 ms |
| Draw calls | ≤ 4 (instanced/merged per vehicle type) | ≤ 8 |
| Vehicle mix (MVP) | autos 60 %, two-wheelers 25 %, cars 15 % | + bus post-MVP |

Density is per-road-class and per-time-of-day (`main` 1.0, `mainroad` 1.0, `street` 0.5, `lane` 0.15; night 0.35×, rush hours 1.4×).

## 2. Agents live on lanes

Every AI vehicle is `{ laneRef, s (metres along lane), speed, targetSpeed, route, state }`. Its world transform is *derived* from the lane sample. It is never free-driving.

This single choice removes the need for steering AI, path following error correction, lane-keeping, and most collision handling — and it is why 24 vehicles cost under a millisecond.

- Lanes, their centrelines, widths, speed limits and turn connectivity come from `RoadNetworkView` (`CITY_SYSTEM.md`). Traffic derives nothing itself.
- Visual position = lane sample + a small lateral bias (per-agent, for the loose Indian lane discipline the setting deserves) + a smoothed heading from the lane tangent.
- Two-wheelers get a larger lateral bias and are allowed to occupy the gap between lanes — cheap, and instantly recognisable as India.

## 3. Longitudinal control: car-following

A simplified IDM (Intelligent Driver Model), which is ~15 lines and produces convincing accelerate/brake/queue behaviour:

```
gap        = distance to leader on this lane (or to a stop line / obstacle)
vLead      = leader speed (0 for a stop line)
desiredGap = minGap + speed * headwayTime + (speed*(speed - vLead)) / (2*sqrt(a*b))
accel      = a * (1 − (speed/targetSpeed)^4 − (desiredGap/max(gap, 0.1))^2)
speed      = clamp(speed + accel*dt, 0, targetSpeed)
s         += speed * dt
```

Parameters per vehicle type: `a` (comfort accel 1.2–2.0), `b` (comfort brake 2.0–3.5), `minGap` (1.5–3 m), `headwayTime` (0.8–1.4 s). Randomised slightly per agent so a queue does not move in lockstep.

Leader lookup is O(1): each lane keeps a **sorted list of the agents on it** (insertion is cheap at these counts), so the leader is the next entry.

## 4. Intersections

Two mechanisms, chosen per intersection in authored data:

**Signalled intersections** (main-road junctions, the circle):
- A `SignalGroup` with a fixed phase plan: `[{ greenLanes, greenSec, amberSec }, …]`, cycling. Deterministic, debuggable, and visually correct with the light meshes.
- An approaching agent whose lane is not green treats the stop line as a stationary leader (`vLead = 0`) — so it queues naturally with no special-case code.
- Pedestrian crossing links read the same group state (`NPC_ARCHITECTURE.md` §3), so pedestrians and traffic never contradict each other.

**Unsignalled intersections** (lanes, minor streets):
- **Conflict-slot reservation.** Each intersection has a set of conflict areas; an agent within ~12 m of the stop line requests a reservation for the areas its chosen turn crosses. Reservations are granted first-come, held until the agent clears, with a priority tie-break (larger road wins, then right-hand rule, then FIFO).
- Starvation guard: a request waiting >6 s gets priority.
- This is far cheaper than any negotiation model and looks like the polite-chaotic yielding of a real Indian side street.

## 5. Routing

- On spawn, the agent picks a destination node ~200–600 m away and gets a route from `RoadNetworkView.route()` (Dijkstra over segment lengths, computed once, cached per node-pair in a small LRU — the graph is tiny so this is microseconds).
- At each intersection it takes the turn its route requires, choosing among `turnsFrom(lane)`.
- If the route is exhausted or invalid, it re-routes; if that fails twice, it despawns off-screen.
- No dynamic congestion-aware re-routing (unnecessary at this scale, and jams are atmospheric).

## 6. Player interaction

The player's vehicle is not a lane agent. To AI agents it appears as an **obstacle**:
- Its position is projected to the nearest lane each frame (`nearestLane`, cached). If it is on or near an agent's lane ahead, it becomes that agent's leader with its real speed. Result: AI queues behind the player, brakes when the player cuts in, and honks.
- Off-lane (player driving on the sidewalk or a lawn), agents ignore it except for a proximity emergency-brake check within 6 m.
- Collisions are resolved by the shared vehicle-vs-vehicle response (`VEHICLE_ARCHITECTURE.md` §5). A hit agent enters `Recovering` for ~2 s (hazard-lights-and-honk behaviour), then re-snaps to its lane. No wrecks, no chases.
- **Honking** is the single highest-value atmosphere feature per line of code: agents honk on braking hard, on a blocked stop line >2 s, and randomly at low frequency near the market. Rate-limited globally so it is texture, not noise.

## 7. Tiers and simulation cost

| Tier | Radius | Rate | Detail |
|---|---|---|---|
| Near | 0–90 m | 20 Hz | Full IDM, reservations, honking, wheel/visual detail, audio, shadows |
| Far | 90–200 m | 5 Hz | IDM with a coarse leader, no reservations (treated as always clear), no audio |
| Culled | >200 m | — | Despawned to pool |

Far-tier agents exist mainly so that traffic already flowing is visible when the player turns a corner.

## 8. Spawning / despawning

- Spawn on lanes at the edge of the active radius (140–200 m), preferring off-screen and requiring a clear gap of `minGap + 2 × speed` ahead and behind.
- Rate-limited to 3 spawns/second; population target recomputed at 2 Hz from road-class density × time-of-day × quality scale.
- Despawn beyond 200 m, or beyond 120 m when off-screen.
- **Everything is pooled.** GLBs are loaded once at boot; agents are recycled structs. No allocation per spawn.
- Parked vehicles are static props placed by `city`, not traffic agents — they cost one instanced batch and no CPU.

## 9. Visuals

- One `InstancedMesh` per vehicle type per colour group; the instance matrix is written from the agent's derived transform. Wheels on near-tier vehicles are separate small instanced batches or simply omitted on two-wheelers at distance.
- Brake lights and indicators: emissive region swap via instanced attribute; visible only near tier.
- Headlights at night: emissive quads plus, for the nearest ~4 vehicles, a cheap light-cone quad on the road. No real spotlights (shadow/light budget, `PERFORMANCE.md`).

## 10. Data

```ts
interface TrafficConfig {
  densityByClass: Record<RoadClass, number>;
  timeOfDayCurve: [hour: number, multiplier: number][];
  mix: { specId: string; weight: number }[];
  idm: Record<string, { a: number; b: number; minGap: number; headway: number }>;
  spawnRadius: [near: number, far: number];
  caps: { active: number; nearTier: number };
  honk: { globalRatePerSec: number; brakeThreshold: number };
}
```

All in `data/traffic.ts` and tunable without touching logic.

## 11. Explicit non-goals

No lane changing or overtaking in the MVP (documented as the first post-MVP traffic feature, implemented as a discrete lane-hop with a gap check — not continuous steering). No realistic vehicle physics for AI. No accidents between AI vehicles. No emergency vehicles, no police, no pursuit. No traffic-flow analytics. No pedestrian jaywalking response beyond the existing emergency brake.
