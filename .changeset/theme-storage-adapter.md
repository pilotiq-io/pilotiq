---
'@pilotiq/pilotiq': minor
---

refactor(theme): decouple theme override persistence behind a `ThemeStorageAdapter`

`PilotiqServiceProvider` and the theme editor's PUT/DELETE routes used to hard-code Prisma — `app.make('prisma') as any` + `prisma.panelGlobal.{findUnique,upsert,delete}` — which broke the ORM-agnostic story (`@rudderjs/orm` works fine on Drizzle) and put the only non-test `as any` in the codebase in a hot path. The bare `catch {}` around the boot-time load also swallowed real misconfiguration (misnamed `panelGlobal` schema, Prisma client not connecting) as silently as it swallowed "no overrides persisted yet".

This release introduces a `ThemeStorageAdapter` interface — `{ load(), save(overrides), clear() }` — and a `prismaThemeStorage(prisma, { slug })` factory. Pass an explicit adapter via the new `themeEditor({ storage })` option:

```ts
import { themeEditor, prismaThemeStorage } from '@pilotiq/pilotiq/plugins'

Pilotiq.make('Admin')
  .use(themeEditor({
    storage: prismaThemeStorage(prisma, { slug: 'admin__theme' }),
  }))
```

Apps on Drizzle, a KV store, or filesystem JSON can implement the three methods themselves; the panel only cares about the adapter shape.

**Back-compat / deprecation.** Calling `themeEditor()` without `storage` still works for one minor cycle: the service provider falls back to the implicit Prisma adapter at boot, logs a one-time deprecation warning naming the panel, and proceeds as before. The fallback branch will be removed in a future minor — pass `storage` explicitly to silence the warning. Explicit adapters propagate errors normally; the implicit fallback continues to swallow connection / schema errors for back-compat.

Tests: new `theme/storage.test.ts` covers the Prisma adapter round-trip (load / save / clear + P2025 "row not found" tolerance + non-P2025 error propagation) and `plugins/themeEditor.test.ts` confirms the option wires the adapter onto the panel.
