---
name: pilotiq-theme
description: Theming a pilotiq panel — `.theme()` (presets, base / accent colors, chart palette, radius, fonts), raw CSS-variable overrides, OKLCH brand defaults, and the `themeEditor()` plugin (live in-app editor with DB-persisted overrides)
license: MIT
appliesTo:
  - '@pilotiq/pilotiq'
trigger: calling `Pilotiq.theme({...})`, choosing or overriding a preset / base color / accent color / chart palette / radius / fonts, setting raw `cssVariables`, or wiring the `themeEditor()` plugin (the live theme editor with DB-persisted overrides)
skip: per-widget or per-chart colors (they follow the palette automatically — see `pilotiq-widgets` / the recharts guidelines); ad-hoc Tailwind class overrides on individual components
metadata:
  author: pilotiq
---

# Pilotiq Theme

## When to use this skill

Load when you're:

- Calling `Pilotiq.theme({ … })` to set a preset, base/accent colors, chart palette, radius, or fonts.
- Overriding individual design tokens via raw `cssVariables`.
- Matching a brand (the default *is* the Pilotiq brand — terracotta + Satoshi).
- Wiring the **`themeEditor()` plugin** — an in-app live theme editor that persists overrides to the database.

## Quick Reference

| Task | Open |
|---|---|
| `.theme()` options — presets, base / accent / chart palette / radius / fonts, raw `cssVariables`, OKLCH brand default, light/dark | `rules/presets-and-tokens.md` |
| `themeEditor()` plugin — nav link, DB-persisted overrides (`panelGlobal`), Reset to Defaults, works without `.theme()`, client-safe storage | `rules/theme-editor.md` |

## Key concepts (load once)

- **`Pilotiq.theme({ preset, baseColor, accentColor, chartPalette, radius, fonts, iconLibrary, cssVariables })`** — one call on the panel builder. Every field is optional; omitting `.theme()` gives the built-in **Pilotiq brand** preset.
- **`resolveTheme()` layers in order:** preset → base color → accent color → chart palette → raw `cssVariables`. Later layers win, so `cssVariables` is the ultimate escape hatch for any single token.
- **All colors are OKLCH.** Perceptually uniform; the presets and `cssVariables` you write should be OKLCH too.
- **Chart palette drives real charts.** `--chart-1..5` from the chosen `chartPalette` color series — `@pilotiq/recharts` `Chart`s and `Stat` sparklines track it automatically. (Pre-`0.25` it only styled the editor preview; now it's wired to live charts.)
- **Light / dark / system is automatic.** `generateThemeCSS()` emits `:root {…} .dark {…}`; `ThemeProvider` manages the mode (localStorage), with an inline FOUC-prevention script so there's no flash on load. You don't manage dark-mode CSS.
- **`themeEditor()` is opt-in and independent of `.theme()`.** It works even with no `.theme()` call (seeds the default preset), persists overrides to the `panelGlobal` table, and adds a "Theme" nav link. See its rule file.

## Examples

- `playground/app/Pilotiq/AdminPanel.ts` — `.theme({ … })` + `.plugins([themeEditor()])`.
