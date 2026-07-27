import { getAuthenticatedActorHeaders } from './actorHeaders';
import { expectApiJson } from './apiClient';
import { AppNotification } from '../types';
import { coerceDate } from '../utils/date';

type NotificationApi = Omit<AppNotification, 'time'> & { time: unknown };

export interface NotificationPage {
  notifications: AppNotification[];
  nextCursor: string | null;
}

export async function fetchNotifications(cursor?: string | null): Promise<NotificationPage> {
  const query = new URLSearchParams({ limit: '50' });
  if (cursor) query.set('cursor', cursor);
  const response = await fetch(`/api/notifications?${query.toString()}`, {
    headers: await getAuthenticatedActorHeaders(),
  });
  const json = await expectApiJson<{
    ok: boolean;
    notifications?: NotificationApi[];
    nextCursor?: string | null;
  }>(
    response,
    'Falha ao buscar notificações.'
  );
  if (!json.ok || !Array.isArray(json.notifications)) {
    throw new Error('Resposta inválida de notificações.');
  }
  return {
    notifications: (json.notifications as NotificationApi[]).map(item => ({
      ...item,
      time: coerceDate(item.time),
    })) as AppNotification[],
    nextCursor: typeof json.nextCursor === 'string' ? json.nextCursor : null,
  };
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
