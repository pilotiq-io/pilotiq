# Panel i18n

Pilotiq's admin chrome and its plugins render plenty of fixed UI strings —
"Discuss in chat", "Plan", "Top up", field-action labels, composer
placeholders. **Panel i18n** makes those strings translatable, following
rudder's [Bundled translations & overrides] convention exactly: **a package
owns its own typed defaults + a sync resolver; translations resolve
server-side and flow to the client as data.** The browser never loads a lang
file — it reads strings already resolved for the active locale.

Core (`@pilotiq/pilotiq`) is only the **delivery channel** (the convention's
point #6). It owns no strings and runs no translation. Each package that ships
UI strings keeps its own `src/i18n/` and registers a resolver.

```
get<Pkg>I18n(locale)            registerPanelI18n(ns, resolver)
  (sync, in the package)              (boot, server)
        │                                   │
        ▼                                   ▼
  bundled en.ts  +  overrides   ──▶   panelInfo() calls each resolver
  (deep-merge, cache server-only)     with the active locale
                                            │
                                            ▼
                            viewProps.panel.i18n  ──SSR──▶  <PanelI18nProvider>
                                                                  │
                                                       usePanelI18n<T>(ns) ?? en
                                                                  (client)
```

## In your package: bundled defaults + a sync resolver

This is the standard rudder package convention — see [Bundled translations &
overrides] for the full recipe. In short:

```ts
// src/i18n/en.ts — the canonical, type-safe schema
export const en = {
  selection:     'Selection:',
  discussInChat: 'Discuss in chat',
  askAgent:      'Ask {label}…',
}
export type AiI18n = typeof en
```

```ts
// src/i18n/index.ts — a SYNC resolver (render paths can't await)
import { en } from './en.js'
import { ar } from './ar.js'
import type { AiI18n } from './en.js'

const NAMESPACE = 'pilotiq-ai' // matches lang/<locale>/pilotiq-ai.json
const bundled: Record<string, AiI18n> = { en, ar }

export function getAiI18n(locale: string): AiI18n {
  const base     = locale.split('-')[0] ?? locale
  const base18n  = bundled[locale] ?? bundled[base] ?? en
  const override = readOverride(locale, NAMESPACE) // from __rudderjs_localization_cache__
  return override ? deepMerge(base18n, override) : base18n
}
```

Preload the override namespace in your service provider's `boot()` (so the
sync resolver sees overrides before the first render) and declare
`@rudderjs/localization` as an **optional** peer dependency. Both steps are in
the convention doc.

## Register the resolver with core

At boot (your plugin's `register(panel)` or a module load):

```ts
import { registerPanelI18n } from '@pilotiq/pilotiq/i18n'
import { getAiI18n } from './i18n/index.js'

registerPanelI18n('pilotiq-ai', getAiI18n)
```

The namespace must match `[A-Za-z0-9_-]+` — it doubles as the
`@rudderjs/localization` namespace (`lang/<locale>/pilotiq-ai.json`) and the
key your object lands under on `panel.i18n`. `@pilotiq/pilotiq/i18n` is a
client-safe entry, so a panel module re-imported on the client can call this at
module scope without pulling in the node-only main barrel.

## Read it in a component

```tsx
import { usePanelI18n } from '@pilotiq/pilotiq/react'
import { en, type AiI18n } from '../i18n/en.js'

function AiDropdown({ agentLabel }: { agentLabel: string }) {
  // Fall back to the client-bundled `en` when the namespace wasn't shipped.
  const t = usePanelI18n<AiI18n>('pilotiq-ai') ?? en
  return (
    <>
      <span>{t.selection}</span>
      <button>{t.discussInChat}</button>
      <input placeholder={t.askAgent.replace('{label}', agentLabel)} />
    </>
  )
}
```

> **Never recompute i18n on the client.** The `@rudderjs/localization` override
> cache is server-only — calling `getAiI18n()` in the browser yields bundled
> defaults and overwrites the SSR'd text during hydration. Always read the
> SSR'd object via `usePanelI18n`, with your client-bundled `en` as the `??`
> fallback. Interpolation (`{label}`) happens client-side because the dynamic
> value is only known there.

## How it ships

`panelInfo()` resolves the active locale once per request (inside the locale's
`AsyncLocalStorage` scope, via an optional `@rudderjs/localization`
soft-import — falling back to `'en'` when it isn't installed), calls every
registered resolver, and stamps the merged objects sparsely on
`viewProps.panel.i18n` — absent entirely when nothing is registered. `AppShell`
mounts `<PanelI18nProvider>` around the whole tree and mirrors the bundle to a
`window.__pilotiqPanelI18n` global so components rendered outside the React tree
(detached popovers, portals) still resolve via `usePanelI18n`.

[Bundled translations & overrides]: https://rudderjs.dev/docs/contributing/creating-a-package#bundled-translations--overrides
