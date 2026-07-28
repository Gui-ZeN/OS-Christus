import { describe, expect, it } from 'vitest';
import {
  NOTIFICATION_TTL_MS,
  canUserSeeNotification,
  isNotificationDismissed,
  mergeNotificationState,
  normalizeNotificationAudience,
  notificationTtlAt,
  resolveNotificationTicketId,
} from '../../api/_lib/notificationState.js';

describe('notification state', () => {
  it('normaliza a audiência e restringe por papel', () => {
    const notification = { audienceRoles: [' Admin ', '', 'Gestor'] };

    expect(normalizeNotificationAudience(notification)).toEqual(['Admin', 'Gestor']);
    expect(canUserSeeNotification({ role: 'Gestor' }, notification)).toBe(true);
    expect(canUserSeeNotification({ role: 'Usuario' }, notification)).toBe(false);
  });

  it('mantém notificação sem audiência visível para qualquer papel', () => {
    expect(canUserSeeNotification({ role: 'Usuario' }, {})).toBe(true);
    expect(canUserSeeNotification({ role: 'Diretor' }, { audienceRoles: [''] })).toBe(true);
  });

  it('ignora o read compartilhado e aplica somente o estado do usuário', () => {
    const notification = {
      id: 'notification-1',
      read: true,
      createdAt: new Date('2026-07-24T10:00:00.000Z'),
    };

    expect(mergeNotificationState(notification, undefined)).toMatchObject({
      id: 'notification-1',
      read: false,
      time: notification.createdAt,
    });
    expect(mergeNotificationState(notification, {
      readAt: new Date('2026-07-24T10:01:00.000Z'),
    }).read).toBe(true);
  });

  it('dispensa somente quando o estado daquele usuário possui dismissedAt', () => {
    expect(isNotificationDismissed(undefined)).toBe(false);
    expect(isNotificationDismissed({ dismissedAt: null })).toBe(false);
    expect(isNotificationDismissed({ dismissedAt: new Date() })).toBe(true);
  });

  it('resolve a OS tanto no campo direto quanto na ação', () => {
    expect(resolveNotificationTicketId({ ticketId: 'OS-0001' })).toBe('OS-0001');
    expect(resolveNotificationTicketId({ action: { ticketId: 'OS-0002' } })).toBe('OS-0002');
  });
});


describe('TTL de notificações', () => {
  it('carimba ttlAt no futuro (retenção definida, não infinita)', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const ttl = notificationTtlAt(now);
    expect(ttl.getTime()).toBe(now.getTime() + NOTIFICATION_TTL_MS);
    expect(ttl.getTime()).toBeGreaterThan(now.getTime());
  });

  it('usa uma janela de meses (não expira notificação recente)', () => {
    const dias = NOTIFICATION_TTL_MS / (24 * 60 * 60 * 1000);
    expect(dias).toBeGreaterThanOrEqual(90);
  });
});
