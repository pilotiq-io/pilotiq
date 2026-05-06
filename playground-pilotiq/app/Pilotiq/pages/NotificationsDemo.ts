import {
  Page,
  Heading, Alert, Section,
  Action, Notification,
} from '@pilotiq/pilotiq'

/**
 * Bell-icon dropdown demo. The "Send test notification" action drops a
 * row on the `notification` table for the current user; the bell next
 * to the user menu surfaces it on the next poll (or click the bell to
 * refetch immediately).
 */
export class NotificationsDemo extends Page {
  static slug  = 'notifications-demo'
  static label = 'Notifications demo'
  static icon  = 'bell'
  static navigationGroup = 'Demos'

  static schema() {
    return [
      Heading.make('Database notifications')
        .description('Send a row to the current user — open the bell to view.')
        .actions([
          Action.make('sendSuccess')
            .label('Send success')
            .icon('check-circle-2')
            .handler(async ({ user }) => sendDemo(user, 'success')),

          Action.make('sendInfo')
            .label('Send info')
            .icon('info')
            .handler(async ({ user }) => sendDemo(user, 'info')),

          Action.make('sendWarning')
            .label('Send warning')
            .icon('triangle-alert')
            .handler(async ({ user }) => sendDemo(user, 'warning')),
        ]),

      Section.make('How it works').schema([
        Alert.make(
          "Pilotiq.databaseNotifications() mounts the bell + four endpoints. " +
          "Notification.make('…').sendToDatabase(user) writes a row through " +
          '@rudderjs/orm into the same `notification` table that ' +
          "@rudderjs/notification's NotificationProvider already publishes.",
        ).info().title('Wiring'),
      ]),
    ]
  }
}

async function sendDemo(
  user: unknown,
  type: 'success' | 'info' | 'warning',
) {
  if (!user || typeof user !== 'object' || (user as { id?: unknown }).id == null) {
    return {
      notify: Notification.make('No user resolved')
        .body('Pilotiq.user(req => …) must return an object with `id` for sendToDatabase to work.')
        .warning()
        .toMeta(),
    }
  }
  const recipient = user as { id: string | number }
  const builder = type === 'success'
    ? Notification.make('Saved successfully').success().body('Changes to the post have been saved.').icon('check-circle-2').url('/new-admin/articles')
    : type === 'info'
      ? Notification.make('New comment').info().body('Someone commented on your post.').icon('message-circle').url('/new-admin/comments')
      : Notification.make('Storage almost full').warning().body('You are using 92% of your plan quota.').icon('triangle-alert').url('/new-admin/site-settings')

  await builder.sendToDatabase(recipient)
  return {
    notify: Notification.make('Notification sent')
      .body('Open the bell next to the user menu — should appear on the next poll.')
      .info()
      .toMeta(),
  }
}
