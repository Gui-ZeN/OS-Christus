import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { ViewState, Ticket, InboxFilter, AppNotification } from '../types';
import { MOCK_TICKETS } from '../data/mockTickets';
import { subHours, subDays } from 'date-fns';

interface AppContextType {
  // Navigation
  currentView: ViewState;
  navigateTo: (view: ViewState) => void;

  // Global State
  activeTicketId: string;
  setActiveTicketId: (id: string) => void;
  trackingTicketId: string | null;
  setTrackingTicketId: (id: string | null) => void;

  // UI State
  showNotifications: boolean;
  setShowNotifications: (show: boolean) => void;
  attachmentPreview: { title: string; type: 'image' | 'pdf' } | null;
  openAttachment: (title: string, type: 'image' | 'pdf') => void;
  closeAttachment: () => void;

  // Data Persistence
  inboxFilter: InboxFilter;
  setInboxFilter: (filter: InboxFilter) => void;
  completedApprovalIds: string[];
  setCompletedApprovalIds: React.Dispatch<React.SetStateAction<string[]>>;
  completedFinanceIds: string[];
  setCompletedFinanceIds: React.Dispatch<React.SetStateAction<string[]>>;

  // Z4: Notifications
  notifications: AppNotification[];
  unreadCount: number;
  markNotificationRead: (id: string) => void;
  dismissNotification: (id: string) => void;
  markAllNotificationsRead: () => void;

  // Data
  tickets: Ticket[];
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
  const [currentView, setCurrentView] = useState<ViewState>('home');

  // Global State
  const [activeTicketId, setActiveTicketId] = useState('OS-0050');
  const [trackingTicketId, setTrackingTicketId] = useState<string | null>(null);
  
  // UI State
  const [showNotifications, setShowNotifications] = useState(false);
  const [attachmentPreview, setAttachmentPreview] = useState<{ title: string; type: 'image' | 'pdf' } | null>(null);
  
  // Data Persistence
  const [inboxFilter, setInboxFilterState] = useState<InboxFilter>(DEFAULT_FILTER);
  const [completedApprovalIds, setCompletedApprovalIds] = useState<string[]>([]);
  const [completedFinanceIds, setCompletedFinanceIds] = useState<string[]>([]);

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
      
      MOCK_TICKETS.forEach(ticket => {
        // Z1: SLA Check
        if (ticket.sla && ticket.status !== 'Encerrada') {
          if (ticket.sla.status !== 'overdue' && now > ticket.sla.dueAt) {
            ticket.sla.status = 'overdue';
            console.log(`[Z1 SLA] Email sent to Rafael + Director: Ticket ${ticket.id} is OVERDUE.`);
          } else if (ticket.sla.status === 'on_time' && now.getTime() > ticket.sla.dueAt.getTime() - (1000 * 60 * 60 * 2)) {
             ticket.sla.status = 'at_risk';
          }
        }

        // Z2: Unassigned Ticket Alert (48h)
        // Assuming 'Nova OS' means unassigned/unacknowledged
        if (ticket.status === 'Nova OS' && (now.getTime() - ticket.time.getTime()) > (48 * 60 * 60 * 1000)) {
          console.log(`[Z2 Automation] Alert: Ticket ${ticket.id} unassigned for > 48h. Notifying Rafael.`);
        }

        // Z2: Long Running Execution Alert (e.g., > 7 days in 'Em andamento')
        if (ticket.status === 'Em andamento') {
          // Find when it entered 'Em andamento' (mock logic: use ticket time for simplicity or last history item)
          // Real app would check history log
          const daysRunning = (now.getTime() - ticket.time.getTime()) / (1000 * 60 * 60 * 24);
          if (daysRunning > 7) {
             console.log(`[Z2 Automation] Alert: Ticket ${ticket.id} running for ${daysRunning.toFixed(1)} days.`);
          }
        }
      });
    };

    runAutomations();
    const interval = setInterval(runAutomations, 60000);
    return () => clearInterval(interval);
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

  return (
    <AppContext.Provider value={{
      currentView,
      navigateTo,
      activeTicketId,
      setActiveTicketId,
      trackingTicketId,
      setTrackingTicketId,
      showNotifications,
      setShowNotifications,
      attachmentPreview,
      openAttachment,
      closeAttachment,
      inboxFilter,
      setInboxFilter,
      completedApprovalIds,
      setCompletedApprovalIds,
      completedFinanceIds,
      setCompletedFinanceIds,
      notifications,
      unreadCount,
      markNotificationRead,
      dismissNotification,
      markAllNotificationsRead,
      tickets: MOCK_TICKETS
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
