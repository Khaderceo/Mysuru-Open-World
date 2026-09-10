# MVP_ACCEPTANCE — definition of done

The MVP is complete when **every** criterion below passes on the reference machine (`PERFORMANCE.md` §1) in Chrome, from the deployed static URL, with a cold cache.

Automated criteria are covered by `npm run check`. Manual criteria are run by hand and recorded in the release commit/notes.

---

## A. Boot and platform

| # | Criterion | How verified |
|---|---|---|
| A1 | Opening the URL shows a loading screen within 0.5 s | manual + e2e |
| A2 | The game becomes playable within 8 s on a 20 Mbps connection, cold cache | e2e timing |
| A3 | Loading shows real, monotonic progress and a phase label; never stalls silently | manual |
| A4 | Zero console errors and zero unhandled rejections during a 3-minute session | e2e |
| A5 | Without WebGL2, a clear explanatory panel appears instead of a blank page | e2e (forced null context) |
| A6 | Works from the GitHub Pages subpath with no 404s | manual + static check |
| A7 | Window resize, high-DPI and fullscreen all work without reload or distortion | manual |
| A8 | No external network requests after load | manual (devtools) |

## B. World

| # | Criterion |
|---|---|
| B1 | A connected ~1 km² district exists with four legible zones (palace, market, residential, main road) |
| B2 | Roads, intersections, sidewalks, kerbs and crossings are present and continuous — no gaps, no floating kerbs, no seams |
| B3 | Buildings, shops, homes, market stalls, streetlights, signs, trees and street props populate every street; no empty filler blocks |
| B4 | Chunk streaming shows no visible pop-in of whole blocks and **no frame over 33 ms** when crossing boundaries |
| B5 | The district edge is handled gracefully (soft blocker + hint), with no invisible walls mid-street |
| B6 | The world is identical on every load (deterministic seeding) |
| B7 | Kannada-first signage is visible on shops and road signs |

## C. Player and camera

| # | Criterion |
|---|---|
| C1 | WASD moves camera-relative; Shift runs; Space jumps; movement feels responsive with no input lag |
| C2 | The player collides with buildings, walls and props; slides along walls; never passes through geometry |
| C3 | Kerbs and single steps (≤0.35 m) are walked over automatically; 0.5 m ledges are not |
| C4 | Gravity, falling and landing behave consistently; the player never falls through the world |
| C5 | The player never becomes permanently stuck (corners, chunk rebuild, spawn) |
| C6 | Mouse look is smooth, pitch-clamped, and identical in feel at 60 and 144 Hz |
| C7 | The camera never clips into geometry and never whips or pumps against walls |
| C8 | Pointer lock is acquired on click and its loss is handled with a working fallback |

## D. Vehicle

| # | Criterion |
|---|---|
| D1 | One drivable auto-rickshaw exists, parked at a findable location with a minimap icon |
| D2 | `E` near it enters the vehicle with a smooth transition; `E` while stopped exits to a free, valid position |
| D3 | Exiting into an obstructed position is refused with a prompt rather than pushing the player into geometry |
| D4 | Driving has believable acceleration, braking, reversing and speed-dependent steering; it is *fun* |
| D5 | The vehicle collides with the world and other vehicles, losing speed and playing an impact sound; it never falls through or launches |
| D6 | The driving camera follows the heading, widens with speed, and transitions cleanly both ways |
| D7 | The vehicle persists where it was left across a reload |

## E. NPCs and traffic

| # | Criterion |
|---|---|
| E1 | Pedestrians walk sidewalks with purpose, wait at crossings, and cross when their signal allows |
| E2 | Pedestrians never walk through buildings, never stand inside each other, and never step into moving traffic |
| E3 | Pedestrians visibly react to a vehicle nearby (wait/startle), and are pushed aside without injury or penalty |
| E4 | AI vehicles drive lanes, queue behind each other and behind the player, stop at red signals, and yield at unsignalled junctions |
| E5 | No permanent gridlock forms during a 5-minute observation at the main junction |
| E6 | Traffic and pedestrians spawn/despawn without visible popping on screen |
| E7 | Population caps hold: ≤40 pedestrians, ≤24 vehicles |

## F. Mission, economy, interaction

| # | Criterion |
|---|---|
| F1 | `M_TIFFIN_RUN` can be started by talking to the market shop owner |
| F2 | Each objective in turn updates the HUD tracker and the minimap marker |
| F3 | The parcel can be collected, carried, and delivered at the Palace gate |
| F4 | Completion grants ₹120 exactly once, shows a toast, and updates the money HUD |
| F5 | Abandoning from the pause menu cleans up markers and returns the mission to available |
| F6 | One interaction system drives every prompt (NPC, vehicle, pickup, location); prompts appear within ~100 ms and never linger after the target is gone |
| F7 | Mission-critical NPCs are never despawned mid-mission |

## G. UI and minimap

| # | Criterion |
|---|---|
| G1 | HUD shows money, clock, interaction prompt, mission tracker, and speed while driving |
| G2 | The minimap shows roads, the player with heading, the active objective, the player's vehicle and discovered landmarks |
| G3 | The minimap costs no extra scene render and stays within budget |
| G4 | Pause menu offers Resume, Save, Settings, Abandon mission, Controls, Credits |
| G5 | Settings changes (quality, render scale, shadows, volumes, sensitivity, language) apply immediately and persist |
| G6 | Dialogue displays with subtitles and speaker names; movement is blocked while it is open |
| G7 | All interface text is legible at 1080p with AA-level contrast, and the layout survives Kannada strings without clipping |
| G8 | Escape always backs out exactly one level; menus are keyboard-navigable |

## H. Save / load

| # | Criterion |
|---|---|
| H1 | Reloading the page restores player position, money, mission progress, time of day, settings and vehicle position |
| H2 | Autosave occurs periodically and on key events, with a visible confirmation |
| H3 | A corrupt or hand-edited save is rejected, quarantined, and the game starts fresh with a notice — never a crash |
| H4 | The migration **mechanism** is proven: a committed synthetic pre-v1 fixture migrates to the current schema with no data loss, and a save claiming a newer version is refused with a clear message. (At v0.1.0 no real older version exists yet — this criterion verifies the machinery, not historical data.) |
| H5 | With storage unavailable (private mode), the game runs in ephemeral mode with a notice |

## I. Day/night and audio

| # | Criterion |
|---|---|
| I1 | The sun moves; sky, fog and ambient light change across dawn/day/dusk/night |
| I2 | Night is fully playable and readable; streetlights and shop lights are on; the Palace is floodlit |
| I3 | Ambience crossfades by zone and time of day without audible seams |
| I4 | Footsteps, engine, horns and UI sounds all play, positioned and balanced |
| I5 | Audio starts after the first gesture, with a notice beforehand; blocked audio never breaks the game |
| I6 | Volume sliders work independently and persist |

## J. Landmark

| # | Criterion |
|---|---|
| J1 | Mysore Palace is present with a recognizable silhouette, correct scale relative to the player, boundary wall, gate and grounds |
| J2 | It is visible as an orientation anchor from multiple streets and is floodlit at night |
| J3 | It serves as the mission destination and appears on the minimap |
| J4 | Chamundi Hill is visible on the skyline |
| J5 | A viewer familiar with Mysuru identifies the setting within ~30 seconds (subjective, recorded) |

## K. Performance

| # | Criterion |
|---|---|
| K1 | p95 frame time ≤16.6 ms over the benchmark route on the reference machine |
| K2 | **Zero frames over 33 ms** during that route, including chunk crossings and mission events |
| K3 | Draw calls ≤400 typical, triangles ≤1.2 M typical |
| K4 | Texture memory ≤256 MB; JS heap ≤400 MB with no monotonic growth over 10 minutes |
| K5 | Total first-playable download ≤15 MB; JS ≤900 KB gzipped |
| K6 | The Low preset holds ≥30 FPS on the low-tier machine without stutter |

## L. Polish gate (subjective, but mandatory)

| # | Criterion |
|---|---|
| L1 | Controls feel good enough that moving around is enjoyable with nothing else happening |
| L2 | The camera never produces a moment that makes the player flinch |
| L3 | Scale reads as believable — doors, kerbs, vehicles and buildings feel right beside the player |
| L4 | The visual style is cohesive; nothing looks like a placeholder next to finished content |
| L5 | Dusk in the market street is a screenshot worth sharing |
| L6 | A first-time player can boot, find a job, complete it and quit satisfied within 10 minutes with no instructions beyond the controls screen |

---

## Explicitly NOT required for the MVP

Full Mysuru recreation · Chamundi Hill as a drivable area · multiplayer · large crowds · photorealism · more than one vehicle type · advanced AI (lane changing, overtaking, pedestrian schedules) · weather · a complete Kannada translation (architecture only) · interiors · combat · any backend, database, account or paid service · mobile or touch support · WebGPU.

## Sign-off

The MVP ships when sections A–L pass and the results are recorded in the `v0.1.0` release notes, including the browser matrix pass (`BROWSER_COMPATIBILITY.md` §7) and the manual checklist outcomes.
