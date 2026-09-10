# CLAUDE_WORKFLOW — how Claude works in this repository

This document exists to make future sessions cheap. Read it, then `TASKS.md`, then only the files the task touches.

---

## 1. Session start (always the same three steps)

1. Read **`TASKS.md`** — find the first task whose dependencies are `done` and whose status is `todo`.
2. Read the **specific architecture document** that task names (one document, not the set).
3. Read **only the files listed in the task's "expected files"**, plus anything they directly import that you must change.

Do **not** re-read the whole `docs/` set. Do **not** scan `src/`. Do **not** re-derive architecture — it is written down; if a document is wrong, fix the document as part of the task.

## 2. The loop

```
inspect (only what's relevant)
   ↓
identify the root cause / the smallest change that satisfies the acceptance criteria
   ↓
implement
   ↓
run the task's validation command
   ↓
error?  →  read the actual error, form a hypothesis, make one targeted fix, re-run
   ↓
acceptance criteria pass  →  commit  →  update TASKS.md status  →  stop
```

**Never** enter: change → error → different random change → new error → rewrite the file → new error. If two targeted fixes have not resolved an error, stop and state the diagnosis and the options rather than continuing to mutate code. That stop is cheaper than the third rewrite.

## 3. Rules

**Do**
- Work one task at a time, to its acceptance criteria, then stop.
- Prefer the smallest diff that is *correct* — not the smallest diff that hides the symptom.
- Fix root causes. A guard added around a bug you do not understand is a bug you now have twice.
- Keep modules inside their boundary (`ARCHITECTURE.md` §6) and the dependency direction (§3).
- Put constants in `data/`, strings in `data/strings/`, and content in data modules — not inline.
- Add or update the unit test the task names, in the same commit.
- Update the relevant `docs/` file **in the same commit** when an implementation decision differs from the plan, and add a `DECISIONS.md` entry for anything architectural.
- Report exactly: files changed, what changed, validation output, acceptance status.

**Do not**
- Rewrite or "clean up" working code that the task does not require touching.
- Refactor across module boundaries opportunistically.
- Add a dependency. Ever. Without an approved ADR (`TECH_STACK.md` §4).
- Create a second implementation of something that exists (search for it first — the module map in `ARCHITECTURE.md` §6 tells you where it lives).
- Add speculative abstractions, options, or "future-proofing" for requirements that do not exist.
- Change unrelated formatting (Prettier handles formatting; do not reflow files you did not edit).
- Bundle several tasks into one commit.
- Guess at a missing requirement. Ask, or state an assumption explicitly and proceed with the smallest reasonable interpretation.
- Leave `console.log`, commented-out code, or `TODO` without an owner and a task id.

## 4. Cost discipline

| Habit | Why |
|---|---|
| Read a file once, edit precisely | Re-reading the same file across a session is pure waste |
| Grep for a symbol instead of reading a directory | Targeted search is a fraction of the tokens |
| Trust `docs/` | It was written so you would not have to reconstruct it |
| Do not paste large files back in responses | Summarise the change; the diff is in git |
| Do not re-run the whole gate after a doc-only edit | Run the narrowest relevant check |
| Stop at acceptance | "While I'm here" is the most expensive phrase in this project |
| Keep prompts/answers short and specific | Long recaps are re-billed context |

## 5. Reporting format

At the end of every task, report in this shape and nothing more:

```
Task: T-x.y  <title>            Status: done | blocked
Changed:  path/a.ts (what), path/b.ts (what)
Added:    tests/unit/x.test.ts
Validation: npm run <cmd> → pass (or the failing output, verbatim)
Acceptance: each criterion → met / not met
Notes: only what the next session must know (a deviation, a follow-up task id)
```

## 6. When something is wrong with the plan

The documents are not sacred; they are just cheaper than rediscovery. If a task's design turns out to be wrong:

1. Stop implementing.
2. State the problem, the evidence, and 1–2 options with a recommendation.
3. Get a decision.
4. Record it in `DECISIONS.md`, update the affected document, adjust `TASKS.md`.
5. Then implement.

Silently implementing something different from the documents is the worst outcome, because the next session will trust the document.

## 7. Approval gates

Claude must **ask before**:
- adding any dependency;
- changing the stack, the world size, the streaming model, the save format version, or any ADR;
- introducing a new objective primitive, a new system module, or a new folder;
- committing anything that fails the gate;
- creating a pull request (only when explicitly asked);
- doing work not represented by a task in `TASKS.md`.

Claude may proceed **without asking** on: implementing a `todo` task as specified, fixing a failing test caused by that task, adding tests, tuning values that live in `data/balance.ts`, and updating documentation to match what was implemented.

## 8. Git hygiene per task

One task, one commit (or a small series with a clear final state). Conventional-ish messages tied to the task id:

```
feat(player): add third-person movement state machine (T-2.2)

- capsule sweep integration at fixed 60 Hz
- walk/run/jump/fall states with coyote time and jump buffer
- constants moved to data/balance.ts

Validation: npm run check → pass
```

Branch naming, merge policy and rollback are in `GITHUB_WORKFLOW.md`.

## 9. Anti-pattern catalogue (things that have to be avoided by name)

- **The rewrite reflex.** A failing build is not a reason to rewrite a file. Read the error.
- **The parallel implementation.** Two chunk managers, two input handlers, two prompt systems. Search before you write.
- **The silent dependency.** `npm i something` to solve a 30-line problem.
- **The god file.** `main.ts` or a "manager" that accumulates logic because it was convenient.
- **The un-scoped refactor.** Renaming across 20 files while implementing a feature, making the diff unreviewable.
- **The forgotten disposal.** Adding scene objects, listeners, or audio nodes without a `dispose` path.
- **The magic number.** A tuning constant compiled into logic where nobody will find it.
- **The optimism commit.** Committing without running the gate because "it's a small change".
