---
'@pilotiq/pilotiq': minor
---

feat(pilotiq): simplify the panel topbar — search right, breadcrumb in the header, theme + notifications in the user menu

The sticky header chrome is consolidated:

- **Search** moves to the right cluster (sidebar layout); the left now holds just the sidebar toggle.
- **Breadcrumb** is hoisted into the header next to the toggle (sidebar layout) and removed from the page body. Wired SSR-correctly — the auto-gen `+Layout` extracts the `breadcrumbs` element from `schemaData` and passes it to the header, so it paints on first load and updates on SPA nav. The topbar layout (and any custom header slot) keeps the breadcrumb in the body.
- **Theme toggle** moves into the user dropdown as a row (stays open on click).
- **Database notifications** fold into the user dropdown as a "Notifications" submenu carrying the full inbox list; an unread dot shows on the avatar. The standalone `<NotificationBell>` is retained for the `databaseNotificationsPosition('sidebar')` placement.

New: `DropdownMenuSub` / `DropdownMenuSubTrigger` / `DropdownMenuSubContent` primitives, a shared `useNotifications()` hook + `NotificationList` component (extracted from `NotificationBell`), an exported `BreadcrumbsView`, and a `breadcrumb` prop on `AppShell` / `UserMenu`'s new optional `notifications` prop. No breaking public API.
