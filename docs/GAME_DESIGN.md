# GAME_DESIGN — Mysuru Open World

Companion to `PROJECT_SPEC.md`. This document describes the *experience*; other documents describe the machinery.

---

## 1. Pitch

You are a young auto-rickshaw driver in a compact Mysuru district. You walk its streets, drive its traffic, take small jobs — carry a passenger to the Palace gate, deliver a parcel to the market — and earn money. The city is small enough to know by heart and detailed enough to feel lived-in: mysore-pak shops, temple bells, honking, bougainvillea over compound walls, and the Palace lit up after dusk.

The fantasy is **familiarity and place**, not power or violence. There is no combat.

## 2. Core loop

```
walk / drive around a small, dense, atmospheric district
        ↓
find a job marker (or an NPC offering one)
        ↓
complete a simple objective chain (go there → interact → deliver → return)
        ↓
earn money, see progression tick up
        ↓
next job, at a different time of day
```

Session length target: **5–15 minutes** to a satisfying stopping point. A player should be able to load, do one job, and quit with the state preserved.

## 3. Pillars

1. **Recognizable Mysuru.** A player from Mysuru should identify the place within thirty seconds — Palace silhouette, road textures, signage, autos, the shape of the shopfronts.
2. **Good to move in.** Walking, running and driving must feel responsive and smooth. Controls and camera are polished before content is added.
3. **Small and dense.** Every street has something on it. Nothing is empty filler.
4. **Alive.** Pedestrians walk with purpose, traffic flows, lights change, the sun moves, the ambience shifts with time of day.
5. **Runs everywhere.** Locked 60 FPS on a mid-range desktop browser is a design requirement, not a stretch goal.

## 4. Player verbs

**MVP:** walk · run (Shift) · jump (Space) · look (mouse) · interact (E) · enter/exit vehicle (E on vehicle) · drive (WASD) · pause (Esc) · read HUD/minimap · save/load.

**Post-MVP:** honk, headlights, sprint stamina (only if it improves feel), passenger dialogue choices, fast-travel to discovered landmarks.

Not in this game: shooting, fighting, stealing, wanted levels, destruction.

## 5. World, as the player meets it

A single connected district, ~1 km × 1 km, laid out as four legible zones so the player builds a mental map quickly:

| Zone | Character | Function |
|---|---|---|
| **Palace precinct** | Wide avenue, boundary wall, gate, lawns, the hero landmark | Landmark, orientation anchor, mission destination |
| **Market street (Devaraja-inspired)** | Narrow, canopied, crowded, dense signage, produce stalls | Pedestrian density, mission hub, atmosphere showcase |
| **Residential lanes** | Compound walls, single/double-storey homes, parked autos, trees | Quiet driving, shortcuts, breathing space |
| **Main road / circle** | Multi-lane, a roundabout, bus stop, shops, streetlights | Traffic showcase, vehicle driving space |

A ring road bounds the district; beyond it, low-detail scenery and a soft blocker (see `WORLD_DESIGN.md` §"Edges"). Chamundi Hill exists on the skyline as distant silhouette geometry in the MVP and becomes a drivable approach post-MVP.

## 6. Mysuru identity checklist

Concrete, cheap-to-build details that carry most of the recognition:

- Mysore Palace: silhouette, domes, gate, boundary wall, floodlights at night.
- Bilingual signage: Kannada primary, English secondary, on shops and road signs.
- Auto-rickshaws (yellow/green livery), KSRTC-style bus, hoardings, Hero-style two-wheelers as props.
- Road furniture: yellow-black kerb stripes, dividers, speed breakers, unmarked crossings, potholes as decals, overhead cable clutter, transformer boxes.
- Vegetation: rain trees, coconut palms, bougainvillea, banana leaves.
- Small temple, water tank, autorickshaw stand, tender-coconut cart, ironing cart.
- Ambience: horns, temple bell, crows, street vendor calls, distant traffic.

Every one of these must be original or licence-compatible. See `ASSET_PLAN.md` §Licensing.

## 7. Missions

Data-driven objective chains, not bespoke scripts. See `MISSION_ARCHITECTURE.md`.

**MVP mission (`M_TIFFIN_RUN`)** — the one complete mission required by the MVP:
1. Talk to the shop owner at the market (interaction prompt).
2. Collect the parcel (pickup objective).
3. Enter your auto-rickshaw.
4. Drive to the Palace gate (waypoint + minimap marker).
5. Hand it to the waiting customer (interaction).
6. Reward: ₹120, mission-complete toast, money HUD updates, state saved.

**Mission types the system supports from day one** (composed from the same objective primitives): delivery, pickup, passenger transport, visit-landmark, talk-to-NPC, collect-items. Content beyond the one MVP mission is post-MVP.

## 8. Economy

Deliberately trivial. Money (₹) is a progress readout and a reward signal.

- Earn: mission completion, small bonuses for on-time delivery.
- Spend (post-MVP): fuel, vehicle upgrade or second vehicle, cosmetic livery.
- No microtransactions, no online economy, no loss/penalty spiral. Failing a mission costs time, not money.

Balance values live in a data module, not in code. See `MISSION_ARCHITECTURE.md` §Economy data.

## 9. Progression

Flat and readable: total earnings → *driver level* (3–5 tiers) → unlocks new job types and, post-MVP, a second vehicle. No skill trees, no grind.

## 10. Difficulty and failure

No fail states in the MVP beyond "the mission is still open". Traffic collisions cost speed and make noise; they do not damage, kill, or arrest. Post-MVP may add soft timers on delivery jobs.

## 11. Time of day

A compressed 24-hour cycle (default ~24 real minutes per game day, configurable, pausable). Dawn and dusk are the money shots: long shadows, warm sun, floodlit Palace, streetlights on, shop lights on. Night is playable — lit, not black. See `WORLD_DESIGN.md` §Day/night.

## 12. Audio identity

City ambience bed that cross-fades by zone and time of day, plus footsteps, auto-rickshaw two-stroke engine, horns, UI clicks, one light music cue on mission complete. See `AUDIO_PLAN.md`.

## 13. Visual art direction

**Chosen style: stylized realism, mid-poly, colour-led.** Correct real-world proportions and materials, simplified forms, restrained texture detail, atmosphere carried by lighting, fog and colour grading rather than by asset density.

Rejected: photorealism (asset cost, VRAM, licence risk, browser budget), flat low-poly/faceted (fights Mysuru recognizability; landmark reads as a toy), cel/toon (charming, but weakens "believable scale" pillar and dates quickly).

Rules that make the style cheap:
- Trim-sheet and atlas texturing; few unique materials; heavy material reuse.
- Vertex-colour and simple gradient variation instead of unique textures per building.
- Baked-looking ambient occlusion via a single AO/dirt overlay in atlases, not per-object bakes.
- One directional sun + hemispheric ambient + fog do the heavy lifting.
- Silhouette first: an asset earns detail only if it is seen up close.

Colour: warm dusty ochres, terracotta, whitewash, deep greens, saturated shop-front accents. Palette lives in a single data module so grading is tunable in one place.

## 14. Accessibility

Readable HUD at 1080p with adequate contrast; subtitles for all dialogue; separate master/music/SFX/ambience volume sliders; full keyboard control with rebindable keys (post-MVP: rebinding UI, MVP: remappable config); clear, consistent interaction prompts; no flashing effects; camera-shake toggle. See `UI_ARCHITECTURE.md`.

## 15. What "polished" means for acceptance

- No hitching when crossing chunk boundaries.
- Camera never clips into geometry or whips.
- Player never falls through the world or gets stuck on kerbs.
- Vehicle entry/exit is smooth and legible.
- Loading shows real progress and never white-screens.
- Reloading the page puts you back where you were.

These are enforced in `MVP_ACCEPTANCE.md`.
