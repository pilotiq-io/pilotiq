---
"@pilotiq/pilotiq": minor
---

Ship `@pilotiq/pilotiq/styles/theme.css` — the Tailwind v4 theme bridge every consumer needs: maps the panel's injected CSS variables (`--background`, `--sidebar`, …) into Tailwind theme tokens so component utility classes (`bg-background`, `border-border`, `bg-sidebar-accent`, …) resolve, seeds the Pilotiq-brand default values for first paint, and registers the `dark` custom variant the ThemeProvider toggles. Previously this ~115-line block lived only in the playground's CSS — fresh installs following the docs got structure with no colors (caught by the pilotiq-demo install-test). Import it after `tailwindcss` in your main CSS: `@import "@pilotiq/pilotiq/styles/theme.css";`
