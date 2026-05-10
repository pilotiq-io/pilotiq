---
'@pilotiq/pilotiq': minor
---

feat(core): `Pilotiq.layoutProvider(C)` — plugin-mounted layout-root providers

Adds an open-core registry where plugins can register React provider
components that wrap the panel's `<AppShell>` children at the layout
root. Removes the per-app requirement that consumers manually wrap
their `pages/+Layout.tsx` to make plugin contexts available outside
specific component slots.

```ts
// In a plugin's register(panel) step:
panel.layoutProvider(({ children, basePath }) =>
  <AiUiProvider panelPath={basePath}>{children}</AiUiProvider>
)

// or bulk:
panel.layoutProviders([Provider1, Provider2])
```

Provider components receive `{ children, basePath? }` props.
Registration order is preserved — the first-registered provider sits
OUTERMOST (closest to the layout root); the last sits INNERMOST
(closest to the page tree). Use this when one provider depends on
another being in scope: register the producer first.

**Mirrors the `panel.rightPanel(...)` pattern** — Vite plugin
harvests the live component refs into `_components.ts` (alongside
`componentRegistry` + `rightPanelRegistry`) as `layoutProviderRegistry`,
the auto-gen `+Layout.tsx` template threads it as
`<AppShell layoutProviderRegistry={...}>`, and `AppShell` folds the
registry around its rendered tree from last to first so the first
provider ends up outermost. Empty / unset → no wrapping happens.

The first consumer is `@pilotiq-pro/ai` (≥ next minor), which uses
this to auto-mount `<AiUiProvider>` so the cross-package
`PendingSuggestionsContext` queue and `<AiClientToolBindings>`
handlers reach the form tree without a per-app `+Layout.tsx` edit.
Apps on this version of pilotiq core can drop the manual `<AiUiProvider>`
wrap they were carrying as a load-bearing requirement.
