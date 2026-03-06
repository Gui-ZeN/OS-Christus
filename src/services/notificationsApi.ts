import { AppNotification } from '../types';
import { coerceDate } from '../utils/date';

type NotificationApi = Omit<AppNotification, 'time'> & { time: string };

export async function fetchNotifications() {
  const response = await fetch('/api/notifications');
  if (!response.ok) {
    throw new Error('Falha ao buscar notifications.');
  }
  const json = await response.json();
  if (!json.ok || !Array.isArray(json.notifications)) {
    throw new Error('Resposta invalida de notifications.');
  }
  return (json.notifications as NotificationApi[]).map(item => ({
    ...item,
    time: coerceDate(item.time),
  })) as AppNotification[];
}

export async function markNotificationReadRemote(id: string) {
  await fetch('/api/notifications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'markRead', id }),
  });
}

export async function dismissNotificationRemote(id: string) {
  await fetch('/api/notifications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'dismiss', id }),
  });
}

export async function markAllNotificationsReadRemote() {
  await fetch('/api/notifications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'markAllRead' }),
  });
}
