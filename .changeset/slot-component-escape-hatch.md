---
"@pilotiq/pilotiq": minor
---

Add `SlotComponent` schema element + `registerSlotComponents()` runtime registry — a generic escape hatch for plugin-contributed React components in any schema slot. Use cases: custom resource-page header chips (bookmark / env badge / region picker / etc.), custom toolbar widgets, sidebar contributions, anywhere `Action` / `ActionGroup` would otherwise live. The element ships only `{ component: string, props: Record<string, unknown> }` on the wire; the renderer looks up the registered component at mount time. Subpath `@pilotiq/pilotiq/slot-components` (parallel to `/widgets` and `/entries`) keeps registration off the Node-only boot path. Heading children, alert footer, empty-state footer, and table bulk-toolbar filters all widen to pass `slotComponent` alongside `action` / `actionGroup` so the same primitive works at every action-row site.
