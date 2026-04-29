# Pilotiq vs Nova, Payload

A feature-by-feature comparison against the closest alternatives in the admin/CMS space. Pilotiq is the youngest of the three — this page is honest about both where it leads and where it lags.

## Feature matrix

| Feature | Pilotiq | Nova | Payload 3.x |
|---|---|---|---|
| **Language / runtime** | TypeScript / Node.js | PHP / Laravel | TypeScript / Next.js |
| **Field types** | 25+ | 20+ | 20+ |
| **Rich text editor** | Lexical (blocks, slash cmds) | Trix / custom | Lexical (blocks, inline components) |
| **Real-time collab** | ✅ Yjs CRDT (pro) | ❌ | ❌ |
| **AI agent integration** | ✅ Built-in chat + field actions (pro) | ❌ | ✅ AI auto-embedding (enterprise) |
| **Inline table editing** | ✅ inline / popover / modal | ❌ | ❌ |
| **Draft/publish workflow** | ✅ | ❌ native | ✅ versions + drafts |
| **Soft deletes** | ✅ | ✅ | ✅ trash |
| **Version history** | ✅ JSON snapshots | ❌ | ✅ |
| **Dashboard builder** | ✅ drag-and-drop widgets | ✅ cards/metrics | ✅ widget fields |
| **i18n / RTL** | ✅ en + ar, auto-RTL | ✅ | ✅ |
| **Dark mode** | ✅ | ✅ | ✅ |
| **Plugin system** | ✅ `Panel.use()` | ✅ | ✅ |
| **Custom pages** | ✅ schema-driven + React | ✅ | ✅ Next.js pages |
| **Globals (settings)** | ✅ | ❌ native | ✅ |
| **Media library** | ✅ separate plugin | ✅ Vapor | ✅ uploads collection |
| **Relation managers** | ✅ | ✅ | ✅ |
| **Conditional fields** | ✅ `.showWhen()` | ✅ | ✅ `admin.condition` |
| **Computed/virtual fields** | ✅ `ComputedField` | ✅ | ✅ `virtual` |
| **Reactive derived fields** | ✅ `.from().derive()` | ❌ | ❌ |
| **Field-level access control** | ✅ `.readableBy()` / `.editableBy()` | ✅ | ✅ `access: { read, update }` |
| **Autosave** | ✅ | ❌ | ✅ |
| **Draft recovery** | ✅ localStorage | ❌ | ❌ |
| **Wizard / multi-step forms** | ✅ | ❌ | ❌ |
| **Data import** | ✅ CSV/XLSX | ❌ | ❌ native |
| **Nested resources** | ❌ | ❌ | ✅ |
| **MFA / auth** | via `@rudderjs/auth` | ✅ | ✅ |
| **SSO** | ❌ | ❌ native | ✅ enterprise |
| **Visual / live preview** | ❌ | ❌ | ✅ |
| **Maturity / ecosystem** | Early (pre-release) | Mature (6+ years) | Growing (3.0 stable, VC-backed) |

## Where Pilotiq leads

- **Real-time collaborative editing.** No other admin panel builder offers Yjs-based CRDT collab out of the box.
- **AI-native content editing.** The agent chat sidebar with field actions, block introspection, and selection-aware editing is unique. Payload has AI features but they're enterprise-tier and focused on embeddings, not authoring.
- **Reactive derived fields.** `.from('title').derive(({ title }) => slugify(title))` is among the most ergonomic patterns in the space.
- **Draft recovery.** Browser-side localStorage backup of in-progress edits — none of the others ship this.

## Where the alternatives lead

- **Nova** has Laravel first-party backing and commercial polish.
- **Payload** is the closest competitor architecturally (TypeScript, Lexical, headless), has VC funding, Next.js native integration, visual editing, and enterprise customers.

## Honest gaps Pilotiq should close

1. **Nested resources** — popular pattern in mature admin frameworks; would map to `Resource.children([CommentResource])`.
2. **Visual editor / live preview** — Payload's visual editing is a significant CMS selling point.
3. **MFA** — needs to be in `@rudderjs/auth` before launch.
4. **SSO** — enterprise table-stakes once Pilotiq targets larger orgs.

---

*Last updated: 2026-04-29. If anything in this table is wrong or outdated, file an issue.*
