# Presets & tokens

## The one call

```ts
Pilotiq.make('Admin')
  .path('/admin')
  .theme({
    preset:       'nova',          // default | nova | maia | lyra
    baseColor:    'cream',         // neutral scale (default sentinel + 6, incl. cream)
    accentColor:  'terracotta',    // primary accent (17 incl. terracotta)
    chartPalette: 'terracotta',    // --chart-1..5 series (6; 'default' is a no-op)
    radius:       'medium',        // none | small | medium | large | full-ish (5 steps)
    fonts:        { heading: 'Satoshi', body: 'Inter' },
    iconLibrary:  'lucide',
    cssVariables: { '--primary': 'oklch(0.62 0.14 35)' },  // raw token overrides
  })
  // …
```

Everything is optional. `resolveTheme()` applies them in layers — **preset → base → accent → chartPalette → cssVariables** — so a single `cssVariables` entry overrides whatever a preset set.

## The default is the Pilotiq brand

No `.theme()` call → the **Pilotiq brand** preset:

- paper-white page background, cream sidebar
- **terracotta** (`#d97757`) primary, ink (`#1a1a1a`) text
- **Satoshi** heading + body font, loaded from the Fontshare CDN

It matches the pilotiq.io marketing tokens. There's no auto-fallback to a generic gray theme — the brand is the baseline. Override piecemeal (e.g. just `accentColor`) or wholesale (`cssVariables`).

## Fonts

`fonts: { heading?, body? }`. **Satoshi** is special-cased: the `+Head.tsx` font loader (and the theme-editor preview iframe) detect it by name and load it from Fontshare (`api.fontshare.com`); everything else loads from Google Fonts. The loader reads the *resolved* fonts (post-defaults), so Satoshi's stylesheet is requested whenever it's the resolved heading or body — even if you only overrode the other side. Resolver fallbacks: body/heading → `'Satoshi'`, radius → `'medium'`.

## OKLCH + raw tokens

All colors are OKLCH for perceptual uniformity. When you reach for `cssVariables`, write OKLCH and target the shadcn-style token names (`--primary`, `--background`, `--foreground`, `--muted`, `--border`, `--ring`, `--chart-1`…`--chart-5`, `--radius`, …). These emit into both `:root` and `.dark` via `generateThemeCSS()` (with `!important` so they win over Tailwind defaults).

## Light / dark — handled for you

`ThemeProvider` (mounted in the generated `+Layout.tsx`) manages light / dark / system, persists to `localStorage['pilotiq-theme']`, and a `ThemeToggle` sits in the layout header. An inline `<script>` in `+Head.tsx` sets `.dark` before hydration so there's no flash. You don't author dark-mode CSS — define your tokens once; the preset/derivation covers both modes.

## Chart palette is live

The `chartPalette` series populates `--chart-1..5`, which drive `@pilotiq/recharts` `Chart`s and `Stat` sparklines by default (no per-widget color needed). Set a per-chart `.color()` only to deviate from the palette.
