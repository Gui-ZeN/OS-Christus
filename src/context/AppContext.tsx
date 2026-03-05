import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { subDays, subHours } from 'date-fns';
import { TICKET_STATUS } from '../constants/ticketStatus';
import { MOCK_TICKETS } from '../data/mockTickets';
import { notifyTicketStatusChange } from '../services/ticketEmail';
import {
  dismissNotificationRemote,
  fetchNotifications,
  markAllNotificationsReadRemote,
  markNotificationReadRemote,
} from '../services/notificationsApi';
import { createTicketInApi, fetchTicketsFromApi, patchTicketInApi } from '../services/ticketsApi';
import { AppNotification, InboxFilter, Ticket, ViewState } from '../types';

interface AppContextType {
  currentView: ViewState;
  navigateTo: (view: ViewState) => void;
  activeTicketId: string;
  setActiveTicketId: (id: string) => void;
  trackingTicketToken: string | null;
  setTrackingTicketToken: (token: string | null) => void;
  showNotifications: boolean;
  setShowNotifications: (show: boolean) => void;
  attachmentPreview: { title: string; type: 'image' | 'pdf' } | null;
  openAttachment: (title: string, type: 'image' | 'pdf') => void;
  closeAttachment: () => void;
  inboxFilter: InboxFilter;
  setInboxFilter: (filter: InboxFilter) => void;
  notifications: AppNotification[];
  unreadCount: number;
  markNotificationRead: (id: string) => void;
  dismissNotification: (id: string) => void;
  markAllNotificationsRead: () => void;
  tickets: Ticket[];
  ticketsLoading: boolean;
  updateTicket: (id: string, updates: Partial<Ticket>) => void;
  addTicket: (ticket: Ticket) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const DEFAULT_FILTER: InboxFilter = {
  status: [],
  priority: [],
  region: [],
  type: [],
};

const INITIAL_NOTIFICATIONS: AppNotification[] = [
  {
    id: 'n1',
    type: 'actionable',
    title: 'Aprovação Necessária',
    body: 'Orçamento da OS-0048 excede o limite automático. Requer sua validação.',
    time: new Date(),
    read: false,
    action: { label: 'Revisar Orçamento', view: 'approvals' },
  },
  {
    id: 'n2',
    type: 'info',
    title: 'OS-0045 Validada',
    body: 'O solicitante aprovou a manutenção dos geradores. Pronta para pagamento.',
    time: subHours(new Date(), 2),
    read: false,
    action: { label: 'Ver OS', view: 'inbox', ticketId: 'OS-0045' },
  },
  {
    id: 'n3',
    type: 'alert',
    title: 'SLA Vencido: OS-0044',
    body: 'O prazo de resolução para esta OS crítica expirou.',
    time: subHours(new Date(), 4),
    read: false,
    action: { label: 'Ver OS Atrasada', view: 'inbox', ticketId: 'OS-0044' },
  },
  {
    id: 'n4',
    type: 'info',
    title: 'Nova OS Registrada',
    body: 'Infiltração crítica no teto do refeitório (OS-0050).',
    time: subDays(new Date(), 1),
    read: true,
    action: { label: 'Ver OS', view: 'inbox', ticketId: 'OS-0050' },
  },
];

export function AppProvider({ children }: { children: ReactNode }) {
  const [currentView, setCurrentView] = useState<ViewState>('landing');
  const [activeTicketId, setActiveTicketId] = useState('OS-0050');
  const [trackingTicketToken, setTrackingTicketToken] = useState<string | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [attachmentPreview, setAttachmentPreview] = useState<{ title: string; type: 'image' | 'pdf' } | null>(null);
  const [inboxFilter, setInboxFilterState] = useState<InboxFilter>(DEFAULT_FILTER);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [notifications, setNotifications] = useState<AppNotification[]>(INITIAL_NOTIFICATIONS);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const remote = await fetchTicketsFromApi();
        if (!cancelled) {
          setTickets(remote);
          if (remote.length > 0 && !remote.some(ticket => ticket.id === activeTicketId)) {
            setActiveTicketId(remote[0].id);
          }
        }
      } catch {
        if (!cancelled) {
          setTickets([...MOCK_TICKETS]);
        }
      } finally {
        if (!cancelled) {
          setTicketsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const remote = await fetchNotifications();
        if (!cancelled) {
          setNotifications(remote);
        }
      } catch {
        if (!cancelled) {
          setNotifications(INITIAL_NOTIFICATIONS);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const updateTicket = (id: string, updates: Partial<Ticket>) => {
    let previousStatus: string | null = null;
    let nextTicket: Ticket | null = null;

    setTickets(prev =>
      prev.map(ticket => {
        if (ticket.id !== id) return ticket;
        previousStatus = ticket.status;
        nextTicket = { ...ticket, ...updates };
        return nextTicket;
      })
    );

    if (previousStatus && nextTicket && updates.status && previousStatus !== nextTicket.status) {
      void notifyTicketStatusChange(nextTicket, previousStatus);
    }

    void patchTicketInApi(id, updates).catch(() => {
      // Persistência remota falhou, mas não bloqueia o fluxo local.
    });
  };

  const addTicket = (ticket: Ticket) => {
    setTickets(prev => [ticket, ...prev]);
    void createTicketInApi(ticket).catch(() => {
      // Persistência remota falhou, mas não bloqueia o fluxo local.
    });
  };

  const unreadCount = notifications.filter(notification => !notification.read).length;

  const markNotificationRead = (id: string) => {
    setNotifications(prev => prev.map(notification => (notification.id === id ? { ...notification, read: true } : notification)));
    void markNotificationReadRemote(id).catch(() => {
      // Persistência remota falhou, mas não bloqueia o fluxo local.
    });
  };

  const dismissNotification = (id: string) => {
    setNotifications(prev => prev.filter(notification => notification.id !== id));
    void dismissNotificationRemote(id).catch(() => {
      // Persistência remota falhou, mas não bloqueia o fluxo local.
    });
  };

  const markAllNotificationsRead = () => {
    setNotifications(prev => prev.map(notification => ({ ...notification, read: true })));
    void markAllNotificationsReadRemote().catch(() => {
      // Persistência remota falhou, mas não bloqueia o fluxo local.
    });
  };

  useEffect(() => {
    const runAutomations = () => {
      const now = new Date();

      setTickets(prev =>
        prev.map(ticket => {
          let updated = ticket;

          // Z1: atualiza o estado do SLA localmente para refletir risco e atraso.
          if (ticket.sla && ticket.status !== TICKET_STATUS.CLOSED) {
            if (ticket.sla.status !== 'overdue' && now > ticket.sla.dueAt) {
              updated = { ...updated, sla: { ...ticket.sla, status: 'overdue' } };
            } else if (ticket.sla.status === 'on_time' && now.getTime() > ticket.sla.dueAt.getTime() - 2 * 3600000) {
              updated = { ...updated, sla: { ...ticket.sla, status: 'at_risk' } };
            }
          }

          return updated;
        })
      );
    };

    runAutomations();
    const interval = setInterval(runAutomations, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const queryTracking = params.get('tracking');
    const pathMatch = window.location.pathname.match(/^\/tracking\/([^/]+)\/?$/);
    const pathTracking = pathMatch ? decodeURIComponent(pathMatch[1]) : null;
    const initialTracking = queryTracking || pathTracking;

    if (initialTracking) {
      setTrackingTicketToken(initialTracking);
      setCurrentView('tracking');
      return;
    }

    const requestedView = params.get('view');
    if (requestedView === 'public-form') {
      setCurrentView('public-form');
      return;
    }
    if (requestedView === 'login') {
      setCurrentView('login');
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const newFilter: InboxFilter = { ...DEFAULT_FILTER };

    if (params.has('status')) newFilter.status = params.get('status')?.split(',') || [];
    if (params.has('priority')) newFilter.priority = params.get('priority')?.split(',') || [];
    if (params.has('region')) newFilter.region = params.get('region')?.split(',') || [];
    if (params.has('type')) newFilter.type = params.get('type')?.split(',') || [];

    setInboxFilterState(newFilter);
  }, []);

  const setInboxFilter = (filter: InboxFilter) => {
    setInboxFilterState(filter);
    const params = new URLSearchParams();

    if (filter.status.length > 0) params.set('status', filter.status.join(','));
    if (filter.priority.length > 0) params.set('priority', filter.priority.join(','));
    if (filter.region.length > 0) params.set('region', filter.region.join(','));
    if (filter.type.length > 0) params.set('type', filter.type.join(','));

    const newUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`;
    window.history.replaceState({}, '', newUrl);
  };

  const navigateTo = (view: ViewState) => {
    setCurrentView(view);
  };

  const openAttachment = (title: string, type: 'image' | 'pdf') => {
    setAttachmentPreview({ title, type });
  };

  const closeAttachment = () => {
    setAttachmentPreview(null);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    if (currentView === 'tracking' && trackingTicketToken) {
      params.set('tracking', trackingTicketToken);
      params.delete('view');
    } else {
      params.delete('tracking');
      if (currentView === 'public-form' || currentView === 'login') {
        params.set('view', currentView);
      } else {
        params.delete('view');
      }
    }

    const query = params.toString();
    const newUrl = `${window.location.pathname}${query ? `?${query}` : ''}`;
    window.history.replaceState({}, '', newUrl);
  }, [currentView, trackingTicketToken]);

  return (
    <AppContext.Provider
      value={{
        currentView,
        navigateTo,
        activeTicketId,
        setActiveTicketId,
        trackingTicketToken,
        setTrackingTicketToken,
        showNotifications,
        setShowNotifications,
        attachmentPreview,
        openAttachment,
        closeAttachment,
        inboxFilter,
        setInboxFilter,
        notifications,
        unreadCount,
        markNotificationRead,
        dismissNotification,
        markAllNotificationsRead,
        tickets,
        ticketsLoading,
        updateTicket,
        addTicket,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
}

export const useApp = useAppContext;
