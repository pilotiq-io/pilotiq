# @pilotiq/media

## 0.3.0

### Minor Changes

- 25ac932: Media `_media` CRUD routes + storage/image upload pipeline (#214)

  The `media()` plugin now mounts a full `_media` HTTP surface under the panel base via its `registerRoutes` hook:

  - **List / get / folder-CRUD / rename / move / delete** — `GET _media` (paginated, `parentId`/`scope`/`search`/`sort`), `GET _media/:id`, `POST _media/folder`, `POST _media/:id/rename`, `POST _media/:id/move` (rejects cycles + non-folder targets), and `POST _media/:id/delete` (folders recurse, removing every descendant row + stored file + conversion).
  - **Upload pipeline** — `POST _media/upload` persists the original via `Storage.disk(lib.disk).put(...)`, probes `width`/`height` with `image().metadata()`, and runs the library's `conversions` through `image().generateToStorage(...)`, persisting the returned `ConversionResult[]`. Each upload lands in its own unique directory so a file and its spec-named conversions can never collide with another upload's.
  - **Server-side enforcement** — `acceptedMimes` + `maxUploadSize` are re-checked server-side (a tampered client can't bypass them), routes consult the panel `Pilotiq.guard()` and resolve the current user, and `scope: 'private'` filters/stamps records by `userId`.

  The Node-only store (Storage / image / model) is loaded lazily inside the request handlers, so the plugin stays client-safe to import alongside the panel module. The store functions (`uploadFile`, `listMedia`, …) are also exported from `@pilotiq/media/server` for programmatic use.

- 92d2812: `Media` schema element — embed the library browser in any page schema (#217)

  The second of the package's two mount modes. Where `media()` mounts the browser at a global `/media` route, the new `Media` element drops the same browser into **any page or resource schema**:

  ```ts
  // Page.schema()
  Media.make("Assets")
    .library("photos") // scope uploads to a named library
    .directory(folderId) // root the browser at a folder
    .height(640)
    .columnSpan(2);
  ```

  Built on `View`, so it inherits the full server-data pipeline plus layout chrome (`columnSpan()`, `visible()`, `poll()`) and renders through the registered `MediaLibrary` component (`registerWidgetComponents({ MediaLibrary })` — same as the route page). The `_media` API base is resolved from the render context, so the element works in any page location (not just the `/media` slug). The `MediaLibraryPage` route now uses `Media.make('library')` itself, so both mount modes share one path.

  `library()` routes uploads to the named library; `directory()` roots the browser at a folder. Filtering the listing by library is a follow-up (the `_media` list is one parent-id tree across libraries).

- 528efac: `MediaField` — a media-library form field with upload + library-select (#208)

  A new `fieldType: 'media'` form field, the media-aware counterpart to core's `FileUpload`. One field, two ways to set a value:

  - **Upload new file(s) inline** — runs the `@pilotiq/media` upload pipeline (server generates conversions / dimensions), with per-file progress.
  - **Pick from the library** — opens the browser in a new `select` mode (single → picks immediately; multiple → toggle tiles, confirm via footer).

  `MediaField.make(name).label(…).multiple().accept(['image/*']).library('photos')` stores a stable `MediaRef` (single) or `MediaRef[]` (`multiple()`) — id + url + alt + responsive `conversions` — NOT a raw URL, so the selection round-trips onto the field on edit (preview thumbnail included) without a re-fetch. The column needs a `'json'` cast.

  Register the renderer once from your client entry: `import { registerMediaField } from '@pilotiq/media/widgets'; registerMediaField()`.

  The `MediaLibrary` browser gained a `mode: 'select'` (with `multiple` / `onSelect` / `apiBase`) so it can be embedded in the picker dialog; `'manage'` (the standalone library page) stays the default. New exports: `MediaField` / `MediaPicker`, the `MediaRef` type + `toMediaRef(record)`, and `registerMediaField` / `MediaFieldInput`.

- 12a0cb9: Media library browser UI + extensible preview registry (#215)

  The `media()` plugin now mounts a browsable library at `${base}/media` (a panel route + nav entry):

  - **Library browser** (`MediaLibrary` widget) — folder browsing + breadcrumbs, upload with per-file progress (click or drag-drop), a new-folder dialog, delete, and a type-aware preview modal. Talks to the `_media` routes directly; grid tiles use the `thumb` conversion. Mounted as a `Page` whose schema is a single `View` widget; register the component from your client entry with `registerWidgetComponents({ MediaLibrary })` (from `@pilotiq/media/widgets`).
  - **Extensible preview registry** — keyed by `FileCategory` (`categorize(mime)`), not a hard-coded switch. `registerMediaPreview(category, Component)` adds or overrides how a type previews; built-ins ship for image / video / audio / pdf / text with an icon fallback. Call `registerBuiltinMediaPreviews()` once from the client entry.

  Also: `ConversionInfo` + `MediaRecord` now carry a computed `url` (resolved through the disk) so the browser can render thumbnails directly; and `toRecord` parses string-encoded `json` columns, fixing conversions not persisting on the instance returned straight from `Model.create` (which also left conversion files orphaned on recursive delete).

  Apply `media()` **after** any `.pages([...])` call, since it appends its page and `.pages()` replaces the set. Your app must also serve the storage disk's `baseUrl` (CDN / public bucket / a small streaming route) so the URLs resolve.

- 725d06c: Media persistence: `Media` model + migration + library registry (#213)

  Adds the native-engine persistence layer for `@pilotiq/media`:

  - A copyable `create_media_table` migration (shipped under the package's `migrations/` dir) — folders and files in one parent-id tree, with `conversions` / `meta` JSON columns plus `width` / `height` / `focalX` / `focalY` image metadata.
  - A `Media` model (`@pilotiq/media/server`) binding the generated `media` column types via `Model.for<'media'>()`, with `json` casts on `conversions` / `meta` that round-trip through the native driver. Ships a matching `SchemaRegistry['media']` augmentation so the model is typed without depending on the host's `rudder schema:types` sweep.
  - A globalThis-backed library registry (`registerLibrary` / `getLibrary` / `getDefaultLibrary` / `getLibraryNames`) resolving named + default libraries at SSR time.
  - `media()` now resolves its config into the registry on `register()`: the top-level fields form the `default` library, and a `libraries` map adds named ones alongside it.

- cb5ccfc: Media `mediaUpload()` UploadAdapter for core FileUpload (#216)

  `@pilotiq/media/server` now exports `mediaUpload({ library? })`, a core `UploadAdapter` that targets the media library as its storage backend. Registered via `Pilotiq.uploads({ adapter: mediaUpload() })`, every `FileUpload` field runs through the same persist + image-conversion pipeline as the `_media/upload` route and creates a `Media` row — so field uploads show up in the library browser with thumbnails and round-trip with previews. The field stores the returned public `url`; the result's `meta` carries the row's `id`, `mime`, `size`, and image `width`/`height`.

  Uploads are stored as `shared` records; the library owns its on-disk layout (a unique per-upload directory), so the adapter does not honor the `directory`/`preserveFilenames` hints. User-scoped (`private`) uploads stay on the `_media/upload` route.

## 0.2.0

### Minor Changes

- d36f4c7: New package: `@pilotiq/media` (scaffold)

  Introduces the open-source media / file library package. This scaffold ships the workspace package, build/test config, the core runtime-agnostic types (`MediaRecord`, `ConversionInfo`, `MediaConversion`, `MediaConfig`, `categorize()`), the client-safe `@pilotiq/media` barrel and the Node-only `@pilotiq/media/server` subpath seam, and the `media()` plugin factory (wired into a panel via `.plugins([media()])`, inert for now). It declares `@rudderjs/storage` + `@rudderjs/image` (`^1.2.1`) and the `@pilotiq/pilotiq` peer range per the adapter convention.

  Library registry + persistence, the `_media` routes + upload pipeline, the browser UI, and the field follow in subsequent slices.
