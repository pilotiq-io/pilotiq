# @pilotiq/media

Open-source media / file library for [`@pilotiq/pilotiq`](https://pilotiq.io). Browse, upload, organize, and pick files, folders, images, video, audio, text, and PDFs through a browsable library UI, mountable inside a panel.

Built on rudder framework primitives: storage via [`@rudderjs/storage`](https://www.npmjs.com/package/@rudderjs/storage) (local / S3 / R2), image conversions via [`@rudderjs/image`](https://www.npmjs.com/package/@rudderjs/image).

> **Status: in development.** Persistence (`Media` model + migration + library
> registry) landed in #213; the `_media` CRUD routes + storage/image upload
> pipeline in #214; the library browser UI + extensible preview registry in
> #215. Still to come: upload adapter for the core `FileUpload` field (#216),
> embedded schema element (#217), and the upload + library-select form field
> (#208).

## Install

```bash
pnpm add @pilotiq/media
```

## Usage

```ts
import { Pilotiq } from '@pilotiq/pilotiq'
import { media } from '@pilotiq/media'

export const admin = Pilotiq.make('Admin').plugins([
  media({ disk: 'public', directory: 'media' }),
])
```

`media()` resolves its config into the library registry: the top-level fields
form the `default` library, and a `libraries` map adds named ones alongside it.

```ts
media({
  // the default library
  disk: 'public', directory: 'media',
  // …plus named libraries
  libraries: {
    photos: { disk: 'public', directory: 'photos', acceptedMimes: ['image/*'] },
    docs:   { disk: 'r2',     directory: 'docs' },
  },
})
```

Resolve them anywhere (SSR-safe, globalThis-backed) with `getDefaultLibrary()`,
`getLibrary(name)`, and `getLibraryNames()`.

Node-only code (the `Media` model, the upload pipeline, the `mediaUpload()`
adapter) is exported from the `@pilotiq/media/server` subpath so it never reaches
the browser bundle.

## Database migration

Pilotiq runs on rudder's **native database engine**, where the *app* owns
migrations (there's no schema-publish step). The package ships a copyable
migration that creates the `media` table — copy it into your app's
`database/migrations/` directory and run the migration:

```bash
cp node_modules/@pilotiq/media/migrations/*_create_media_table.ts \
   database/migrations/
pnpm rudder migrate
```

The `Media` model (`@pilotiq/media/server`) binds the generated `media` column
types and round-trips the `conversions` / `meta` JSON columns through its
`static casts`. Files and folders live in one parent-id tree (`type` +
`parentId`).

If you reference the `Media` model in app code, register it in a provider
(`ModelRegistry.register(Media)`) so `rudder schema:types` folds its casts into
the generated registry — the package ships a matching `SchemaRegistry['media']`
augmentation, so the two merge identically.

## HTTP API

The `media()` plugin mounts CRUD + upload routes under the panel base (the
underscore-prefixed sibling-route convention). They're authenticated with the
panel's `Pilotiq.guard()` and honor a `scope` of `shared` (default) or
`private` (filtered to the current user):

| Method & path | Body | Purpose |
|---|---|---|
| `GET  {base}/_media` | — | List a folder. Query: `parentId`, `scope`, `search`, `sort` (`name`\|`createdAt`\|`updatedAt`\|`size`), `dir`, `page`, `perPage`. Returns `{ ok, data, total, page, perPage, lastPage }`. |
| `GET  {base}/_media/:id` | — | Fetch one record. |
| `POST {base}/_media/folder` | JSON `{ name, parentId?, scope? }` | Create a folder. |
| `POST {base}/_media/upload` | multipart `file`, `library?`, `parentId?`, `scope?`, `alt?` | Upload a file. Images get dimensions probed + the library's `conversions` generated to disk. |
| `POST {base}/_media/:id/rename` | JSON `{ name }` | Rename a file/folder. |
| `POST {base}/_media/:id/move` | JSON `{ parentId }` (`null` = root) | Reparent (rejects cycles + non-folder targets). |
| `POST {base}/_media/:id/delete` | — | Delete; folders recurse, removing every descendant row + stored file + conversion. |

Uploads respect the library's `acceptedMimes` + `maxUploadSize` server-side
(re-checked even though the client enforces them too). Each upload lands in its
own directory under the library so a file and its conversions can't collide
with another upload's. The server functions (`uploadFile`, `listMedia`, …) are
also exported from `@pilotiq/media/server` for programmatic use.

> **Serving stored files.** Media records carry public `url`s resolved through
> the disk's `baseUrl` (`Storage.disk(disk).url(key)`). Your app must make those
> URLs reachable — a CDN / S3 public bucket, or a small route streaming from the
> disk. For a local disk that means serving its `baseUrl` prefix, e.g.
> ```ts
> Route.get('/media/*', async (req) => {
>   const key = decodeURIComponent(req.path.replace(/^\/+/, ''))
>   const buf = await Storage.disk('public').get(key)
>   return buf ? new Response(buf, { headers: { 'Content-Type': mimeFor(key) } })
>              : new Response('Not Found', { status: 404 })
> })
> ```

## FileUpload adapter

`mediaUpload()` lets a core `FileUpload` field write into the library instead of
a bare disk. Registered via `Pilotiq.uploads({ adapter })`, it runs every upload
through the same persist + image-conversion pipeline as `_media/upload` and
creates a `Media` row — so files uploaded from a plain field show up in the
library browser with thumbnails and round-trip with previews.

```ts
// bootstrap/providers.ts (server-only — composes the Node-only store pipeline)
import { mediaUpload } from '@pilotiq/media/server'

panel.uploads({ adapter: mediaUpload() })                    // default library
panel.uploads({ adapter: mediaUpload({ library: 'photos' }) }) // a named library
```

The field stores the returned public `url`; the result's `meta` carries the
`Media` row's `id`, `mime`, `size`, and image `width`/`height` for previews.

Uploads are stored as `shared` library records. The library owns its on-disk
layout (a unique `<slug>-<uuid>` directory per upload), so the adapter does
**not** honor the field's `directory()` or `preserveFilenames()` hints — that's
what guarantees two uploads of the same name never collide. User-scoped
(`private`) uploads need a request-bound user the `UploadAdapter` contract
doesn't carry; drive those through the `_media/upload` route instead.

## Library browser UI

The `media()` plugin also mounts a **library browser** at `${base}/media` (a nav
entry + page), so a panel with `media()` gets a working file manager: folder
browsing + breadcrumbs, upload with per-file progress, a new-folder dialog,
delete, and a type-aware preview modal.

Register the browser's React widget + the built-in previews from your **client**
entry (e.g. `pages/+Layout.tsx`):

```ts
import { registerWidgetComponents } from '@pilotiq/pilotiq/widgets'
import { MediaLibrary, registerBuiltinMediaPreviews } from '@pilotiq/media/widgets'

registerWidgetComponents({ MediaLibrary })
registerBuiltinMediaPreviews()
```

Apply `media()` **after** any `.pages([...])` call (it appends its page, and
`.pages()` replaces the set).

### Extensible preview registry

Previews are keyed by `FileCategory` (`categorize(mime)`), not a hard-coded
switch — add or override a type by registering a renderer:

```ts
import { registerMediaPreview } from '@pilotiq/media'

registerMediaPreview('pdf', MyFancyPdfViewer) // ({ url, mime, name, record }) => JSX
```

Built-ins ship for image / video / audio / pdf / text, with an icon fallback for
everything else.

## License

MIT
