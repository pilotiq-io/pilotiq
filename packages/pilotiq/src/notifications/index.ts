export {
  Notification,
  type NotificationType,
  type NotificationMeta,
  _resetNotificationIdSeq,
} from './Notification.js'

export {
  resolveSavedNotification,
  type SavedNotificationMode,
} from './resolveSavedNotification.js'

export {
  flashNotifications,
  consumeFlashedNotifications,
} from './flash.js'

export type { Notifiable } from './types.js'

export {
  listForUser,
  unreadCount,
  markAsRead,
  markAsUnread,
  markAllAsRead,
  persist as persistDatabaseNotification,
  type DatabaseNotificationMeta,
  type ListOptions    as DatabaseNotificationListOptions,
  type ListResult     as DatabaseNotificationListResult,
} from './database.js'

export {
  push as pushBroadcastNotification,
  notificationChannel,
  NOTIFICATION_CREATED_EVENT,
  type PushOptions as PushBroadcastOptions,
} from './broadcast.js'
