import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { TICKET_STATUS } from '../constants/ticketStatus';
import { APP_THEMES, AppThemeId, AppThemeOption, DEFAULT_APP_THEME } from '../constants/themes';
import {
  DirectoryUser,
  fetchUsers,
} from '../services/directoryApi';
import { isAuthEnabled, loginWithEmailPassword, loginWithGoogle, logoutFirebaseAuth, subscribeToAuthState } from '../services/authClient';
import { CatalogRegion, CatalogSite, fetchCatalog } from '../services/catalogApi';
import { notifyTicketStatusChange } from '../services/ticketEmail';
import { createTicketInApi, createTicketWithFilesInApi, fetchTicketsFromApi, patchTicketInApi } from '../services/ticketsApi';
import { requestPasswordResetInApi } from '../services/passwordResetApi';
import { InboxFilter, Ticket, ViewState } from '../types';

interface AppContextType {
  currentView: ViewState;
  navigateTo: (view: ViewState) => void;
  activeTicketId: string;
  setActiveTicketId: (id: string) => void;
  trackingTicketToken: string | null;
  setTrackingTicketToken: (token: string | null) => void;
  attachmentPreview: {
    title: string;
    type: 'image' | 'pdf';
    url?: string | null;
    items?: Array<{ title: string; type: 'image' | 'pdf'; url?: string | null }>;
  } | null;
  openAttachment: (
    title: string,
    type: 'image' | 'pdf',
    options?: {
      url?: string | null;
      items?: Array<{ title: string; type: 'image' | 'pdf'; url?: string | null }>;
    }
  ) => void;
  closeAttachment: () => void;
  inboxFilter: InboxFilter;
  setInboxFilter: (filter: InboxFilter) => void;
  tickets: Ticket[];
  ticketsLoading: boolean;
  refreshTickets: (options?: { silent?: boolean }) => Promise<void>;
  updateTicket: (id: string, updates: Partial<Ticket>) => void;
  addTicket: (ticket: Ticket, files?: File[]) => Promise<Ticket>;
  currentUser: DirectoryUser | null;
  currentUserEmail: string;
  setCurrentUserEmail: (email: string) => void;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogleAccount: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  authEnabled: boolean;
  authResolved: boolean;
  authorizationResolved: boolean;
  theme: AppThemeId;
  setTheme: (theme: AppThemeId) => void;
  availableThemes: AppThemeOption[];
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const DEFAULT_FILTER: InboxFilter = {
  status: [],
  priority: [],
  region: [],
  site: [],
  type: [],
};

const DIRECTORY_FETCH_FAILED = 'DIRECTORY_FETCH_FAILED';
const OPERATIONAL_POLL_INTERVAL_MS = 10_000;

function getInitialView(): ViewState {
  if (typeof window === 'undefined') return 'landing';
  const params = new URLSearchParams(window.location.search);
  const requestedView = params.get('view');
  const queryAllowed: ViewState[] = ['landing', 'login', 'public-form', 'home', 'inbox', 'kpi', 'settings', 'tracking', 'approvals', 'finance', 'audit-logs'];
  if (queryAllowed.includes(requestedView as ViewState)) {
    return requestedView as ViewState;
  }
  const stored = window.localStorage.getItem('os-christus-current-view');
  const allowed: ViewState[] = ['landing', 'login', 'public-form', 'home', 'inbox', 'users', 'kpi', 'settings', 'tracking', 'approvals', 'finance', 'email-health', 'audit-logs'];
  return allowed.includes(stored as ViewState) ? (stored as ViewState) : 'landing';
}

function normalizeKey(value: string | null | undefined) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
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

function getInitialTheme(): AppThemeId {
  if (typeof window === 'undefined') return DEFAULT_APP_THEME;
  const stored = String(window.localStorage.getItem('os-christus-theme') || '').trim() as AppThemeId;
  return APP_THEMES.some(theme => theme.id === stored) ? stored : DEFAULT_APP_THEME;
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
  if (siteIds.length > 0 && siteIds.some(siteId => ticketSiteIds.includes(siteId))) return true;
  if (regionIds.length > 0 && regionIds.some(regionId => ticketRegionIds.includes(regionId))) return true;
  return false;
}

async function resolveAuthorizedUser(email: string) {
  let users: DirectoryUser[] = [];
  try {
    users = await fetchUsers();
  } catch {
    throw new Error(DIRECTORY_FETCH_FAILED);
  }

  const found = users.find(user => user.email.toLowerCase() === email.toLowerCase()) || null;

  if (!found) {
    throw new Error('Acesso não autorizado. Seu e-mail ainda não foi liberado no sistema. Solicite o cadastro ao administrador.');
  }

  if (found.status !== 'Ativo' || found.active === false) {
    throw new Error('Acesso indisponível. Seu usuário está inativo no sistema. Procure o administrador para reativação.');
  }

  return found;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const authEnabled = isAuthEnabled();
  const [authResolved, setAuthResolved] = useState(!authEnabled);
  const [authorizationResolved, setAuthorizationResolved] = useState(!authEnabled);
  const [pageVisible, setPageVisible] = useState(
    typeof document === 'undefined' ? true : document.visibilityState === 'visible'
  );
  const [currentView, setCurrentView] = useState<ViewState>(getInitialView);
  const [activeTicketId, setActiveTicketId] = useState('');
  const [trackingTicketToken, setTrackingTicketToken] = useState<string | null>(null);
  const [attachmentPreview, setAttachmentPreview] = useState<{
    title: string;
    type: 'image' | 'pdf';
    url?: string | null;
    items?: Array<{ title: string; type: 'image' | 'pdf'; url?: string | null }>;
  } | null>(null);
  const [inboxFilter, setInboxFilterState] = useState<InboxFilter>(DEFAULT_FILTER);
  const [allTickets, setAllTickets] = useState<Ticket[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [currentUserEmail, setCurrentUserEmailState] = useState(getInitialUserEmail());
  const [currentUser, setCurrentUser] = useState<DirectoryUser | null>(null);
  const [catalogRegions, setCatalogRegions] = useState<CatalogRegion[]>([]);
  const [catalogSites, setCatalogSites] = useState<CatalogSite[]>([]);
  const [theme, setThemeState] = useState<AppThemeId>(getInitialTheme);

  const refreshTickets = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (authEnabled && !authResolved) {
      return;
    }

    if (!currentUserEmail || !currentUser) {
      setAllTickets([]);
      if (!silent) {
        setTicketsLoading(false);
      }
      return;
    }

    if (!authEnabled) {
      setAllTickets([]);
      if (!silent) {
        setTicketsLoading(false);
      }
      return;
    }

    if (!silent) {
      setTicketsLoading(true);
    }
    try {
      const remote = await fetchTicketsFromApi();
      setAllTickets(remote);
    } catch {
      if (!silent) {
        setAllTickets([]);
      }
    } finally {
      if (!silent) {
        setTicketsLoading(false);
      }
    }
  }, [authEnabled, authResolved, currentUser, currentUserEmail]);

  useEffect(() => {
    if (!authEnabled) return undefined;
    let unsubscribe = () => undefined;
    void (async () => {
      unsubscribe = await subscribeToAuthState(user => {
        const nextEmail = user?.email?.trim().toLowerCase() || '';
        setCurrentUser(previous =>
          previous && previous.email?.trim().toLowerCase() === nextEmail ? previous : null
        );
        setCurrentUserEmailState(nextEmail);
        setAuthorizationResolved(!nextEmail);
        setAuthResolved(true);
      });
    })();
    return () => unsubscribe();
  }, [authEnabled]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const handleVisibilityChange = () => {
      setPageVisible(document.visibilityState === 'visible');
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  useEffect(() => {
    void refreshTickets();
  }, [refreshTickets]);

  const shouldPollOperationalData = useMemo(() => {
    if (!authEnabled || !authResolved || !authorizationResolved || !currentUserEmail || !currentUser) {
      return false;
    }

    if (!pageVisible) return false;

    return ['home', 'inbox', 'approvals', 'finance', 'kpi'].includes(currentView);
  }, [authEnabled, authResolved, authorizationResolved, currentUser, currentUserEmail, currentView, pageVisible]);

  useEffect(() => {
    if (!shouldPollOperationalData) return undefined;
    void refreshTickets({ silent: true });
    const timer = setInterval(() => void refreshTickets({ silent: true }), OPERATIONAL_POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [refreshTickets, shouldPollOperationalData]);

  useEffect(() => {
    if (!shouldPollOperationalData) return undefined;

    const handleFocus = () => {
      void refreshTickets({ silent: true });
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [refreshTickets, shouldPollOperationalData]);

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

    if (authEnabled && !authResolved) {
      return undefined;
    }

    if (!currentUserEmail) {
      setCurrentUser(null);
      setAuthorizationResolved(true);
      return undefined;
    }

    (async () => {
      setAuthorizationResolved(false);
      try {
        const found = await resolveAuthorizedUser(currentUserEmail);
        if (!cancelled) {
          setCurrentUser(previous => {
            if (
              previous &&
              previous.email?.trim().toLowerCase() === found.email?.trim().toLowerCase() &&
              previous.role === found.role &&
              previous.status === found.status
            ) {
              return previous;
            }
            return found;
          });
          setAuthorizationResolved(true);
        }
      } catch (error) {
        if ((error as Error)?.message === DIRECTORY_FETCH_FAILED) {
          if (!cancelled) {
            setAuthorizationResolved(true);
          }
          return;
        }
        await logoutFirebaseAuth().catch(() => undefined);
        if (!cancelled) {
          setCurrentUser(null);
          setCurrentUserEmailState('');
          setAuthorizationResolved(true);
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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('os-christus-current-view', currentView);
  }, [currentView]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('data-theme', theme);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('os-christus-theme', theme);
    }
  }, [theme]);

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
    const previousTicket = allTickets.find(ticket => ticket.id === id);
    if (!previousTicket) return;

    const nextTicket: Ticket = { ...previousTicket, ...updates };
    setAllTickets(prev => prev.map(ticket => (ticket.id === id ? nextTicket : ticket)));

    void (async () => {
      try {
        await patchTicketInApi(id, updates);
        if (updates.status && previousTicket.status !== nextTicket.status) {
          await notifyTicketStatusChange(nextTicket, previousTicket.status);
        }
      } catch {
        setAllTickets(prev => prev.map(ticket => (ticket.id === id ? previousTicket : ticket)));
      }
    })();
  };

  const addTicket = async (ticket: Ticket, files: File[] = []) => {
    const createdTicket = files.length > 0 ? await createTicketWithFilesInApi(ticket, files) : await createTicketInApi(ticket);
    setAllTickets(prev => [createdTicket, ...prev.filter(item => item.id !== createdTicket.id)]);
    return createdTicket;
  };

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
    const allowedViews: ViewState[] = ['public-form', 'login', 'home', 'inbox', 'approvals', 'finance', 'kpi', 'settings', 'audit-logs'];
    if (allowedViews.includes(requestedView as ViewState)) {
      setCurrentView(requestedView as ViewState);
      const requestedTicketId = params.get('ticketId');
      if (requestedTicketId) {
        setActiveTicketId(requestedTicketId);
      }
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const newFilter: InboxFilter = { ...DEFAULT_FILTER };

    if (params.has('status')) newFilter.status = params.get('status')?.split(',') || [];
    if (params.has('priority')) newFilter.priority = params.get('priority')?.split(',') || [];
    if (params.has('region')) newFilter.region = params.get('region')?.split(',') || [];
    if (params.has('site')) newFilter.site = params.get('site')?.split(',') || [];
    if (params.has('type')) newFilter.type = params.get('type')?.split(',') || [];

    setInboxFilterState(newFilter);
  }, []);

  const setInboxFilter = (filter: InboxFilter) => {
    setInboxFilterState(filter);
    const params = new URLSearchParams();

    if (filter.status.length > 0) params.set('status', filter.status.join(','));
    if (filter.priority.length > 0) params.set('priority', filter.priority.join(','));
    if (filter.region.length > 0) params.set('region', filter.region.join(','));
    if (filter.site.length > 0) params.set('site', filter.site.join(','));
    if (filter.type.length > 0) params.set('type', filter.type.join(','));

    const newUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`;
    window.history.replaceState({}, '', newUrl);
  };

  const navigateTo = (view: ViewState) => {
    setCurrentView(view);
  };

  const openAttachment = (
    title: string,
    type: 'image' | 'pdf',
    options?: {
      url?: string | null;
      items?: Array<{ title: string; type: 'image' | 'pdf'; url?: string | null }>;
    }
  ) => {
    setAttachmentPreview({
      title,
      type,
      url: options?.url || null,
      items: options?.items || [],
    });
  };

  const closeAttachment = () => {
    setAttachmentPreview(null);
  };

  const setCurrentUserEmail = (email: string) => {
    const normalized = email.trim().toLowerCase();
    setCurrentUserEmailState(normalized);
  };

  const setTheme = (nextTheme: AppThemeId) => {
    if (!APP_THEMES.some(themeOption => themeOption.id === nextTheme)) return;
    setThemeState(nextTheme);
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
        if ((error as Error)?.message === DIRECTORY_FETCH_FAILED) {
          throw new Error('Não foi possível validar seu acesso agora. Tente novamente em instantes.');
        }
        await logoutFirebaseAuth().catch(() => undefined);
        setCurrentUserEmail('');
        setCurrentUser(null);
        throw error;
      }
    } else {
      throw new Error('Não foi possível concluir o login neste ambiente. A autenticação do sistema ainda não foi configurada no frontend. Verifique as variáveis VITE_FIREBASE_* da aplicação e publique um novo deploy.');
    }
  };

  const loginWithGoogleAccount = async () => {
    if (!authEnabled) {
      throw new Error('Login com Google indisponível neste ambiente. A autenticação Firebase ainda não foi configurada no frontend.');
    }

    try {
      const credential = await loginWithGoogle();
      await credential.user.getIdToken(true);
      const email = credential.user.email?.trim().toLowerCase();
      if (!email) {
        throw new Error('Não foi possível identificar o e-mail da conta Google utilizada.');
      }
      const authorizedUser = await resolveAuthorizedUser(email);
      setCurrentUserEmail(email);
      setCurrentUser(authorizedUser);
    } catch (error) {
      if ((error as Error)?.message === DIRECTORY_FETCH_FAILED) {
        throw new Error('Não foi possível validar seu acesso agora. Tente novamente em instantes.');
      }
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

  const requestPasswordReset = async (email: string) => {
    const normalized = email.trim().toLowerCase();
    await requestPasswordResetInApi(normalized);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    if (currentView === 'tracking' && trackingTicketToken) {
      params.set('tracking', trackingTicketToken);
      params.delete('view');
    } else {
      params.delete('tracking');
      if (currentView === 'public-form' || currentView === 'login' || currentView === 'approvals') {
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
        attachmentPreview,
        openAttachment,
        closeAttachment,
        inboxFilter,
        setInboxFilter,
        tickets,
        ticketsLoading,
        refreshTickets,
        updateTicket,
        addTicket,
        currentUser,
        currentUserEmail,
        setCurrentUserEmail,
        login,
        loginWithGoogleAccount,
        requestPasswordReset,
        logout,
        authEnabled,
        authResolved,
        authorizationResolved,
        theme,
        setTheme,
        availableThemes: APP_THEMES,
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



