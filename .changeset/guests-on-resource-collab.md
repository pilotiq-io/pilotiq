---
"@pilotiq/pilotiq": minor
---

`Resource.collab` accepts a `guests` key — per-resource control over anonymous collab peers. Tri-state: `true` admits guests to this resource's collab rooms (still subject to `canView(null, record)`), `false` denies them even when the server gate's panel-wide `allowGuests` is on, omitted inherits the panel-wide setting. Consumed by `@pilotiq-pro/collab`'s `collabAuthorize`; inert for installs without the collab plugin.
