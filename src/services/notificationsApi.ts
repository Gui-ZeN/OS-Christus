import { getAuthenticatedActorHeaders } from './actorHeaders';
import { expectApiJson } from './apiClient';
import { AppNotification } from '../types';
import { coerceDate } from '../utils/date';

type NotificationApi = Omit<AppNotification, 'time'> & { time: string };

export async function fetchNotifications() {
  const response = await fetch('/api/notifications', {
    headers: await getAuthenticatedActorHeaders(),
  });
  const json = await expectApiJson<{ ok: boolean; notifications?: NotificationApi[] }>(
    response,
    'Falha ao buscar notificações.'
  );
  if (!json.ok || !Array.isArray(json.notifications)) {
    throw new Error('Resposta inválida de notificações.');
  }
  return (json.notifications as NotificationApi[]).map(item => ({
    ...item,
    time: coerceDate(item.time),
  })) as AppNotification[];
}

export async function markNotificationReadRemote(id: string) {
  const headers = await getAuthenticatedActorHeaders();
  const response = await fetch('/api/notifications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ action: 'markRead', id }),
  });
  await expectApiJson(response, 'Falha ao marcar notificação como lida.');
}

export async function dismissNotificationRemote(id: string) {
  const headers = await getAuthenticatedActorHeaders();
  const response = await fetch('/api/notifications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ action: 'dismiss', id }),
  });
  await expectApiJson(response, 'Falha ao dispensar notificação.');
}

export async function markAllNotificationsReadRemote() {
  const headers = await getAuthenticatedActorHeaders();
  const response = await fetch('/api/notifications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ action: 'markAllRead' }),
  });
  await expectApiJson(response, 'Falha ao marcar notificações como lidas.');
}
