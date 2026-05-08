---
"@pilotiq/pilotiq": minor
---

Add optional `PilotiqPlugin.registerRoutes?(router, pilotiq)` hook so plugins can mount their own HTTP routes alongside the panel's. `registerPilotiqRoutes(router, pilotiq)` walks `pilotiq.getPlugins()` and invokes each plugin's `registerRoutes` after core routes finish registering, in plugin-registration order. Plugins that own only config mutations (right-sidebar contributions, field renderers, registry seeds) skip the hook; plugins that own routes (chat endpoints, presence, custom REST) implement it. Closes the two-step DX where consumers had to call a separate `aiPlugin.mount(router, panel)` after `registerPilotiqRoutes`.
