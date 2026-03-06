import React, { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { subDays, subHours } from 'date-fns';
import { TICKET_STATUS } from '../constants/ticketStatus';
import { MOCK_TICKETS } from '../data/mockTickets';
import {
  DirectoryUser,
  fetchUsers,
} from '../services/directoryApi';
import { isAuthEnabled, loginWithEmailPassword, loginWithGoogle, logoutFirebaseAuth, subscribeToAuthState } from '../services/authClient';
import { CatalogRegion, CatalogSite, fetchCatalog } from '../services/catalogApi';
import {
  dismissNotificationRemote,
  fetchNotifications,
  markAllNotificationsReadRemote,
  markNotificationReadRemote,
} from '../services/notificationsApi';
import { notifyTicketStatusChange } from '../services/ticketEmail';
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
  currentUser: DirectoryUser | null;
  currentUserEmail: string;
  setCurrentUserEmail: (email: string) => void;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogleAccount: () => Promise<void>;
  logout: () => Promise<void>;
  authEnabled: boolean;
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

const FALLBACK_DIRECTORY_USERS: DirectoryUser[] = [
  { id: 'admin-os-christus', name: 'Administrador OS Christus', role: 'Admin', email: 'admin@os-christus.local', status: 'Ativo', regionIds: [], siteIds: [], active: true },
];

function normalizeKey(value: string | null | undefined) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function shouldUseLocalDirectoryFallback() {
  if (typeof window === 'undefined') return false;
  return ['localhost', '127.0.0.1'].includes(window.location.hostname);
}

function resolveTicketSiteIds(ticket: Ticket, sites: CatalogSite[]) {
  const rawValues = [ticket.siteId, ticket.sede].map(value => normalizeKey(value)).filter(Boolean);
  const matches = sites
    .filter(site => rawValues.some(value => [site.id, site.code, site.name].map(normalizeKey).includes(value)))
    .map(site => site.id);

  if (ticket.siteId && !matches.includes(ticket.siteId)) {
    matches.push(ticket.siteId);
  }

  return matches;
}

function resolveTicketRegionIds(ticket: Ticket, regions: CatalogRegion[], sites: CatalogSite[]) {
  const rawValues = [ticket.regionId, ticket.region].map(value => normalizeKey(value)).filter(Boolean);
  const matches = regions
    .filter(region => rawValues.some(value => [region.id, region.code, region.name].map(normalizeKey).includes(value)))
    .map(region => region.id);

  const siteRegionIds = resolveTicketSiteIds(ticket, sites)
    .map(siteId => sites.find(site => site.id === siteId)?.regionId)
    .filter(Boolean) as string[];

  for (const regionId of siteRegionIds) {
    if (!matches.includes(regionId)) matches.push(regionId);
  }

  if (ticket.regionId && !matches.includes(ticket.regionId)) {
    matches.push(ticket.regionId);
  }

  return matches;
}

function getInitialUserEmail() {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem('os-christus-user-email') || '';
}

function canUserAccessTicket(
  user: DirectoryUser | null,
  currentUserEmail: string,
  ticket: Ticket,
  regions: CatalogRegion[],
  sites: CatalogSite[]
) {
  if (!currentUserEmail) return true;
  if (!user) return false;
  if (user.role === 'Admin' || user.role === 'Diretor') return true;

  const regionIds = user.regionIds || [];
  const siteIds = user.siteIds || [];
  if (regionIds.length === 0 && siteIds.length === 0) return false;
  const ticketSiteIds = resolveTicketSiteIds(ticket, sites);
  const ticketRegionIds = resolveTicketRegionIds(ticket, regions, sites);
  if (siteIds.some(siteId => ticketSiteIds.includes(siteId))) return true;
  if (regionIds.some(regionId => ticketRegionIds.includes(regionId))) return true;
  return false;
}

async function resolveAuthorizedUser(email: string) {
  let users: DirectoryUser[] = [];
  try {
    users = await fetchUsers();
  } catch {
    users = shouldUseLocalDirectoryFallback() ? FALLBACK_DIRECTORY_USERS : [];
  }

  const found = users.find(user => user.email.toLowerCase() === email.toLowerCase()) || null;

  if (!found) {
    throw new Error('Usuário sem cadastro no sistema. Solicite liberação ao admin.');
  }

  if (found.status !== 'Ativo' || found.active === false) {
    throw new Error('Usuário inativo no sistema.');
  }

  return found;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const authEnabled = isAuthEnabled();
  const localFallbackAllowed = shouldUseLocalDirectoryFallback();
  const [authResolved, setAuthResolved] = useState(!authEnabled);
  const [currentView, setCurrentView] = useState<ViewState>('landing');
  const [activeTicketId, setActiveTicketId] = useState('OS-0050');
  const [trackingTicketToken, setTrackingTicketToken] = useState<string | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [attachmentPreview, setAttachmentPreview] = useState<{ title: string; type: 'image' | 'pdf' } | null>(null);
  const [inboxFilter, setInboxFilterState] = useState<InboxFilter>(DEFAULT_FILTER);
  const [allTickets, setAllTickets] = useState<Ticket[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [notifications, setNotifications] = useState<AppNotification[]>(INITIAL_NOTIFICATIONS);
  const [currentUserEmail, setCurrentUserEmailState] = useState(getInitialUserEmail());
  const [currentUser, setCurrentUser] = useState<DirectoryUser | null>(null);
  const [catalogRegions, setCatalogRegions] = useState<CatalogRegion[]>([]);
  const [catalogSites, setCatalogSites] = useState<CatalogSite[]>([]);

  useEffect(() => {
    if (!authEnabled) return undefined;
    let unsubscribe = () => undefined;
    void (async () => {
      unsubscribe = await subscribeToAuthState(user => {
        setCurrentUserEmailState(user?.email?.trim().toLowerCase() || '');
        setAuthResolved(true);
      });
    })();
    return () => unsubscribe();
  }, [authEnabled]);

  useEffect(() => {
    let cancelled = false;

    if (authEnabled && !authResolved) {
      return undefined;
    }

    if (!currentUserEmail) {
      setAllTickets([]);
      setTicketsLoading(false);
      return undefined;
    }

    if (!authEnabled && !localFallbackAllowed) {
      setAllTickets([]);
      setTicketsLoading(false);
      return undefined;
    }

    setTicketsLoading(true);
    (async () => {
      try {
        const remote = await fetchTicketsFromApi();
        if (!cancelled) {
          setAllTickets(remote);
        }
      } catch {
        if (!cancelled) {
          setAllTickets(localFallbackAllowed ? [...MOCK_TICKETS] : []);
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
  }, [authEnabled, authResolved, currentUserEmail, localFallbackAllowed]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const catalog = await fetchCatalog();
        if (!cancelled) {
          setCatalogRegions(catalog.regions);
          setCatalogSites(catalog.sites);
        }
      } catch {
        if (!cancelled) {
          setCatalogRegions([]);
          setCatalogSites([]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!currentUserEmail) {
      setNotifications([]);
      return undefined;
    }
    if (!authEnabled && !localFallbackAllowed) {
      setNotifications([]);
      return undefined;
    }
    (async () => {
      try {
        const remote = await fetchNotifications();
        if (!cancelled) {
          setNotifications(remote);
        }
      } catch {
        if (!cancelled) {
          setNotifications(localFallbackAllowed ? INITIAL_NOTIFICATIONS : []);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authEnabled, currentUserEmail, localFallbackAllowed]);

  useEffect(() => {
    let cancelled = false;

    if (authEnabled && !authResolved) {
      return undefined;
    }

    if (!currentUserEmail) {
      setCurrentUser(null);
      return undefined;
    }

    (async () => {
      try {
        const found = await resolveAuthorizedUser(currentUserEmail);
        if (!cancelled) {
          setCurrentUser(found);
        }
      } catch {
        if (!cancelled) {
          setCurrentUser(null);
          setCurrentUserEmailState('');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authEnabled, authResolved, currentUserEmail]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (currentUserEmail) {
      window.localStorage.setItem('os-christus-user-email', currentUserEmail);
    } else {
      window.localStorage.removeItem('os-christus-user-email');
    }
  }, [currentUserEmail]);

  const tickets = useMemo(
    () => allTickets.filter(ticket => canUserAccessTicket(currentUser, currentUserEmail, ticket, catalogRegions, catalogSites)),
    [allTickets, currentUser, currentUserEmail, catalogRegions, catalogSites]
  );

  useEffect(() => {
    if (tickets.length === 0) {
      if (activeTicketId !== '') setActiveTicketId('');
      return;
    }
    if (!tickets.some(ticket => ticket.id === activeTicketId)) {
      setActiveTicketId(tickets[0].id);
    }
  }, [tickets, activeTicketId]);

  const updateTicket = (id: string, updates: Partial<Ticket>) => {
    let previousStatus: string | null = null;
    let nextTicket: Ticket | null = null;

    setAllTickets(prev =>
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
    setAllTickets(prev => [ticket, ...prev]);
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

      setAllTickets(prev =>
        prev.map(ticket => {
          let updated = ticket;
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

  const setCurrentUserEmail = (email: string) => {
    const normalized = email.trim().toLowerCase();
    setCurrentUserEmailState(normalized);
  };

  const login = async (email: string, password: string) => {
    const normalized = email.trim().toLowerCase();
    if (authEnabled) {
      try {
        await loginWithEmailPassword(normalized, password);
        const authorizedUser = await resolveAuthorizedUser(normalized);
        setCurrentUserEmail(normalized);
        setCurrentUser(authorizedUser);
      } catch (error) {
        await logoutFirebaseAuth().catch(() => undefined);
        setCurrentUserEmail('');
        setCurrentUser(null);
        throw error;
      }
    } else {
      if (!localFallbackAllowed) {
        throw new Error('Firebase Auth não está configurado no frontend deste ambiente.');
      }
      const authorizedUser = await resolveAuthorizedUser(normalized);
      setCurrentUserEmail(normalized);
      setCurrentUser(authorizedUser);
    }
  };

  const loginWithGoogleAccount = async () => {
    if (!authEnabled) {
      throw new Error('Login com Google indisponível sem Firebase configurado.');
    }

    try {
      const credential = await loginWithGoogle();
      const email = credential.user.email?.trim().toLowerCase();
      if (!email) {
        throw new Error('Conta Google sem e-mail disponível.');
      }
      const authorizedUser = await resolveAuthorizedUser(email);
      setCurrentUserEmail(email);
      setCurrentUser(authorizedUser);
    } catch (error) {
      await logoutFirebaseAuth().catch(() => undefined);
      setCurrentUserEmail('');
      setCurrentUser(null);
      throw error;
    }
  };

  const logout = async () => {
    if (authEnabled) {
      await logoutFirebaseAuth();
    }
    setCurrentUserEmail('');
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
        currentUser,
        currentUserEmail,
        setCurrentUserEmail,
        login,
        loginWithGoogleAccount,
        logout,
        authEnabled,
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
