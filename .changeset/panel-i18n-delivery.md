---
'@pilotiq/pilotiq': minor
---

Add a **panel-i18n delivery channel** so plugin and core UI strings can be localized, following rudder's "Bundled translations & overrides" convention (resolve server-side, ship the merged object as data, never recompute on the client).

Core owns no strings and runs no translation — it's purely the delivery channel the convention's point #6 calls for ("make sure the layout's data source includes i18n"):

- **`registerPanelI18n(namespace, resolve)`** (`@pilotiq/pilotiq/i18n`) — a package registers its own **sync** `(locale) => mergedStrings` resolver (its bundled `src/i18n/<locale>.ts` defaults deep-merged with `@rudderjs/localization` overrides). globalThis-backed (SSR-dup-safe).
- **Server delivery** — `panelInfo()` resolves the active locale once per request (via an optional `@rudderjs/localization` soft-import — zero hard dep; falls back to `'en'` when absent), calls every registered resolver, and ships the merged objects sparsely on `viewProps.panel.i18n`.
- **`usePanelI18n<T>(namespace)`** (`@pilotiq/pilotiq/react`) — reads a namespace's server-resolved object. Mounted via `<PanelI18nProvider>` in `AppShell` (with a `__pilotiqPanelI18n` window-global mirror for out-of-tree popovers). Returns `undefined` when a namespace wasn't shipped, so consumers fall back to their own client-bundled `en` defaults (`?? en`).

This is the bridge that lets `@pilotiq-pro/ai` (and any plugin — e.g. a Tiptap slash-menu) localize its UI labels: that package keeps its typed bundled defaults + sync resolver + provider preload locally and just registers the resolver here. Guide: `docs/guide/panel-i18n.md`.
