# MISSION_ARCHITECTURE — missions, objectives, economy, progression

Fully data-driven. A new mission is a data entry, not code. There are ~6 objective *primitives* and every mission in the game is a sequence of them.

---

## 1. Data model

```ts
type ObjectiveDef =
  | { kind: 'goto';     anchor: AnchorId; radius: number; requireVehicle?: boolean; label: StringId }
  | { kind: 'interact'; target: InteractableId; label: StringId }
  | { kind: 'talk';     npc: NpcAnchorId; dialogue: DialogueId; label: StringId }
  | { kind: 'carry';    item: ItemId; label: StringId }          // acquire / hold an item
  | { kind: 'deliver';  item: ItemId; target: InteractableId; label: StringId }
  | { kind: 'wait';     seconds: number; label: StringId }
  | { kind: 'collect';  item: ItemId; count: number; anchors: AnchorId[]; label: StringId };

interface MissionDef {
  id: MissionId;
  title: StringId; brief: StringId;
  giver: NpcAnchorId | InteractableId;
  requires?: { minLevel?: number; completed?: MissionId[]; timeWindow?: [number, number] };
  objectives: ObjectiveDef[];        // strictly ordered in the MVP
  reward: { money: number; xp?: number };
  onComplete?: { unlock?: string[]; flags?: Record<string, boolean> };
  repeatable?: boolean;
  softTimer?: number;                // post-MVP: bonus if completed within N seconds
}
```

Missions live in `data/missions.ts` as typed TS modules (see `DECISIONS.md` ADR-011 for why TS rather than JSON: compile-time checking of `AnchorId`/`StringId`/`ItemId` references catches broken content at build time instead of at runtime, and it costs nothing at runtime because Vite inlines it).

## 2. Runtime

```
MissionSystem
├─ available[]         definitions whose `requires` are satisfied
├─ active | null       one at a time in the MVP
│    ├─ index          current objective
│    └─ objective      live instance created from the def
└─ completed Set<MissionId>
```

```ts
interface Objective {
  init(ctx): void;                    // register markers, pin NPCs, spawn items
  check(ctx): boolean;                // 10 Hz; true when satisfied
  describe(): StringId;               // for the tracker
  markers(): MarkerDesc[];            // for HUD + minimap
  dispose(): void;                    // always called, even on abandon
}
```

Each objective kind is one small class implementing this. `check` is a distance test, a flag test, or an inventory test — nothing expensive, and nothing that touches the scene graph.

Flow: `start(missionId)` → objective 0 `init` → 10 Hz `check` → on true, `dispose`, emit `mission:objective-done`, advance → after the last one, grant reward, emit `mission:completed`, write a save.

**Missions never touch rendering.** They emit events and publish markers; `ui` draws the tracker and minimap icons, `world`/`interaction` create the physical anchors. This boundary is stated in `ARCHITECTURE.md` §5 and is the reason mission content stays cheap to add.

## 3. Anchors and interactables

- **Anchors** are named world positions in `data/anchors.ts` (`palace_gate`, `market_stall_7`, `auto_stand_main`, `home_lane_3`). Authored once, referenced by missions, minimap, spawning and traffic. Missions never contain raw coordinates.
- **Interactables** are registered by `interaction` with stable ids (`INTERACTION_ARCHITECTURE.md`); missions reference the id and the interaction system resolves prompts and range.
- Mission NPCs are pinned so streaming/density never removes them mid-mission (`NPC_ARCHITECTURE.md` §9).

## 4. The MVP mission

`M_TIFFIN_RUN` — exercises talk → carry → vehicle → goto → deliver, which is every primitive the MVP needs:

```ts
{
  id: 'M_TIFFIN_RUN',
  title: 'ms.tiffin.title', brief: 'ms.tiffin.brief',
  giver: 'npc_shop_owner_market',
  objectives: [
    { kind: 'talk',     npc: 'npc_shop_owner_market', dialogue: 'dlg.tiffin.start', label: 'ms.tiffin.o1' },
    { kind: 'carry',    item: 'item_tiffin_box',                                    label: 'ms.tiffin.o2' },
    { kind: 'goto',     anchor: 'palace_gate', radius: 8, requireVehicle: false,    label: 'ms.tiffin.o3' },
    { kind: 'interact', target: 'npc_customer_palace',                              label: 'ms.tiffin.o4' },
  ],
  reward: { money: 120, xp: 10 },
}
```

Acceptance for the mission slice is in `MVP_ACCEPTANCE.md`.

## 5. Failure and abandonment

- No hard failure in the MVP. An active mission stays active until completed or abandoned.
- Abandon is available from the pause menu: `dispose` every live objective, clear markers, unpin NPCs, emit `mission:abandoned`. The mission returns to `available`.
- Post-MVP soft timers grant a bonus rather than punishing lateness.
- If a mission's world dependency vanishes (an anchor removed by a content change in a newer build while an old save is active), the mission self-invalidates with a logged warning and is returned to `available` — never a crash, never a stuck save (`SAVE_SYSTEM.md` §Migration).

## 6. Economy

```ts
// data/balance.ts
export const ECONOMY = {
  startingMoney: 50,
  rewards: { delivery: [80, 140], passenger: [100, 180], errand: [50, 90] },
  bonuses: { onTime: 0.25, noCollisions: 0.10 },
  levels: [
    { level: 1, earnedAtLeast: 0,    unlocks: [] },
    { level: 2, earnedAtLeast: 300,  unlocks: ['job_passenger'] },
    { level: 3, earnedAtLeast: 900,  unlocks: ['job_bulk_delivery'] },
    { level: 4, earnedAtLeast: 2000, unlocks: ['vehicle_car'] },
  ],
} as const;
```

- Money lives in `GameState.money`; the *only* writer is the economy module inside `missions`. All changes go through `addMoney(delta, reason)`, which emits `economy:money-changed` and appends to a small in-memory ledger used by the debug overlay and by tests.
- No spending sinks in the MVP (money is a score); post-MVP adds fuel and a vehicle purchase.
- No negative balance, no debt, no penalties.

## 7. Progression

Driver level is derived from `totalEarned`, never stored independently (derived state cannot desync). Level-ups emit an event, show a toast, and set unlock flags checked by `MissionDef.requires`.

## 8. Dialogue

- `data/dialogue.ts`: `DialogueId → { lines: { speaker: StringId; text: StringId }[]; choices?: … }`.
- MVP is linear, advance-on-key, always subtitled, with speaker name and a portrait-free panel (`UI_ARCHITECTURE.md`).
- Choices exist in the type from day one but no MVP dialogue uses them.
- All text is string ids resolved through localization — no literals (`LOCALIZATION_PLAN.md`).

## 9. Content scaling plan

Post-MVP missions are added as data only:

| Mission | Composition |
|---|---|
| Passenger transport | `talk` → `goto(pickup)` → `wait` → `goto(dropoff)` → `interact` |
| Bulk delivery | `interact` → `collect(3 anchors)` → `deliver` |
| Visit landmark | `goto(landmark)` → `wait` (sightsee) |
| Market run | `talk` → `collect` → `deliver` → `talk` |

Target: 8–12 missions post-MVP with **zero new objective kinds**. If a proposed mission needs a new primitive, that is a deliberate decision recorded in `DECISIONS.md`, not an ad-hoc addition.

## 10. Persistence

Saved: `completed[]`, `active { missionId, objectiveIndex, objectiveState }`, `money`, `totalEarned`, `flags`, `unlocks`. Objective state is deliberately minimal (an index plus a small per-kind blob such as collected counts) so save compatibility survives content edits.

## 11. Explicit non-goals

No branching narrative, no reputation/faction system, no timed fail states in the MVP, no quest chains with prerequisites beyond level/completed flags, no procedurally generated missions (a repeatable "random delivery" using random anchors is post-MVP and still uses the same primitives).
