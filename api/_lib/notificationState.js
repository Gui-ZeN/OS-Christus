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

// Retenção das notificações: ~120 dias. Grava `ttlAt` para uma TTL policy do
// Firestore (campo `ttlAt`) apagar as antigas sozinha, sem custo de leitura/delete.
// Sem isto a coleção cresce sem teto — o dismiss virou estado POR USUÁRIO e não
// apaga mais o doc compartilhado, e o `markAllRead` varre a coleção inteira.
export const NOTIFICATION_TTL_MS = 120 * 24 * 60 * 60 * 1000;

export function notificationTtlAt(now = new Date()) {
  return new Date(now.getTime() + NOTIFICATION_TTL_MS);
}
