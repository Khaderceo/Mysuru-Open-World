# LOCALIZATION_PLAN — English and Kannada

Mysuru is a Kannada-speaking city; bilingual text is part of the game's identity, not an afterthought. The architecture supports it from day one; the full Kannada translation pass lands in Phase 10.

---

## 1. Rules

1. **No user-visible string literal exists anywhere in `src/` outside `data/strings/`.** Every string is referenced by a typed `StringId`.
2. Locales are `en` (source of truth) and `kn` (ಕನ್ನಡ).
3A missing `kn` entry falls back to `en` and logs once in dev. Never renders an empty string, never renders a raw id in production (production shows the `en` fallback).
4. In-world signage textures are bilingual **art**, not localized text — Kannada primary with English secondary, exactly as Mysuru's streets look, regardless of UI language.

## 2. Data shape

```ts
// data/strings/en.ts
export const en = {
  'ui.prompt.talk':        'Talk',
  'ui.prompt.enter':       'Get in',
  'ui.prompt.exit':        'Get out',
  'ui.prompt.exit.fast':   'Slow down to get out',
  'ui.hud.money':          '₹{amount}',
  'ms.tiffin.title':       'Tiffin Run',
  'ms.tiffin.o3':          'Drive to the Palace gate',
  'ms.complete.reward':    'Earned ₹{amount}',
  // …
} as const;

export type StringId = keyof typeof en;      // every id is compile-time checked
```

`kn.ts` is `Partial<Record<StringId, string>>`, so a translation can never invent an id and a typo fails the build. This compile-time link is the main reason strings are TS modules rather than JSON (`DECISIONS.md` ADR-011).

## 3. API

```ts
t('ui.hud.money', { amount: fmtMoney(1240) })   // → "₹1,240"
```

- One function, one active locale, a small `{placeholder}` interpolation. No ICU message format, no plural rule engine in the MVP — where a plural matters, two explicit ids are used (`ms.collect.one` / `ms.collect.many`). If plurals proliferate, `Intl.PluralRules` (built into the browser, zero KB) is the documented next step.
- Numbers, currency and dates use `Intl.NumberFormat` / `Intl.DateTimeFormat` with the active locale (`en-IN` and `kn-IN`), which gives correct Indian digit grouping (₹1,20,000 lakh-style) for free.
- DOM elements carry `data-i18n="id"`; a locale switch re-resolves every marked element in place — no reload, no remount (`UI_ARCHITECTURE.md` §9).
- The locale choice is persisted in settings and defaults from `navigator.language` (`kn*` → Kannada, else English).

## 4. Kannada specifics

- **Font.** Kannada requires a font with proper Kannada glyph coverage and conjunct shaping. Plan: self-host a subset of **Noto Sans Kannada** (SIL Open Font License 1.1 — permissive, redistributable) as WOFF2, subset to the glyphs the game actually uses, loaded only when the Kannada locale is active. Expected ~120–250 KB subset. `font-display: swap`, with a system fallback stack.
- **Layout.** Kannada strings are typically 15–40 % longer and taller than English. Therefore: no fixed-height text containers, no `overflow: hidden` on text without an ellipsis + `title`, line-height set with room for conjuncts (`line-height: 1.5` minimum on Kannada text), and all panels tested in both locales as part of UI acceptance.
- **Mixed content.** Numbers and ₹ amounts stay in Latin/Devanagari-free digits (standard practice); no transliteration of the player's money.
- **Quality.** Machine translation is used only as a first draft and is clearly marked `// TODO: review` in `kn.ts`. Shipping unreviewed machine Kannada in a game about Mysuru would undercut the whole point, so Phase 10 includes a human review pass as an explicit task (`TASKS.md` T-10.3).

## 5. What is localized

| Localized | Not localized |
|---|---|
| All HUD, menus, settings, prompts, toasts, notices | In-world signage textures (bilingual art) |
| Mission titles, briefs, objective labels | Asset keys, ids, debug output, console logs |
| Dialogue lines and speaker names | Credits/licence text (English, legal accuracy) |
| Error/notice messages shown to players | Commit messages, docs, code comments |
| Landmark and place names (both scripts) | — |

Place names appear in both scripts where they are shown as labels (e.g. "Mysore Palace / ಮೈಸೂರು ಅರಮನೆ") because that is how the city signs itself.

## 6. Coverage gates

- A unit test asserts every `StringId` used in `src/` exists in `en` (catches typos and dead ids).
- A second test reports `kn` coverage as a percentage and fails below the Phase-10 target (100 % for UI, 100 % for MVP mission text).
- No test fails on missing `kn` before Phase 10 — the architecture is required early, the content is not.

## 7. Adding a language later

Adding a third locale is: one `data/strings/<code>.ts`, one entry in the locale registry, a font check, and a layout pass. No code changes. Nothing about this plan is English-specific except the choice of `en` as the id-defining source.
