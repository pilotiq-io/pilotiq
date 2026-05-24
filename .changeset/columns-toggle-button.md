---
'@pilotiq/pilotiq': patch
---

refactor(pilotiq): table "Columns" toggle trigger uses the shadcn `<Button>` styling

Routes the toolbar Columns dropdown trigger through `cn(buttonVariants({ variant: 'outline' }))` so it matches the Filters trigger and the rest of the `h-8` / `rounded-lg` control row. (The active-filters "Clear all" stays a subtle text link by design.)
