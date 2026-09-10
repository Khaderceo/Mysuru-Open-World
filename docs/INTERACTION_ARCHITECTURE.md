# INTERACTION_ARCHITECTURE

**One** interaction system serves NPCs, vehicles, doors, pickups, mission objects and locations. There is no per-type interaction code anywhere else in the project.

---

## 1. The contract

```ts
interface Interactable {
  readonly id: InteractableId;
  readonly kind: 'npc' | 'vehicle' | 'pickup' | 'door' | 'location' | 'mission';
  /** World position, read every query — may move (NPCs, vehicles). */
  position(): Readonly<Vector3>;
  /** Metres. Player must be within this to be offered the prompt. */
  radius: number;
  /** Optional facing requirement: player must be within this cone (radians) of the target. */
  facingCone?: number;
  /** Localized prompt, e.g. 'ui.prompt.talk' → "Talk to Ramesh". null = currently not offerable. */
  prompt(ctx: InteractionContext): StringId | null;
  /** Ranked when several are in range; higher wins ties before distance. */
  priority?: number;
  /** Invoked on activate. Must be fast and must not block. */
  activate(ctx: InteractionContext): void;
}
```

Registration is explicit and reversible:

```ts
const handle = interaction.register(interactable);   // returns a disposer
handle.dispose();                                    // on chunk unload, NPC despawn, mission cleanup
```

## 2. Resolution loop (10 Hz)

```
candidates = broadphase.overlapSphere(player.position, MAX_INTERACT_RADIUS = 4.0)
best = null
for c in candidates:
    if dist > c.radius: continue
    if c.facingCone and angleTo(c) > c.facingCone: continue
    if c.prompt(ctx) == null: continue                       // self-gating (occupied vehicle, wrong time)
    score = (c.priority ?? 0) * 100 − dist
    best = max(best, score)

if best != previous: emit 'interaction:available' (or null)
```

- The proximity query reuses the **physics broadphase grid** — interactables are inserted into the same 8 m cells, so this is an integer lookup over a handful of cells with no allocation.
- 10 Hz is imperceptible (≤100 ms prompt latency) and costs ~nothing.
- Line-of-sight is **not** checked in the MVP (radius + facing cone is sufficient at 4 m and avoids a raycast per candidate). If reaching through walls becomes visible in playtesting, a single raycast for the winning candidate only is the documented fix.

## 3. Activation

`E` sets `interact.pressedThisFrame` in the input snapshot. `interaction` — not `player` — consumes it:

```
if input.interact.pressedThisFrame and current != null and not ui.inputBlocked:
    current.activate(ctx)
```

`activate` implementations are tiny and delegate:

| Kind | `activate` does |
|---|---|
| `vehicle` | Calls `vehicles.requestEnter(vehicleId)`; the vehicle system owns validation and the blend |
| `npc` | Emits `dialogue:requested { dialogueId }`; `ui` shows it, `missions` observes completion |
| `pickup` | Emits `inventory:picked { itemId }`, disposes its own registration, hides the mesh |
| `door` | Emits `door:toggled`; `world` animates it (MVP has no interiors, so doors are decorative/locked with a prompt) |
| `location` | Emits `location:entered { anchorId }` — used by `goto` objectives that require a confirmation press and by landmark discovery |
| `mission` | Emits `mission:offer-accepted { missionId }` |

**Nothing in `activate` mutates another system's internals.** Everything is an event or a call into that system's own public request method.

While driving, the interactable set is filtered to `kind === 'vehicle'` (to exit) plus mission `location` targets reachable from a vehicle — so the driving player is not offered "talk to pedestrian" prompts.

## 4. Prompt presentation

`interaction:available` carries `{ promptKey, targetId, position }` (or `null`). `ui` renders:
- A keycap glyph + localized verb in a fixed HUD position (not world-space) for reliability and legibility.
- Optionally a small world-space dot at the target, projected in `lateUpdate`, clamped to screen edges — one DOM element, transform-only updates, no layout thrash.
- A distinct disabled style with a reason when `prompt()` returns a "blocked" string (e.g. "Slow down to get out"). Blocked prompts are returned as normal string ids plus a `blocked: true` flag on the event.

Accessibility: prompt text is real DOM text (screen-reader legible), contrast-checked, and never conveys meaning by colour alone (`UI_ARCHITECTURE.md` §Accessibility).

## 5. Lifecycle and ownership

| Interactable source | Registered by | Disposed on |
|---|---|---|
| Static props, doors, mission anchors | `city` at chunk build | chunk unload |
| Vehicles | `vehicles` on instantiation | vehicle disposal (player vehicle: never) |
| Pedestrians with a role | `npcs` on spawn | despawn (pinned mission NPCs excluded) |
| Mission pickups/targets | `missions` in `Objective.init` | `Objective.dispose` |
| Landmark discovery zones | `world` at boot | never |

A registration leak is a real bug class here (a disposed NPC leaving a phantom prompt), so the registry asserts in dev builds that every registered id has a live owner, and `debug` lists all active interactables with owners.

## 6. Items and inventory

Minimal: `GameState.inventory: Record<ItemId, number>`. Items are data (`data/items.ts`: id, `StringId` name, icon key, optional carried-mesh key). The player can carry mission items only; there is no bag UI in the MVP — the mission tracker states what you are carrying. `carry`/`deliver`/`collect` objectives read and write the same record through `missions`' single writer.

## 7. Why one system

The alternative — separate proximity/prompt logic per object type — was rejected because it duplicates the query, the prompt lifecycle, the input gating, the localization plumbing and the disposal discipline four or five times, and every duplicate is a place for a phantom prompt or a leaked handle. One registry with a 30-line resolver is both cheaper to build and cheaper to keep correct. Recorded as ADR-009.
