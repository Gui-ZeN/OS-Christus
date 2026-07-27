import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bell, CheckCheck, Loader2, RefreshCw, X } from 'lucide-react';

import { useApp } from '../context/AppContext';
import {
  dismissNotificationRemote,
  fetchNotifications,
  markAllNotificationsReadRemote,
  markNotificationReadRemote,
} from '../services/notificationsApi';
import { AppNotification, ViewState } from '../types';
import { formatDistanceToNowSafe } from '../utils/date';

interface NotificationsPopoverProps {
  userKey: string;
}

function notificationAccent(type: AppNotification['type']) {
  if (type === 'alert' || type === 'email-bounce') return 'bg-red-500';
  if (type === 'actionable' || type === 'requester-message') return 'bg-amber-500';
  return 'bg-sky-500';
}

export function NotificationsPopover({ userKey }: NotificationsPopoverProps) {
  const { navigateTo, setActiveTicketId } = useApp();
  const containerRef = useRef<HTMLDivElement>(null);
  const loadedOlderRef = useRef(false);
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const unreadCount = useMemo(
    () => notifications.reduce((total, notification) => total + (notification.read ? 0 : 1), 0),
    [notifications]
  );

  const refresh = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const page = await fetchNotifications();
      setNotifications(current => {
        if (showLoading || current.length === 0) return page.notifications;
        const byId = new Map(current.map(item => [item.id, item]));
        for (const item of page.notifications) byId.set(item.id, item);
        return [...byId.values()].sort((a, b) => b.time.getTime() - a.time.getTime());
      });
      if (showLoading) loadedOlderRef.current = false;
      if (showLoading || !loadedOlderRef.current) setNextCursor(page.nextCursor);
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Falha ao buscar notificações.');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    setNotifications([]);
    setNextCursor(null);
    setLoadingMore(false);
    loadedOlderRef.current = false;
    setError(null);
    void refresh(true);

    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [refresh, userKey]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false);
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  async function markRead(notification: AppNotification) {
    if (notification.read) return;
    await markNotificationReadRemote(notification.id);
    setNotifications(current =>
      current.map(item => (item.id === notification.id ? { ...item, read: true } : item))
    );
  }

  async function openNotification(notification: AppNotification) {
    setPendingId(notification.id);
    try {
      await markRead(notification);
      const ticketId = notification.action?.ticketId || notification.ticketId;
      if (ticketId) setActiveTicketId(ticketId);
      const targetView = notification.action?.view || (ticketId ? 'inbox' : null);
      if (targetView) navigateTo(targetView as ViewState);
      setIsOpen(false);
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Falha ao abrir a notificação.');
    } finally {
      setPendingId(null);
    }
  }

  async function dismiss(notification: AppNotification) {
    setPendingId(notification.id);
    try {
      await dismissNotificationRemote(notification.id);
      setNotifications(current => current.filter(item => item.id !== notification.id));
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Falha ao dispensar a notificação.');
    } finally {
      setPendingId(null);
    }
  }

  async function markAllRead() {
    setPendingId('all');
    try {
      await markAllNotificationsReadRemote();
      setNotifications(current => current.map(item => ({ ...item, read: true })));
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Falha ao marcar as notificações.');
    } finally {
      setPendingId(null);
    }
  }

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    loadedOlderRef.current = true;
    setLoadingMore(true);
    try {
      const page = await fetchNotifications(nextCursor);
      setNotifications(current => {
        const byId = new Map(current.map(item => [item.id, item]));
        for (const item of page.notifications) byId.set(item.id, item);
        return [...byId.values()].sort((a, b) => b.time.getTime() - a.time.getTime());
      });
      setNextCursor(page.nextCursor);
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Falha ao carregar notificações anteriores.');
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setIsOpen(current => !current);
          if (!isOpen) void refresh();
        }}
        className={`relative flex min-h-9 w-full items-center justify-center py-2 transition-colors ${
          isOpen ? 'text-roman-primary' : 'text-white/70 hover:text-white'
        }`}
        title="Notificações"
        aria-label={`Notificações${unreadCount ? `, ${unreadCount} não lidas` : ''}`}
        aria-expanded={isOpen}
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute right-0 top-0 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold leading-none text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <section
          className="fixed bottom-3 left-[4.25rem] z-[220] flex max-h-[min(36rem,calc(100vh-1.5rem))] w-[min(24rem,calc(100vw-5.25rem))] flex-col overflow-hidden rounded-md border border-roman-border bg-roman-surface shadow-2xl"
          aria-label="Central de notificações"
        >
          <header className="flex min-h-12 items-center justify-between gap-3 border-b border-roman-border px-3">
            <div>
              <h2 className="font-serif text-sm font-semibold text-roman-text-main">Notificações</h2>
              <p className="text-[11px] text-roman-text-sub">
                {unreadCount > 0 ? `${unreadCount} não ${unreadCount === 1 ? 'lida' : 'lidas'}` : 'Tudo em dia'}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={() => void markAllRead()}
                  disabled={pendingId !== null}
                  className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-sm text-roman-text-sub hover:bg-roman-bg hover:text-roman-text-main disabled:opacity-50"
                  title="Marcar todas como lidas"
                  aria-label="Marcar todas como lidas"
                >
                  {pendingId === 'all' ? <Loader2 size={16} className="animate-spin" /> : <CheckCheck size={16} />}
                </button>
              )}
              <button
                type="button"
                onClick={() => void refresh(true)}
                disabled={loading}
                className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-sm text-roman-text-sub hover:bg-roman-bg hover:text-roman-text-main disabled:opacity-50"
                title="Atualizar notificações"
                aria-label="Atualizar notificações"
              >
                <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
          </header>

          {error && (
            <div className="border-b border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800" role="alert">
              {error}
            </div>
          )}

          <div className="min-h-0 overflow-y-auto">
            {loading && notifications.length === 0 ? (
              <div className="flex min-h-32 items-center justify-center text-roman-text-sub">
                <Loader2 size={18} className="animate-spin" />
              </div>
            ) : notifications.length === 0 ? (
              <p className="px-4 py-10 text-center font-serif text-sm italic text-roman-text-sub">
                Nenhuma notificação nesta página.
              </p>
            ) : (
              notifications.map(notification => {
                const isPending = pendingId === notification.id;
                return (
                  <article
                    key={notification.id}
                    className={`relative border-b border-roman-border last:border-b-0 ${
                      notification.read ? 'bg-roman-surface' : 'bg-roman-primary/5'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => void openNotification(notification)}
                      disabled={pendingId !== null}
                      className="flex min-h-[5.25rem] w-full gap-3 px-3 py-3 pr-11 text-left hover:bg-roman-bg disabled:cursor-wait"
                    >
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${notificationAccent(notification.type)}`} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-semibold text-roman-text-main">{notification.title}</span>
                        <span className="mt-1 block line-clamp-2 text-xs leading-5 text-roman-text-sub">{notification.body}</span>
                        <span className="mt-1.5 block text-[10px] text-roman-text-sub">
                          {formatDistanceToNowSafe(notification.time)}
                        </span>
                      </span>
                      {isPending && <Loader2 size={15} className="mt-1 shrink-0 animate-spin text-roman-primary" />}
                    </button>
                    <button
                      type="button"
                      onClick={event => {
                        event.stopPropagation();
                        void dismiss(notification);
                      }}
                      disabled={pendingId !== null}
                      className="absolute right-2 top-2 inline-flex min-h-8 min-w-8 items-center justify-center rounded-sm text-roman-text-sub hover:bg-roman-bg hover:text-roman-text-main disabled:opacity-40"
                      title="Dispensar somente para mim"
                      aria-label={`Dispensar ${notification.title} somente para mim`}
                    >
                      <X size={14} />
                    </button>
                  </article>
                );
              })
            )}
            {nextCursor && (
              <button
                type="button"
                onClick={() => void loadMore()}
                disabled={loadingMore}
                className="flex min-h-11 w-full items-center justify-center gap-2 border-t border-roman-border px-3 py-2 text-xs font-medium text-roman-primary hover:bg-roman-bg disabled:opacity-50"
              >
                {loadingMore && <Loader2 size={14} className="animate-spin" />}
                Carregar anteriores
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
