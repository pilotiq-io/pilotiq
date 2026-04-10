# Pilotiq Playground (Free)

Development fixture for the **free** open-source `@pilotiq/{panels,lexical,media,workspaces}` stack running on top of the RudderJS framework.

**No `@pilotiq-pro/*` packages.** No AI chat sidebar, no `✦` field actions, no real-time collab. `RichContentField` runs in local-only mode via the `useYjsCollab` stub (`isCollab: false`).

## Running

```bash
# Ensure rudderjs packages are built first
cd ~/Projects/rudderjs && pnpm build

# Then
cd ~/Projects/pilotiq/playground
pnpm install          # from pilotiq root, or here
pnpm exec prisma generate
pnpm exec prisma db push   # fresh dev.db
pnpm dev              # http://localhost:3001
```

Port **3001**, HMR **24679**.

## What it demos

- `/admin` — panels admin with ArticleResource, CategoryResource, TodoResource, UserResource, WorkspaceResource, MediaResource
- Lexical rich-content editing (local-only, no WS/IDB persistence)
- Media uploads via `MediaPickerField`
- Workspaces
- All panels demo pages (tables, forms, fields, sections, dialogs, etc.)

## Cross-repo wiring

`@rudderjs/*` deps resolve via `pnpm.overrides` in `pilotiq/package.json` to `link:../rudderjs/packages/<name>`. `@pilotiq/*` deps resolve as workspace siblings.

## See also

- `~/Projects/rudderjs/playground` — pure framework demo (:3000)
- `~/Projects/pilotiq-pro/playground` — full-stack pro demo (:3002)
- `pilotiq/docs/plans/phase-6-playground-extraction.md` — the plan behind the three-playground split
