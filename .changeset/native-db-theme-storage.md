---
"@pilotiq/pilotiq": minor
---

Add `databaseThemeStorage` — ORM-agnostic theme persistence over any rudder ORM adapter's `query(table)` builder (native engine, Drizzle). Exported from `@pilotiq/pilotiq/plugins` alongside `prismaThemeStorage`; accepts the adapter directly or a lazy `() => app().make('db')` thunk. `load()`/`clear()` tolerate a missing `panelGlobal` table so `rudder migrate` can boot the app before the table exists. The themeEditor's implicit storage fallback now tries the `'db'` container binding when no `'prisma'` binding is present.

Also hide two server-only dynamic imports from Vite's client import-analysis (variable specifier + `@vite-ignore`): `PilotiqServiceProvider`'s `@rudderjs/router` boot import and `schema/sanitize.ts`'s `sanitize-html` — both were being lazily discovered through the generated `_components.ts` client graph, causing a mid-session "new dependencies optimized" reload on first page load.
