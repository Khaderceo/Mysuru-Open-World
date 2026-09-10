# SAVE_SYSTEM — persistence

---

## 1. Decision: `localStorage`

**Chosen: `localStorage` with versioned JSON.** IndexedDB is deferred. ADR-007.

| | `localStorage` | IndexedDB |
|---|---|---|
| API | 4 synchronous methods | async, transactional, verbose |
| Save size limit | ~5 MB per origin | hundreds of MB |
| Our save size | **~2–8 KB** | — |
| Works in `beforeunload` | **yes (synchronous)** | no, reliably |
| Code cost | ~80 lines including migration | ~250+ lines |
| Failure modes | quota, disabled storage | same, plus version/transaction errors |

Our save is a few kilobytes of scalars — three orders of magnitude inside the limit — and being synchronous means the `beforeunload` write actually lands, which is exactly what a browser game needs. IndexedDB becomes correct only if we later persist binary blobs (screenshots, replays, a large modified-world diff); the store is isolated behind a 4-method interface so that swap is contained.

## 2. Interface

```ts
interface SaveStore {                       // src/save/store.ts — the only place that touches storage
  read(slot: number): unknown | null;
  write(slot: number, data: unknown): Result<void, SaveError>;
  list(): SaveMeta[];
  remove(slot: number): void;
}
```

Keys: `mow.save.v1.slot0`, plus `mow.settings` (settings are stored separately so they survive a corrupt or wiped save).

## 3. Save shape

```ts
interface SaveFileV1 {
  version: 1;                     // schema version, bumped on any incompatible change
  build: string;                   // git short sha, for diagnostics only
  worldSeed: number;               // must match the current world seed
  worldDataVersion: number;        // bumped when authored city/anchors change incompatibly
  savedAt: number;                 // epoch ms
  playtimeSec: number;

  player: { pos: [number,number,number]; yaw: number; state: 'onfoot' | 'driving' };
  camera: { yaw: number; pitch: number; distance: number };
  time:   { hour: number; dayCount: number; paused: boolean };

  economy: { money: number; totalEarned: number };
  missions: {
    completed: MissionId[];
    active: { id: MissionId; objectiveIndex: number; blob?: Record<string, number> } | null;
  };
  inventory: Record<ItemId, number>;
  flags: Record<string, boolean>;
  discovered: AnchorId[];
  vehicles: { id: VehicleId; specId: string; pos: [number,number,number]; yaw: number }[];
  settings: SettingsSnapshot;      // duplicated here for portability; the separate key wins on load
}
```

**What is deliberately not saved:** traffic and pedestrian populations (regenerated), chunk state (regenerated deterministically from `worldSeed`), velocities, animation state, audio state, camera smoothing internals, anything derivable (driver level is derived from `totalEarned`).

If it is not in `GameState`, it is not saved — which is the reason `GameState` is a curated tree rather than a dumping ground (`ARCHITECTURE.md` §5).

## 4. When we save

| Trigger | Slot |
|---|---|
| Autosave every 60 s while playing (skipped if nothing changed) | autosave slot |
| `mission:completed`, level-up, money change > 0 | autosave slot |
| Manual save from the pause menu | slot 0 |
| `beforeunload` / `visibilitychange → hidden` | autosave slot |

Writes are cheap (a `JSON.stringify` of a few KB), but they are still throttled to at most one per 5 s to avoid a burst during a chain of events. Every successful write emits `save:written` → a small HUD toast, so persistence is visible rather than magic.

## 5. Load

```
1. read(slot) → null?                       → new game
2. JSON.parse in try/catch → throw?         → corrupt: quarantine + new game (§6)
3. validate(shape)                          → fail: quarantine + new game
4. version < CURRENT ? migrate() : version > CURRENT ? refuse (newer build) : ok
5. worldSeed mismatch                       → refuse to place; offer New game / Keep progress, reset position
6. worldDataVersion mismatch                → keep economy/missions-completed, re-validate active mission
                                               against current anchors; invalidate it if its anchors are gone
7. apply to GameState, then let systems read it in init (streaming prewarms around the loaded position)
```

Placement safety: the loaded player position is validated with `physics.overlapSphere`; if it is inside geometry (world changed under the save), the player is moved to the nearest free sidewalk point (`PLAYER_ARCHITECTURE.md` §9).

## 6. Corruption and hostile input

The save is user-writable — treat it as untrusted input, not as our own data.

- **Validate every field**: type, finite numbers, ranges (money ≥ 0 and below a sanity ceiling, positions within world bounds, hour ∈ [0,24), ids present in the current content tables). Unknown extra keys are dropped. Unknown mission/item ids are dropped with a warning, not loaded.
- **Quarantine, never delete**: a bad save is copied to `mow.save.corrupt.<ts>` (capped at 2 kept) before being replaced, so a player who reports a bug still has the data.
- A quarantine event surfaces a dismissible notice: "Your saved game couldn't be read and has been reset." Never a silent wipe, never a crash (`ARCHITECTURE.md` §8).
- Quota exceeded (`QuotaExceededError`): drop the oldest quarantine copies, retry once, then notify that saving is unavailable and continue playing.
- Storage entirely unavailable (private mode, blocked cookies): detect at boot with a probe write, run in **ephemeral mode** with a persistent notice, and disable the save buttons rather than failing on each attempt.

## 7. Versioning and migration

```ts
const MIGRATIONS: Record<number, (old: any) => any> = {
  // 1: (v1) => ({ ...v1, version: 2, newField: default }),
};
function migrate(data: any): SaveFileV1 { /* apply chain until CURRENT_VERSION */ }
```

Rules:
- `version` is bumped for any change that old data cannot satisfy; additive optional fields do not need a bump (they default).
- Migrations are pure functions, unit-tested with a stored fixture per historical version (`TESTING_STRATEGY.md`). Fixtures are committed and never edited.
- Loading a save from a *newer* build is refused with a clear message rather than guessed at.
- The migration chain is never rewritten retroactively; broken migrations are fixed by adding a new version.

## 8. New game

Explicit `newGame()` builds `GameState` from `data/balance.ts` defaults and the authored start anchor (home lane), writes an initial save, and prewarms the world. Starting a new game over an existing save requires a confirmation and quarantines the old file first.

## 9. Multiple slots

The data model and store interface support slots from day one; the MVP UI exposes one manual slot plus the autosave. Adding a slot picker later is UI-only work.

## 10. Explicitly not built

Cloud saves, accounts, save export/import files (a post-MVP "copy save to clipboard as JSON" is trivial if wanted), encryption or anti-tamper (single-player; cheating is the player's business), and save compression (unnecessary at kilobytes).
