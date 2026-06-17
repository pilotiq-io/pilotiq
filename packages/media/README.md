# @pilotiq/media

Open-source media / file library for [`@pilotiq/pilotiq`](https://pilotiq.io). Browse, upload, organize, and pick files, folders, images, video, audio, text, and PDFs through a browsable library UI, mountable inside a panel.

Built on rudder framework primitives: storage via [`@rudderjs/storage`](https://www.npmjs.com/package/@rudderjs/storage) (local / S3 / R2), image conversions via [`@rudderjs/image`](https://www.npmjs.com/package/@rudderjs/image).

> **Status: in development.** Persistence (`Media` model + migration + library
> registry) landed in #213. Still to come: `_media` routes + upload pipeline (#214),
> browser UI (#215), upload adapter for the core `FileUpload` field (#216),
> embedded schema element (#217), and the upload + library-select form field (#208).

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

## License

MIT
