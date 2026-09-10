# CITY_SYSTEM — roads, lanes, blocks, procedural fill, landmarks

The city module turns a small amount of authored data into the whole district. Consumers (traffic, NPCs, minimap, missions, vehicle spawning) all read the *same* road graph — no duplicated road data anywhere.

---

## 1. The single road model

```ts
// data/city/roads.ts  (authored)  →  city/RoadGraph.ts  (built at boot)

type RoadClass = 'main' | 'street' | 'lane' | 'ring';

interface RoadNodeDef {          // intersections and endpoints
  id: NodeId;
  p: [x: number, z: number];
  kind: 'intersection' | 'end' | 'roundabout';
  signal?: SignalDef;            // present only on signalled intersections
}

interface RoadSegmentDef {       // a stretch of road between two nodes
  id: SegmentId;
  a: NodeId; b: NodeId;
  cls: RoadClass;
  lanesFwd: number; lanesBack: number;
  laneWidth?: number;            // defaults per class
  sidewalk: 'both' | 'left' | 'right' | 'none';
  divider?: boolean;
  curve?: [x: number, z: number][];   // optional intermediate control points
  speedLimit: number;            // m/s, used by traffic
  props?: PropProfileId;         // streetlight/tree/sign spacing profile
}
```

Authored numbers only: ~40–60 nodes and ~60–90 segments describe the whole MVP district. Everything else is derived.

### Derived at boot (`RoadGraph.build()`)

| Derived structure | Used by |
|---|---|
| Centreline polylines (curve sampling, fixed 2 m spacing) | road mesh, minimap |
| **Lane centrelines** with direction, width, index, neighbours | traffic, vehicle spawning |
| Lane connectivity through intersections (turn options: left/straight/right, legality) | traffic routing |
| **Sidewalk polylines** and crossing links | NPC navigation |
| Intersection polygons and stop lines | road mesh, traffic stopping |
| Junction signal groups and phase plans | traffic signals |
| Spatial index (uniform grid) over segments and lanes | `nearestLane`, `nearestSidewalk`, snapping |
| Block polygons (faces of the planar road graph) | procedural building placement |
| Route graph (segment adjacency + lengths) | mission destinations, traffic routes, minimap paths |

Published as a read-only interface:

```ts
interface RoadNetworkView {
  nearestLane(p: Vector3, maxDist?: number): LaneRef | null;
  nearestSidewalk(p: Vector3, maxDist?: number): PathRef | null;
  lane(ref: LaneRef): LaneSample;                 // position, tangent, width, limit
  turnsFrom(ref: LaneRef): readonly LaneRef[];
  route(from: NodeId, to: NodeId): readonly SegmentId[] | null;
  polylinesForMinimap(): readonly MinimapPolyline[];
  blocks(): readonly BlockPolygon[];
}
```

**Rule:** if a system needs to know anything about roads, it asks `RoadNetworkView`. It never stores its own copy and never re-derives lanes.

## 2. Road geometry

Roads are generated as ribbon meshes from the centrelines at boot, split per chunk:

- Surface: asphalt from the shared ground atlas; lane markings, stop lines, zebra crossings and yellow-black kerb stripes are **regions of the same atlas**, placed via UV, not separate meshes or decals. One material for all road surfaces.
- Kerbs and sidewalks: extruded profiles along the same polylines, same atlas.
- Intersections: triangulated polygons with a blended surface region; small chamfers at corners so kerbs meet cleanly.
- Speed breakers, potholes, patch repairs and manholes: atlas regions applied to inserted quads at authored or seeded positions. Speed breakers additionally register a low collider ramp so vehicles feel them.
- Everything within one chunk merges into a single draw call per material.

Curved roads use Catmull-Rom through the authored control points, sampled at 2 m, with the same sampling reused for lanes, sidewalks and the minimap so nothing drifts out of alignment.

## 3. Blocks and building placement

Each face of the road graph is a **block polygon**. Blocks are filled procedurally, deterministically, from the block's seed and its zone type.

```
for each block:
  inset polygon by setback(zone)               → buildable ring
  walk the frontage edges, consuming lots of width ∈ zone.lotWidthRange
  for each lot:
      pick a kit + storey count + palette index from seeded RNG weighted by zone
      instantiate a modular building (§4) facing the street
      place frontage props: steps, awning, sign, shutter, AC unit, wall
  fill the block interior with: courtyard, compound wall, parked props, trees, or a service shed
```

Zone profiles (`data/city/zones.ts`) control everything: setbacks, lot widths, storey distribution, kit weights, palette weights, prop density, sign density, tree species mix, NPC/traffic density multipliers.

| Zone | Character in data |
|---|---|
| `palace` | Large setbacks, boundary wall, lawns, few lots, wide avenue, high tree density |
| `market` | Zero setback, 4–7 m lots, 1–3 storeys, maximum sign/awning/stall density |
| `residential` | 3–6 m setback with compound walls, 6–12 m lots, 1–2 storeys, gates, parked autos |
| `mainroad` | Mixed commercial, 8–16 m lots, 2–4 storeys, hoardings, bus stop, streetlight spacing 24 m |
| `outskirts` | Sparse, low detail, no colliders beyond the blocker |

## 4. Modular building kit

Buildings are assembled from a small parts library, not modelled individually.

```
Building = base course + N floor modules + roof cap  (+ frontage decorations)
```

- Parts: wall panel (plain / window / shutter / door / balcony), corner post, parapet, flat roof with water tank, sloped tile roof, awning, staircase, shopfront.
- Part count target: **≤ 30 unique meshes** covering all four zones.
- Variation comes from: storey count, panel arrangement, palette index (vertex colour tint), sign selection, awning colour, weathering strength — not from unique geometry.
- Assembly happens at chunk-build time and the result is **merged into the chunk's static mesh**, so a 40-building block is still 1–3 draw calls.
- Colliders are simple boxes fitted to the footprint and height, not the merged mesh (`PLAYER_ARCHITECTURE.md` §Collision).

Phase A uses primitives with the same assembly rules; Phase B swaps in the authored kit with no gameplay code change (`ASSET_PLAN.md`).

## 5. Street furniture and vegetation

All placed as **instanced batches per chunk**, driven by prop profiles along road polylines:

| Prop | Placement rule |
|---|---|
| Streetlight | every 24–32 m on `main`/`mainroad`, 40 m on `street`, none in `lane` |
| Utility pole + cable sag | every 30–45 m, cable drawn as a thin catenary strip between poles |
| Tree (rain tree, palm, neem) | zone-weighted, along sidewalks with 6–10 m spacing plus jitter, avoiding lights and signs |
| Sign / hoarding / shop board | frontage-driven, Kannada-first textures from an atlas |
| Bin, bollard, stall, cart, bench, transformer box | density-weighted per zone, snapped to sidewalk with collision-aware jitter |
| Parked vehicle props | residential/market kerbside, ~1 per 30 m, non-drivable, collidable |

Placement uses **rejection sampling with a minimum-distance check** against already placed items so nothing intersects. All positions come from the chunk's seeded RNG, so the city looks identical on every load.

## 6. Landmarks

Landmarks are authored, not procedural, and loaded as dedicated GLBs registered by asset key.

| Priority | Landmark | MVP treatment |
|---|---|---|
| 1 | **Mysore Palace** | Hero asset. Recognizable silhouette (central dome, towers, arcaded facade), correct footprint scale, boundary wall, main gate, lawns, floodlights at night. Detailed exterior only — no interior. 3 LOD levels. |
| 2 | **Chamundi Hill** | Distant skyline silhouette in the MVP; drivable approach + viewpoint post-MVP. |
| 3 | **Market area (Devaraja-inspired)** | Built from the market zone kit at maximum density plus 3–4 bespoke hero pieces (arch entrance, canopy run, flower-stall row). |
| 4 | **Recognizable streets** | Achieved by kit + signage + props, not bespoke assets. |

Landmark rules: silhouette before detail; correct scale relative to the 1.75 m player; a designed approach (what you see first and from where); gameplay function (mission destination, orientation anchor, minimap icon). No photorealism. Every landmark asset must be original work or carry a recorded compatible licence (`ASSET_PLAN.md`).

## 7. Procedural generation policy

Procedural generation is used **where it saves authoring time without costing control**:

| Use procedural | Keep authored |
|---|---|
| Building assembly and variation | Road graph and lane layout |
| Prop and vegetation scatter | Zone boundaries and character |
| Ground micro-variation | Landmark models and placement |
| Sign/palette selection | Mission anchors and interactables |
| Parked prop placement | Intersections, signals, crossings |
| Interior block fill | The market hero pieces |

Non-goals: a general city generator, L-system road growth, parcel subdivision solvers, procedural interiors. If a generator becomes more complex than the content it replaces, it is the wrong tool — author the content instead.

All generation is a **pure function of (seed, authored data)**: same inputs, same city, on every machine and every load. Generators must not read wall-clock time, `Math.random`, or mutable global state. This is asserted by a unit test that builds two chunks with the same seed and compares placement digests (`TESTING_STRATEGY.md`).

## 8. Build order at boot

```
1. parse authored road + zone data              (sync, <5 ms)
2. RoadGraph.build(): curves, lanes, sidewalks, intersections, blocks, spatial index
3. register signals with traffic; publish RoadNetworkView
4. minimap bakes its static polyline layer once
5. chunk builds begin (streaming), each generating road mesh slice + blocks + props + colliders
```

Steps 1–4 are cheap and global. Step 5 is the only work that scales with world size, and it is sliced.
