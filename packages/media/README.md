# @pilotiq/media

Open-source media / file library for [`@pilotiq/pilotiq`](https://pilotiq.io). Browse, upload, organize, and pick files, folders, images, video, audio, text, and PDFs through a browsable library UI, mountable inside a panel.

Built on rudder framework primitives: storage via [`@rudderjs/storage`](https://www.npmjs.com/package/@rudderjs/storage) (local / S3 / R2), image conversions via [`@rudderjs/image`](https://www.npmjs.com/package/@rudderjs/image).

> **Status: scaffold (#212).** The plugin is wired but inert. Tracking issues:
> persistence (#213), `_media` routes + upload pipeline (#214), browser UI (#215),
> upload adapter for the core `FileUpload` field (#216), embedded schema element (#217),
> and the upload + library-select form field (#208).

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

Node-only code (the upload pipeline, the `mediaUpload()` adapter) is exported from the `@pilotiq/media/server` subpath so it never reaches the browser bundle.

## License

MIT
