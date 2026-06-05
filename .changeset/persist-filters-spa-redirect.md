---
"@pilotiq/pilotiq": patch
---

Two more SPA-navigation fixes:

- **`persistFiltersInSession`'s restore redirect no longer breaks SPA navigation.** The bare-list 302 restore was followed by Vike's pageContext fetch, which received the restored page's HTML and crashed the client router's Content-Type assert ("Something went wrong"; hard refresh worked). pageContext fetches now get Vike's redirect abort envelope (`_urlRedirect`), so the client performs the restore redirect itself — filter restoration now works on SPA nav too.
- **Stable `DndContext` ids** (React `useId`) on the table ReorderProvider and the Repeater/Builder sortable provider — dnd-kit's default module-counter ids diverge between SSR and hydration, producing aria-describedby hydration-attribute warnings.
