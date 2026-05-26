---
"@pilotiq/pilotiq": patch
---

feat(pilotiq): browser tab titles for every admin page

The auto-generated pages now emit a `+title.ts` (vike-react `title`, cascading
to every `(pilotiq)/` route, evaluated on both SSR and SPA navigation). The
document `<title>` reads a per-role title stamped server-side by the page-data
builders, formatted as `Page · Brand`:

- List → the resource label (`Articles`)
- Create → `Create <singular>` (`Create Article`)
- Edit → `Edit <record>` (`Edit Hello World`)
- View → the record title (`Hello World`)
- Global → the global label; custom / record sub-pages → the page label
- Relation + nested-relation roles mirror these off the manager label / child title
- Dashboard → the dashboard page label, or `Dashboard`

Pages that don't stamp a title fall back to the breadcrumb chain, then a level-1
heading, then the panel brand alone. No configuration required.
