# GITHUB_WORKFLOW

Deliberately simple. Every meaningful milestone must be recoverable; nothing else matters.

---

## 1. Branches

| Branch | Role |
|---|---|
| `main` | **Stable, deployable, always green.** Every commit on `main` has passed `npm run check` and is auto-deployed (`DEPLOYMENT.md`). |
| `claude/<topic>-<id>` | Working branches used by Claude Code Web sessions (the session's designated branch). |
| `feat/<slug>` | Substantial feature work spanning several tasks. |
| `fix/<slug>` | Bug fixes. |
| `docs/<slug>` | Documentation-only changes. |

Rules:
- **Never commit directly to `main`** except for a documentation typo fix.
- **Never force-push `main`**, and never force-push a branch someone else may have checked out.
- One branch per phase or per coherent group of tasks — not one per task (branch churn costs more than it saves here).
- Delete branches after merge.

## 2. Commits

Format: `<type>(<scope>): <summary> (<task-id>)`

```
feat(world): add 128 m chunk streaming with budgeted builds (T-3.4)
fix(camera): clamp pitch before the collision probe (T-2.6)
perf(city): merge chunk geometry per material (T-11.2)
docs(arch): record the minimap decision as ADR-010
test(save): add v1→v2 migration fixture
chore(build): pin three to r1xx
```

Types: `feat` `fix` `perf` `refactor` `test` `docs` `chore`. Scopes match module names in `ARCHITECTURE.md` §6.

Body (when useful): what changed, why, and the validation result. Never a wall of restated code.

**Milestone commits** additionally carry the milestone in the summary and the acceptance checklist in the body:

```
feat(player): M2 — player can walk, run and jump in the test world

Acceptance (MVP_ACCEPTANCE / M2):
- [x] WASD moves relative to camera
- [x] Shift runs; Space jumps to ~0.55 m
- [x] capsule collides with boxes, slides on walls, steps 0.35 m kerbs
- [x] 60 FPS in the test scene, 0 frames > 33 ms
Validation: npm run check → pass
```

## 3. Merge policy

- Merge a working branch into `main` only when the gate is green and the phase's acceptance criteria pass.
- **Squash-merge** working branches by default: `main` gets one clean, revertible commit per coherent change, which makes rollback trivial. Keep individual commits (merge commit) only when the intermediate history is genuinely useful for bisecting a tricky feature.
- Pull requests are used when a review is wanted or when the work is large; they are **not required** and are **never created unless explicitly requested** (this repository's standing instruction).
- Never merge with a red gate, a skipped test, or a disabled check. If CI is broken for an unrelated reason, fix that first as its own change.
- Rebase (or merge `main` in) before merging so `main` stays linear-ish and the deploy reflects what was tested.

## 4. Tags and milestones

- Tag every milestone: `m1-scene`, `m2-player`, … through `m10-saveload`, then `v0.1.0` for the MVP release.
- Semantic-ish versioning after the MVP: `v0.MINOR.PATCH` while pre-1.0.
- A tag is the recovery point. If `main` ever gets into a bad state, the last milestone tag is a known-good build.

## 5. Rollback strategy

| Situation | Action |
|---|---|
| Bad deploy, code is fine | Re-run the deploy workflow at the last good ref (`DEPLOYMENT.md` §6) |
| Bad commit on `main` | `git revert <sha>` (a new commit, no history rewrite) → auto-deploys |
| A whole feature turned out wrong | Revert the squash commit; the branch still exists for salvage |
| Repository state confusing | `git checkout <last milestone tag>` into a new branch and re-land the good parts |
| Save-format regression shipped | Bump the save version and add a migration; never edit a released migration (`SAVE_SYSTEM.md` §7) |

Because each `main` commit is squashed and each milestone is tagged, rollback is always one command and never a rescue operation.

## 6. What belongs in the repository

**In:** `src/`, `tests/`, `docs/`, `public/` (optimized runtime assets only), config files, workflows, `ASSET_CREDITS.md`, `licenses/`, `package-lock.json`.

**Out:** `node_modules/`, `dist/`, `.vite/`, source art (`.blend`, PSD, uncompressed WAV/PNG masters — they belong in a separate archive; `ASSET_PLAN.md` §9), editor settings beyond a shared minimum, secrets of any kind, large binaries not used at runtime, generated files.

`.gitignore` is already the standard Node ignore set; `dist/` and `.vite/` must be confirmed covered when the project is scaffolded (T-1.1).

## 7. CI

`.github/workflows/ci.yml` on every push and pull request: `npm ci` then `npm run check` (`TESTING_STRATEGY.md` §1). Node version pinned. No matrix beyond the two Playwright browsers.

Branch protection on `main` (if the repository settings allow it): require the CI check to pass, disallow force pushes. If protection is unavailable, the same rules are followed by convention — the gate is the gate.

## 8. Documentation as part of the change

Any commit that changes behaviour described in `docs/` updates that document in the same commit. Any commit that makes an architectural decision adds an ADR to `DECISIONS.md`. Any commit that completes a task updates its status in `TASKS.md`.

This is not bureaucracy: `docs/` is the project's memory, and a stale document costs a future session more than the update costs now (`PROJECT_SPEC.md` §6).

## 9. Issues and planning

Optional and lightweight. `TASKS.md` is the authoritative task list — GitHub Issues, if used at all, are for bugs found during play testing and for post-MVP ideas, and they reference task ids rather than duplicating them. No project boards, no labels taxonomy, no templates beyond a bug report if one proves useful.
