# Development

Working on Pilotic locally — including the cross-repo dev loop with `rudderjs/rudder`.

## Repo layout

Pilotic depends on `@rudderjs/*` framework packages from npm. For most contributors that's all you need. But for active development that touches both Pilotic and the underlying framework simultaneously, you'll want all three repos as siblings:

```
~/Projects/
├── rudderjs/         # the framework (github.com/rudderjs/rudder)
├── pilotic/          # this repo (github.com/pilotic/pilotic)
└── pilotic-pro/      # private pro packages (github.com/pilotic/pilotic-pro)
```

The sibling layout is what makes the `pnpm.overrides` recipe below work — relative paths are short and stable.

---

## Standard workflow (no framework changes)

```bash
cd ~/Projects/pilotic
pnpm install
pnpm build
pnpm test
pnpm dev
```

`@rudderjs/*` packages come from npm. You don't need a local clone of `rudderjs/rudder` unless you're changing framework code.

---

## Cross-repo workflow (active framework dev)

When you're iterating on `@rudderjs/core` (or any other framework package) AND need Pilotic to pick up the changes immediately — without publishing to npm — use `pnpm.overrides` to point at a local clone.

### Setup

1. Clone `rudderjs/rudder` as a sibling to this repo:
   ```bash
   cd ~/Projects
   git clone https://github.com/rudderjs/rudder.git rudderjs
   cd rudderjs
   pnpm install
   pnpm build
   ```

2. Add overrides to this repo's root `package.json` (uncomment the block below — keep it commented in committed `package.json` so CI uses npm versions):

   ```jsonc
   {
     "pnpm": {
       "overrides": {
         "@rudderjs/core":   "link:../rudderjs/packages/core",
         "@rudderjs/router": "link:../rudderjs/packages/router",
         "@rudderjs/orm":    "link:../rudderjs/packages/orm",
         "@rudderjs/auth":   "link:../rudderjs/packages/auth"
       }
     }
   }
   ```

3. Re-install:
   ```bash
   pnpm install
   ```

4. Iterate. Edit framework code in `~/Projects/rudderjs/packages/core/src/...`, run `pnpm build` in that package, then re-run whatever Pilotic command picks up the change. Vite HMR works through the link for frontend changes.

### Tear down before committing

**Always remove the overrides before committing.** CI must use the published npm versions, not your local clone.

```jsonc
// Remove or comment out the entire "pnpm.overrides" block before:
//   - git commit
//   - opening a PR
//   - running `pnpm release`
```

---

## TypeScript strict mode notes

Pilotic and RudderJS both use:
- `"strict": true`
- `"exactOptionalPropertyTypes": true`
- `"noUncheckedIndexedAccess": true`

These must match across both repos for cross-repo `pnpm.overrides` to typecheck cleanly. If you see strange "type ... is not assignable" errors at the boundary, check that `tsconfig.base.json` is in sync between `~/Projects/rudderjs/` and `~/Projects/pilotic/`.

See [`feedback_exactoptional.md`](https://github.com/rudderjs/rudder) (memory note) for the canonical example of how `exactOptionalPropertyTypes` interacts with `undefined` in optional props.

---

## Production build pitfalls

These apply to both repos:

- **`node:crypto` lazy-load**: top-level `import { randomUUID } from 'node:crypto'` gets externalized by Vite during client bundling and crashes the browser at module load. Lazy-import via `import('node:crypto')` only when needed server-side.
- **WebSocket upgrade at module load**: don't open ws connections during module evaluation; defer to first render.
- **Vite externals for `node:` builtins**: must be configured in the Vite config so they don't end up in the client bundle.

---

## Vendor publish flow (`pnpm rudder vendor:publish`)

Pilotic packages publish files (schemas, pages, translations) into the consuming app's tree via the `@rudderjs/cli` `vendor:publish` command. Tags used by this repo:

| Tag | Purpose | Owner |
|---|---|---|
| `pilotic-schema` | Prisma/Drizzle schema files | `@pilotic/panels` |
| `pilotic-pages` | Vike pages + components for the panel UI | `@pilotic/panels` |
| `pilotic-translations` | Starter `lang/<locale>/pilotic.json` for i18n overrides | `@pilotic/panels` |
| `pilotic-ai-pages` | Chat UI components (sidebar, dropdown, agent renderer) | `@pilotic-pro/ai` |

After editing any file under `packages/panels/pages/`, re-run the publish command from the consuming app:

```bash
cd path/to/your-app
pnpm rudder vendor:publish --tag=pilotic-pages --force
```

**Important**: edits to `packages/panels/pages/` aren't HMR'd in the consuming app — they're vendored copies. The `--force` flag is required to overwrite the existing copies.
