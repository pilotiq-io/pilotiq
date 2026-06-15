---
"@pilotiq/tiptap": patch
---

fix(tiptap): custom blocks no longer break under realtime collab (#96)

The `pilotiqBlock` custom-block node now stores its `blockData` as a JSON **string** instead of a plain object. The node is a contentless leaf whose whole state lives in that attr, and under realtime collab the field binds through `@tiptap/extension-collaboration` (y-prosemirror), whose PM↔Yjs attribute sync is string-oriented — an object-valued attr didn't round-trip, so a custom block (e.g. a Callout) silently vanished the moment it was edited and didn't persist. A primitive string syncs cleanly.

The NodeView and the server renderer parse it back to an object at their boundaries (`parseBlockData`), which still tolerates the legacy object form, so documents saved before this change keep loading and migrate to the string form on the next edit. No API change: `insertBlock(type, data)` still takes an object.
