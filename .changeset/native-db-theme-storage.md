---
"@pilotiq/pilotiq": minor
---

Add `databaseThemeStorage` — ORM-agnostic theme persistence over any rudder ORM adapter's `query(table)` builder (native engine, Drizzle). Exported from `@pilotiq/pilotiq/plugins` alongside `prismaThemeStorage`; accepts the adapter directly or a lazy `() => app().make('db')` thunk. `load()`/`clear()` tolerate a missing `panelGlobal` table so `rudder migrate` can boot the app before the table exists. The themeEditor's implicit storage fallback now tries the `'db'` container binding when no `'prisma'` binding is present.
