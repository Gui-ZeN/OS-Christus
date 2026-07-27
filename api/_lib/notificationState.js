export function normalizeNotificationAudience(notification) {
  return Array.isArray(notification?.audienceRoles)
    ? notification.audienceRoles.map(role => String(role || '').trim()).filter(Boolean)
    : [];
}

export function canUserSeeNotification(user, notification) {
  const audience = normalizeNotificationAudience(notification);
  return audience.length === 0 || audience.includes(user?.role);
}

export function resolveNotificationTicketId(notification) {
  return String(notification?.ticketId || notification?.action?.ticketId || '').trim();
}

export function mergeNotificationState(notification, state) {
  return {
    ...notification,
    time: notification?.time || notification?.createdAt || notification?.updatedAt || null,
    read: Boolean(state?.readAt),
  };
}

export function isNotificationDismissed(state) {
  return Boolean(state?.dismissedAt);
}

export function getNotificationStateCollection(db, userId) {
  return db.collection('users').doc(userId).collection('notificationStates');
}
