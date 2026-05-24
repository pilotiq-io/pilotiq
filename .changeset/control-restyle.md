---
'@pilotiq/pilotiq': minor
---

feat(pilotiq): align form controls to the shadcn input/button spec + tighter default spacing

Brings every text/control surface onto the shadcn component look for a more consistent, denser admin UI:

- **Inputs / Select / Textarea / field inputs** (`Input`, `SelectTrigger`, `Textarea`, plus the `DateField` trigger, `ColorPicker` swatch, `TagsInput`, and the Tiptap text chrome) → `h-8`, `rounded-lg`, `px-2.5`, `ring-3` focus, no drop shadow — matching the shadcn.com control set. The standalone `<Input>` was previously `h-9`.
- **Filters & Actions buttons** now use the shared shadcn button styling: the table toolbar's Filters triggers render via `buttonVariants({ variant: 'outline' })` (wrapped in `cn()` so `tailwind-merge` keeps the outline border), and `actionButtonClass` emits the `<Button>` chrome (`rounded-lg`, focus ring, `active:translate-y-px`, `h-8`/`h-7`/`h-9` sizes) while keeping the richer Action color palette (primary/destructive/success/warning/info + outlined).
- **Toolbar consistency**: the group-by / sort pickers drop `size="sm"` so they render at the default `h-8`, matching the search input.
- **Default spacing** density tightened — the default `vega` preset now resolves `--spacing` to `0.25rem` (Tailwind's stock unit) instead of `0.3rem`, so every `p-*`/`gap-*`/`m-*` tightens uniformly. Matches the theme-editor preview, which already used `0.25rem`.

No public API changes.
