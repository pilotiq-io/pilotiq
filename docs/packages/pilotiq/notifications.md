# Notifications

Toast-style notifications surface the result of an action — saved
successfully, deleted, validation failed, custom messages from a
handler. Action handlers and form lifecycle hooks return a
`Notification` (or array of them); the framework wires the rest.

> [!NOTE]
> This is the *transient toast* notification. Persistent multi-channel
> notifications (mail, database, broadcast) live in `@rudderjs/notifications`
> — different concept, same name.

## Sending a notification

```ts
Action.make('publish').handler(async (ctx) => {
  await ctx.record.publish()
  return {
    notify: Notification.success('Published')
      .body(`"${ctx.record.title}" is live.`)
      .duration(3000),
  }
})
```

## Variants

```ts
Notification.make('saved').success()                  // green check
Notification.make('failed').error()                   // red X
Notification.make('careful').warning()                // amber !
Notification.make('fyi').info()                       // blue i
```

Each variant sets a default icon; override with `.icon('custom-name')`.

## Form lifecycle defaults

`CreatePage` and `EditPage` ship default success toasts ("Created" /
"Saved"). Customize per-page:

```ts
class CreatePostPage extends CreatePage {
  static getCreatedNotificationTitle() { return 'Post drafted' }
}
```

Or disable:

```ts
class CreatePostPage extends CreatePage {
  static disableSavedNotification = true
}
```

## Across redirects (303)

Form-post handlers that 303-redirect to a new page (the legacy form-post
path) stash the notification on `req.session.flash` (via
`@rudderjs/session`). The destination page reads it on mount and
forwards to `<ToasterProvider>` — works whether the session is
cookie-backed or Redis-backed. Falls back silently when no session is
configured.
