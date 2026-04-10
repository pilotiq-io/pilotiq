# @pilotiq/media

Media library plugin for [`@pilotiq/panels`](../panels) — file browser, uploads, image previews, on-demand image conversions, and a `MediaPickerField` for resource forms.

## Installation

```bash
pnpm add @pilotiq/media
```

Peer dependencies: `@pilotiq/panels`, `@rudderjs/core`, `@rudderjs/router`, `@rudderjs/storage`, `react`, `react-dom`. `@rudderjs/image` is optional and only needed if you use image conversions.

## Setup

Register the plugin on your panel:

```ts
import { Panel } from '@pilotiq/panels'
import { media } from '@pilotiq/media/server'

export const adminPanel = Panel.make('admin')
  .path('/admin')
  .use(media({
    disk: 'public',
    directory: 'media',
  }))
```

Publish the Prisma schema and vendored pages, then run migrations:

```bash
pnpm rudder vendor:publish --tag=media-schema --force
pnpm rudder vendor:publish --tag=media-pages --force
pnpm exec prisma db push
```

## Configuration

### Single (default) library

```ts
media({
  disk: 'public',
  directory: 'media',
  accept: ['image/*', 'application/pdf'],
  maxUploadSize: 20 * 1024 * 1024,
  conversions: [
    { name: 'thumb', width: 200, height: 200, fit: 'cover' },
    { name: 'large', width: 1600 },
  ],
})
```

### Named libraries

```ts
media({
  libraries: {
    photos: {
      disk: 'public',
      directory: 'photos',
      accept: ['image/*'],
      conversions: [{ name: 'thumb', width: 200, height: 200, fit: 'cover' }],
    },
    documents: {
      disk: 'public',
      directory: 'docs',
      accept: ['application/pdf'],
    },
  },
})
```

### No config

```ts
media()
// → registers a 'default' library on disk='public', directory='media'
```

## Using `MediaPickerField` in a resource

```ts
import { TextField, MediaPickerField } from '@pilotiq/panels'
import { MediaPickerField as Picker } from '@pilotiq/media'

export class ArticleResource extends Resource {
  static schema() {
    return [
      TextField.make('title').required(),
      Picker.make('cover').library('photos').conversion('thumb'),
    ]
  }
}
```

Field options:

| Method | Description |
|---|---|
| `.library(name)` | Pick from a named library (defaults to `'default'`) |
| `.conversion(name)` | Render the named conversion variant in previews |
| `.multiple()` | Allow selecting multiple files |
| `.accept(types)` | Override the library's accepted MIME types |

## Schema element

`Media` is a schema element you can drop into the panel navigation to expose the standalone media library page:

```ts
import { Media } from '@pilotiq/media'

Panel.make('admin').elements([
  Media.make('library').label('Media Library').library('photos'),
])
```

## Server vs client entry points

| Import | Use in |
|---|---|
| `@pilotiq/media` | Client + shared types, schema elements, components |
| `@pilotiq/media/server` | Server bootstrap (panel plugin factory `media()`) |

## License

[MIT](../../LICENSE)
