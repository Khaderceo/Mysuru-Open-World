# UI_ARCHITECTURE — HUD, menus, minimap

DOM and CSS above the canvas. No framework (`TECH_STACK.md` §3). Three.js renders 3D only; nothing in the interface is drawn in the 3D scene.

---

## 1. Structure

```
#ui  (position:fixed, inset:0, pointer-events:none)
├─ .hud                pointer-events:none
│   ├─ #money          ₹ readout
│   ├─ #speed          shown while driving
│   ├─ #prompt         interaction prompt (keycap + verb)
│   ├─ #tracker        mission title + current objective + distance
│   ├─ #clock          time of day
│   ├─ #toasts         transient messages (reward, level-up, save)
│   └─ #minimap        <canvas> 180×180
├─ .dialogue           pointer-events:auto (when open)
├─ .pause              pointer-events:auto  (menu + settings)
├─ .notice             degraded-mode banners (audio blocked, asset failed, save reset)
└─ .fatal              fullscreen error panel with Reload
```

Each panel is a small module in `src/ui/` exposing `mount(root)`, `update(dt)` (optional, rate-limited), `setVisible(bool)`, `dispose()`. Panels subscribe to `ctx.events` and read published views. **No panel holds gameplay truth** (`ARCHITECTURE.md` §5).

## 2. Rendering approach

- Static markup is written once into `index.html` or created once in `mount()`. Nothing rebuilds DOM per frame.
- Updates write **text content and CSS custom properties/transforms only**. No innerHTML in loops, no class churn, no layout-triggering reads inside the loop.
- HUD updates run at 10 Hz plus event-driven immediate updates (money change, prompt change, objective change), so the DOM is touched a few times a second, not 60.
- Anything animated (toast slide, prompt fade) uses CSS transitions/keyframes, so the compositor handles it off the main thread.
- Layout is `clamp()`/`rem`-based with a root font size tied to viewport height, so the HUD scales sensibly from 1280×720 to 4K without JS.

## 3. Screens and states

| State | Shown | Input |
|---|---|---|
| `loading` | Loading screen with real progress + phase label | none |
| `playing` | HUD | game input active, pointer locked |
| `dialogue` | Dialogue panel + HUD dimmed | advance/skip only; movement blocked |
| `paused` | Pause menu (Resume, Settings, Abandon mission, Save, Controls, About/credits) | menu only; pointer unlocked |
| `settings` | Settings panel | menu only |
| `fatal` | Error panel | Reload only |

A single `UiState` machine owns transitions and sets one `inputBlocked` flag consumed by `input` — no system checks menus itself (`PLAYER_ARCHITECTURE.md` §6).

## 4. Loading screen

- Present in `index.html` as plain HTML/CSS so it paints before JS parses (`WEB_ARCHITECTURE.md` §2).
- Real progress from the asset system: weighted by expected bytes, not file count, so the bar does not stall at 90 %.
- Phase text ("Loading models", "Building the city", "Waking up Mysuru").
- Graceful failure: on a load error it shows the failed asset key, a Retry button (re-runs just that load) and a Continue anyway button when the asset is non-critical.
- Never a white screen and never an indefinite spinner: if no progress occurs for 20 s, it surfaces a diagnostic with the pending asset keys.

## 5. Minimap

**Chosen approach: Canvas2D drawing vector road data.** ADR-010.

```
draw() @15 Hz:
  clear; save; translate(center); rotate(-playerYaw or 0); scale(zoom)
  drawImage(staticRoadLayer, …)        // pre-baked offscreen canvas of the whole district
  for marker in markers: drawIcon()    // mission, vehicle, landmarks, auto stand
  drawPlayerArrow(); restore(); drawFrame()
```

- The **static road layer is baked once** at boot from `RoadNetworkView.polylinesForMinimap()` into an offscreen canvas covering the district at ~2 px/m (≈2048² for 1 km² — one texture-sized canvas, ~4 MB, drawn once). Per-frame work is a single `drawImage` of a sub-rect plus a handful of icons: microseconds.
- Markers are dynamic and few: player, player vehicle, active objective, discovered landmarks, nearby auto stands. Traffic and pedestrians are **not** drawn (cost, clutter).
- Modes: rotating (default) or north-up, toggleable; zoom levels 3.
- Post-MVP: a fullscreen map view reusing the same baked layer at a larger scale — no extra rendering path.

Rejected alternatives:

| Option | Why not |
|---|---|
| Second Three.js render pass from a top-down camera | An entire extra render of the scene per frame (or per N frames) for information the road graph already has in vector form. Doubles draw calls in the worst case. Rejected. |
| Pre-rendered high-res world map image | Large download, must be re-exported whenever the city changes, cannot show a live baked-at-boot city. Rejected. |
| DOM/CSS minimap | Hundreds of positioned elements for road lines; layout cost and poor visual control. Rejected. |
| Render-to-texture displayed on a plane | Same cost as option 1 plus a texture upload; no benefit over Canvas2D. Rejected. |

## 6. HUD elements in detail

| Element | Source | Update trigger |
|---|---|---|
| Money `₹1,240` | `economy:money-changed` | event (with a short count-up animation) |
| Speed | `VehicleView.playerVehicle.speed` | 10 Hz while driving |
| Prompt | `interaction:available` | event |
| Mission tracker | `MissionView` + `mission:*` events | event + 10 Hz for the distance readout |
| Clock | `TimeOfDay` | 10 Hz |
| Toasts | `mission:completed`, `economy:*`, `save:written`, level-up | event, queued, max 3 visible, 3.5 s each |
| Notices | degraded-error channel | event, dismissible, persistent until dismissed |

## 7. Settings

Persisted in `GameState.settings` (`SAVE_SYSTEM.md`), applied through events so systems react without UI reaching into them:

Graphics — quality preset (Low/Medium/High/Auto), render scale (1.0/1.25/1.5/2.0 dpr cap), shadows on/off, draw distance (fog) 3 steps, FPS counter on/off.
Audio — master, music, SFX, ambience (0–100 %), mute-on-blur.
Controls — mouse sensitivity, invert Y, camera shake on/off, (post-MVP) key rebinding.
Gameplay — day length, minimap rotation mode, subtitles on/off (default **on**), language English/ಕನ್ನಡ.

## 8. Accessibility

- All interface text is real DOM text with a minimum effective size of ~14 px at 1080p and WCAG-AA contrast against its own background (panels have opaque backdrops, not just text over the scene).
- Subtitles for all dialogue, on by default, with speaker names.
- Separate volume sliders; nothing is audio-only critical.
- Full keyboard control; menus are tab-navigable with visible focus rings; Escape always backs out one level.
- Interaction prompts always pair an icon with text; never colour alone.
- No flashing/strobing effects. Camera shake is toggleable.
- Respects `prefers-reduced-motion` for UI transitions.

## 9. Localization hookup

Every string in the DOM comes from `t(stringId)` (`LOCALIZATION_PLAN.md`). Panels store the string id on the element (`data-i18n`) so a language change re-resolves in place without re-mounting. Layouts are tested with Kannada strings, which are typically longer and taller — no fixed-height text boxes, no truncation without an ellipsis and a title attribute.

## 10. Why no framework

The interface is ~10 panels of mostly static markup updated a few times per second by text and transform writes. React/Vue would add bundle weight, a reconciler on the main thread beside a 60 FPS render loop, and a second mental model for state that already lives in `GameState`. The DOM API is entirely sufficient here and costs zero KB. Recorded as ADR-003.
