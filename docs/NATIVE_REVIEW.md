# Native review (UI + Gradendex)

Short workflow for native speakers who want to finetune copy without knowing the codebase.

## Where strings live

- **General UI:** `packages/frontend/src/i18n/locales/<lang>.json`
- **Gradendex (plants/structures):** translated entries live in `packages/frontend/scripts/gradendex-entries-overrides/<lang>.json` (where present). Then run `npm run gradendex:extra` in `packages/frontend` and commit the generated `src/i18n/gradendex.<lang>.json` files (CI will fail otherwise).
- **Gradendex (English source):** `packages/frontend/src/i18n/gradendex.en.json` — change names/structure here first, then update other languages (overrides).

## Per-language checklist

1. Keep the same placeholders (`{{name}}`, `{{count}}`, etc.) — do not remove or rename them.
2. Tone: short on buttons and labels; a bit more room in `long_desc` / help.
3. Gradendex: keep plant and structure names consistent with the rest of the UI.
4. In the app, switch to the language (settings) and check critical screens: login, garden, leaderboard, Gradendex.

## After review

- Small fixes: edit `locales/<lang>.json` or `gradendex-entries-overrides/<lang>.json` + run `npm run gradendex:extra`.
- Large changes to English source: update `gradendex.en.json` / `en.json` first, then per-language overrides and run `gradendex:extra` again.
