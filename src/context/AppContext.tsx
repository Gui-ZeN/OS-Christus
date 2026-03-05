import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { ViewState, Ticket, InboxFilter, AppNotification } from '../types';
import { MOCK_TICKETS } from '../data/mockTickets';
import { subHours, subDays } from 'date-fns';
import { TICKET_STATUS } from '../constants/ticketStatus';
import { notifyTicketStatusChange } from '../services/ticketEmail';

interface AppContextType {
  // Navigation
  currentView: ViewState;
  navigateTo: (view: ViewState) => void;

  // Global State
  activeTicketId: string;
  setActiveTicketId: (id: string) => void;
  trackingTicketToken: string | null;
  setTrackingTicketToken: (token: string | null) => void;

  // UI State
  showNotifications: boolean;
  setShowNotifications: (show: boolean) => void;
  attachmentPreview: { title: string; type: 'image' | 'pdf' } | null;
  openAttachment: (title: string, type: 'image' | 'pdf') => void;
  closeAttachment: () => void;

  // Data Persistence
  inboxFilter: InboxFilter;
  setInboxFilter: (filter: InboxFilter) => void;

  // Z4: Notifications
  notifications: AppNotification[];
  unreadCount: number;
  markNotificationRead: (id: string) => void;
  dismissNotification: (id: string) => void;
  markAllNotificationsRead: () => void;

  // Data
  tickets: Ticket[];
  updateTicket: (id: string, updates: Partial<Ticket>) => void;
  addTicket: (ticket: Ticket) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const DEFAULT_FILTER: InboxFilter = {
  status: [],
  priority: [],
  region: [],
  type: []
};

const INITIAL_NOTIFICATIONS: AppNotification[] = [
  {
    id: 'n1',
    type: 'actionable',
    title: 'Aprovação Necessária',
    body: 'Orçamento da OS-0048 excede o limite automático. Requer sua validação.',
    time: new Date(),
    read: false,
    action: { label: 'Revisar Orçamento', view: 'approvals' }
  },
  {
    id: 'n2',
    type: 'info',
    title: 'OS-0045 Validada',
    body: 'O solicitante aprovou a manutenção dos geradores. Pronta para pagamento.',
    time: subHours(new Date(), 2),
    read: false,
    action: { label: 'Ver OS', view: 'inbox', ticketId: 'OS-0045' }
  },
  {
    id: 'n3',
    type: 'alert',
    title: 'SLA Vencido: OS-0044',
    body: 'O prazo de resolução para esta OS crítica expirou.',
    time: subHours(new Date(), 4),
    read: false,
    action: { label: 'Ver OS Atrasada', view: 'inbox', ticketId: 'OS-0044' }
  },
  {
    id: 'n4',
    type: 'info',
    title: 'Nova OS Registrada',
    body: 'Infiltração Crítica no Teto do Refeitório (OS-0050).',
    time: subDays(new Date(), 1),
    read: true,
    action: { label: 'Ver OS', view: 'inbox', ticketId: 'OS-0050' }
  }
];

export function AppProvider({ children }: { children: ReactNode }) {
  // Navigation
  const [currentView, setCurrentView] = useState<ViewState>('landing');

  // Global State
  const [activeTicketId, setActiveTicketId] = useState('OS-0050');
  const [trackingTicketToken, setTrackingTicketToken] = useState<string | null>(null);
  
  // UI State
  const [showNotifications, setShowNotifications] = useState(false);
  const [attachmentPreview, setAttachmentPreview] = useState<{ title: string; type: 'image' | 'pdf' } | null>(null);
  
  // Data Persistence
  const [inboxFilter, setInboxFilterState] = useState<InboxFilter>(DEFAULT_FILTER);

  // Mutable tickets state
  const [tickets, setTickets] = useState<Ticket[]>([...MOCK_TICKETS]);

  const updateTicket = (id: string, updates: Partial<Ticket>) => {
    let previousStatus: string | null = null;
    let nextTicket: Ticket | null = null;

    setTickets(prev =>
      prev.map(t => {
        if (t.id !== id) return t;
        previousStatus = t.status;
        nextTicket = { ...t, ...updates };
        return nextTicket;
      })
    );

    if (previousStatus && nextTicket && updates.status && previousStatus !== nextTicket.status) {
      void notifyTicketStatusChange(nextTicket, previousStatus);
    }
  };

  const addTicket = (ticket: Ticket) => {
    setTickets(prev => [ticket, ...prev]);
  };

  // Z4: Notifications
  const [notifications, setNotifications] = useState<AppNotification[]>(INITIAL_NOTIFICATIONS);
  const unreadCount = notifications.filter(n => !n.read).length;

  const markNotificationRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const dismissNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const markAllNotificationsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  // Z1 & Z2: Automations Simulation (SLA, Notifications, Alerts)
  useEffect(() => {
    const runAutomations = () => {
      const now = new Date();

      setTickets(prev => prev.map(ticket => {
        let updated = ticket;

        // Z1: SLA Check — atualiza via estado, sem mutação direta
        if (ticket.sla && ticket.status !== TICKET_STATUS.CLOSED) {
          if (ticket.sla.status !== 'overdue' && now > ticket.sla.dueAt) {
            updated = { ...updated, sla: { ...ticket.sla, status: 'overdue' } };
          } else if (ticket.sla.status === 'on_time' && now.getTime() > ticket.sla.dueAt.getTime() - 2 * 3600000) {
            updated = { ...updated, sla: { ...ticket.sla, status: 'at_risk' } };
          }
        }

        // Z2: Unassigned Ticket Alert (48h) — lógica preservada para futura integração de notificações
        // Z2: Long Running Execution Alert (>7 days) — idem

        return updated;
      }));
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
    
    const newUrl = `${window.location.pathname}${params.toString() ? '?' + params.toString() : ''}`;
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
    <AppContext.Provider value={{
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
      updateTicket,
      addTicket,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
