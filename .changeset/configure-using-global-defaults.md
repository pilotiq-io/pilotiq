---
"@pilotiq/pilotiq": minor
---

Add `Element.configureUsing()` — Filament-style app-wide defaults for a primitive class. Register a callback once and it runs on every instance created via `.make()` afterward, before any per-instance setter (so an explicit call still overrides the default):

```ts
TextColumn.configureUsing(c => c.toggleable())
TextField.configureUsing(f => f.columnSpan(1).maxLength(255))
```

Configurators are keyed by class name on `globalThis` (survives Vite SSR module duplication), stack in call order, and apply ancestor-class registrations before descendant-class ones so the more specific class wins (`Field.configureUsing` runs before `TextField.configureUsing`). `Element.resetConfigurators(className?)` clears them (test seam). v1 is wired on `Field` and `Column` subclasses — the primitives most commonly configured app-wide; other Element subclasses opt in by funnelling their `make()` through `this.configured(...)`.
