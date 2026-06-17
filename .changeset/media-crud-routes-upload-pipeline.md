---
"@pilotiq/media": minor
---

Media `_media` CRUD routes + storage/image upload pipeline (#214)

The `media()` plugin now mounts a full `_media` HTTP surface under the panel base via its `registerRoutes` hook:

- **List / get / folder-CRUD / rename / move / delete** — `GET _media` (paginated, `parentId`/`scope`/`search`/`sort`), `GET _media/:id`, `POST _media/folder`, `POST _media/:id/rename`, `POST _media/:id/move` (rejects cycles + non-folder targets), and `POST _media/:id/delete` (folders recurse, removing every descendant row + stored file + conversion).
- **Upload pipeline** — `POST _media/upload` persists the original via `Storage.disk(lib.disk).put(...)`, probes `width`/`height` with `image().metadata()`, and runs the library's `conversions` through `image().generateToStorage(...)`, persisting the returned `ConversionResult[]`. Each upload lands in its own unique directory so a file and its spec-named conversions can never collide with another upload's.
- **Server-side enforcement** — `acceptedMimes` + `maxUploadSize` are re-checked server-side (a tampered client can't bypass them), routes consult the panel `Pilotiq.guard()` and resolve the current user, and `scope: 'private'` filters/stamps records by `userId`.

The Node-only store (Storage / image / model) is loaded lazily inside the request handlers, so the plugin stays client-safe to import alongside the panel module. The store functions (`uploadFile`, `listMedia`, …) are also exported from `@pilotiq/media/server` for programmatic use.
