import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
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

interface TicketUpdateOptions {
  sendEmailUpdate?: boolean;
  /** Edição pontual do horário de UMA entrada de histórico já existente
   *  (o servidor aplica só o `time` da entrada; o array em `updates.history` é
   *  usado apenas para o update otimista local). */
  historyTimeEdit?: { id: string; time: string };
}

interface AppContextType {
  currentView: ViewState;
  navigateTo: (view: ViewState) => void;
  activeTicketId: string;
  setActiveTicketId: (id: string) => void;
  trackingTicketToken: string | null;
  setTrackingTicketToken: (token: string | null) => void;
  inboxFilter: InboxFilter;
  setInboxFilter: (filter: InboxFilter) => void;
  tickets: Ticket[];
  ticketsLoading: boolean;
  refreshTickets: (options?: { silent?: boolean }) => Promise<void>;
  updateTicket: (id: string, updates: Partial<Ticket>, options?: TicketUpdateOptions) => Promise<boolean>;
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
const OPERATIONAL_POLL_INTERVAL_MS = 30_000;
// A cada N ms o poll faz uma carga COMPLETA (em vez de delta) para reconciliar
// exclusões de OS — o delta por `updatedAt` não enxerga docs apagados.
const FULL_RECONCILE_INTERVAL_MS = 5 * 60_000;

function getInitialView(): ViewState {
  if (typeof window === 'undefined') return 'landing';
  const params = new URLSearchParams(window.location.search);
  const requestedView = params.get('view');
  const mode = params.get('mode');
  const oobCode = params.get('oobCode');
  if ((requestedView === 'password-reset' || mode === 'resetPassword') && oobCode) {
    return 'password-reset';
  }
  const queryAllowed: ViewState[] = ['landing', 'login', 'password-reset', 'public-form', 'home', 'inbox', 'os-board', 'kpi', 'settings', 'tracking', 'approvals', 'finance', 'audit-logs', 'users', 'email-health'];
  if (queryAllowed.includes(requestedView as ViewState)) {
    return requestedView as ViewState;
  }
  const stored = window.localStorage.getItem('serv3-current-view');
  const allowed: ViewState[] = ['landing', 'login', 'password-reset', 'public-form', 'home', 'inbox', 'os-board', 'users', 'kpi', 'settings', 'tracking', 'approvals', 'finance', 'email-health', 'audit-logs'];
  return allowed.includes(stored as ViewState) ? (stored as ViewState) : 'landing';
}

function getInitialUserEmail() {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem('serv3-user-email') || '';
}

function getInitialTheme(): AppThemeId {
  if (typeof window === 'undefined') return DEFAULT_APP_THEME;
  const stored = String(window.localStorage.getItem('serv3-theme') || '').trim() as AppThemeId;
  return APP_THEMES.some(theme => theme.id === stored) ? stored : DEFAULT_APP_THEME;
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

// Assinatura barata por ticket: muda sempre que algo relevante muda. `updatedAt`
// é carimbado pelo backend em TODA escrita (cobre mudanças de detalhe); os demais
// campos cobrem o que a lista/cabeçalho mostram e o caso de `updatedAt` ausente.
function ticketSignature(t: Ticket): string {
  const updated = t.updatedAt instanceof Date ? t.updatedAt.getTime() : String(t.updatedAt ?? '');
  const viewingAt = t.viewingBy?.at instanceof Date ? t.viewingBy.at.getTime() : (t.viewingBy?.at ?? '');
  const viewing = t.viewingBy ? `${t.viewingBy.name}@${viewingAt}` : '';
  return `${t.id}|${updated}|${t.history?.length ?? 0}|${t.status}|${t.priority}|${viewing}`;
}

// Evita re-render do app a cada poll de 10s quando nada relevante mudou. Antes
// fazia JSON.stringify da lista INTEIRA (com todo o histórico) 2x — custo
// O(payload) na main thread a cada ciclo. Agora compara assinaturas, O(N).
function areTicketListsEqual(a: Ticket[], b: Ticket[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (ticketSignature(a[i]) !== ticketSignature(b[i])) return false;
  }
  return true;
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
  const [inboxFilter, setInboxFilterState] = useState<InboxFilter>(DEFAULT_FILTER);
  const [allTickets, setAllTickets] = useState<Ticket[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [currentUserEmail, setCurrentUserEmailState] = useState(getInitialUserEmail());
  const [currentUser, setCurrentUser] = useState<DirectoryUser | null>(null);
  const [, setCatalogRegions] = useState<CatalogRegion[]>([]);
  const [, setCatalogSites] = useState<CatalogSite[]>([]);
  const [theme, setThemeState] = useState<AppThemeId>(getInitialTheme);

  const refreshCountRef = useRef(0);
  const pendingTicketUpdatesRef = useRef<Record<string, { ticket: Ticket; expiresAt: number }>>({});
  // Leitura incremental: `since` do último poll e quando foi a última carga completa.
  const lastSyncTimeRef = useRef<string | null>(null);
  const lastFullSyncAtRef = useRef<number>(0);

  const prunePendingTicketUpdates = () => {
    const now = Date.now();
    const pending = pendingTicketUpdatesRef.current;
    for (const id of Object.keys(pending)) {
      const entry = pending[id];
      if (!entry || entry.expiresAt <= now) {
        delete pending[id];
      }
    }
  };

  const registerPendingTicketUpdate = (id: string, ticket: Ticket) => {
    pendingTicketUpdatesRef.current[id] = {
      ticket,
      expiresAt: Date.now() + 30_000,
    };
  };

  const clearPendingTicketUpdate = (id: string) => {
    delete pendingTicketUpdatesRef.current[id];
  };

  const mergeRemoteWithPendingTickets = (remote: Ticket[]) => {
    prunePendingTicketUpdates();
    const pending = pendingTicketUpdatesRef.current;
    const merged = remote.map(ticket => pending[ticket.id]?.ticket || ticket);
    for (const id of Object.keys(pending)) {
      const entry = pending[id];
      if (!merged.some(ticket => ticket.id === id)) {
        merged.unshift(entry.ticket);
      }
    }
    return merged;
  };

  // Aplica o delta (só OS alteradas) sobre a lista atual: substitui as existentes
  // por id, acrescenta as novas e reordena por data desc (mesma ordem do backend).
  const applyTicketDelta = (current: Ticket[], delta: Ticket[]) => {
    if (delta.length === 0) return current;
    const byId = new Map(current.map(ticket => [ticket.id, ticket]));
    for (const ticket of delta) byId.set(ticket.id, ticket);
    const timeMs = (t: Ticket) => {
      const value = t.time instanceof Date ? t.time.getTime() : new Date(t.time as unknown as string).getTime();
      return Number.isNaN(value) ? 0 : value;
    };
    return [...byId.values()].sort((a, b) => timeMs(b) - timeMs(a));
  };

  const refreshTickets = useCallback(async (options?: { silent?: boolean }) => {
    const generation = ++refreshCountRef.current;
    const silent = options?.silent ?? false;
    if (authEnabled && !authResolved) {
      return;
    }

    if (!currentUserEmail || !currentUser) {
      lastSyncTimeRef.current = null;
      lastFullSyncAtRef.current = 0;
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
      // Carga COMPLETA na primeira vez, sempre que o usuário abre uma tela
      // (não-silencioso) e periodicamente para reconciliar exclusões. Nos demais
      // polls, DELTA: só o que mudou desde o último `serverTime` — corta as
      // leituras do Firestore de ~164/ciclo para ~0.
      const now = Date.now();
      const forceFull =
        !silent ||
        !lastSyncTimeRef.current ||
        now - lastFullSyncAtRef.current > FULL_RECONCILE_INTERVAL_MS;

      const result = await fetchTicketsFromApi(forceFull ? null : lastSyncTimeRef.current);
      if (generation !== refreshCountRef.current) return;
      if (result.serverTime) lastSyncTimeRef.current = result.serverTime;

      if (result.mode === 'delta') {
        // Nada mudou: sem re-render, sem custo. (o delta pode vir vazio)
        if (result.tickets.length === 0) return;
        setAllTickets(prev => {
          const next = mergeRemoteWithPendingTickets(applyTicketDelta(prev, result.tickets));
          return areTicketListsEqual(prev, next) ? prev : next;
        });
      } else {
        lastFullSyncAtRef.current = now;
        const merged = mergeRemoteWithPendingTickets(result.tickets);
        setAllTickets(prev => (areTicketListsEqual(prev, merged) ? prev : merged));
      }
    } catch {
      if (!silent && generation === refreshCountRef.current) {
        setAllTickets([]);
      }
    } finally {
      if (!silent && generation === refreshCountRef.current) {
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
              previous.name === found.name &&
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
      window.localStorage.setItem('serv3-user-email', currentUserEmail);
    } else {
      window.localStorage.removeItem('serv3-user-email');
    }
  }, [currentUserEmail]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const userName = String(currentUser?.name || '').trim();
    if (userName) {
      window.localStorage.setItem('serv3-user-name', userName);
    } else if (!currentUserEmail) {
      window.localStorage.removeItem('serv3-user-name');
    }
  }, [currentUser?.name, currentUserEmail]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('serv3-current-view', currentView);
  }, [currentView]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('data-theme', theme);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('serv3-theme', theme);
    }
  }, [theme]);

  const tickets = allTickets;

  useEffect(() => {
    if (tickets.length === 0) {
      if (activeTicketId !== '') setActiveTicketId('');
      return;
    }
    if (!tickets.some(ticket => ticket.id === activeTicketId)) {
      setActiveTicketId(tickets[0].id);
    }
  }, [tickets, activeTicketId]);

  const updateTicket = (id: string, updates: Partial<Ticket>, options?: TicketUpdateOptions): Promise<boolean> => {
    const previousTicket = allTickets.find(ticket => ticket.id === id);
    if (!previousTicket) return Promise.resolve(false);

    const nextTicket: Ticket = { ...previousTicket, ...updates };
    registerPendingTicketUpdate(id, nextTicket);
    setAllTickets(prev => prev.map(ticket => (ticket.id === id ? nextTicket : ticket)));

    // Retorna se PERSISTIU: o chamador (composer) pode aguardar antes de limpar o
    // texto e disparar e-mail — sem isto, uma falha de PATCH perdia a mensagem
    // digitada em silêncio e podia notificar o solicitante de algo que não gravou.
    return (async () => {
      try {
        await patchTicketInApi(id, updates, options?.historyTimeEdit ? { historyTimeEdit: options.historyTimeEdit } : undefined);
        clearPendingTicketUpdate(id);
      } catch (error) {
        clearPendingTicketUpdate(id);
        setAllTickets(prev => prev.map(ticket => (ticket.id === id ? previousTicket : ticket)));
        console.error('[updateTicket] Failed to persist update for ticket', id, '— reverted optimistic update.', error);
        return false;
      }

      const shouldSendEmailUpdate = options?.sendEmailUpdate !== false;
      if (shouldSendEmailUpdate && updates.status && previousTicket.status !== nextTicket.status) {
        try {
          await notifyTicketStatusChange(nextTicket, previousTicket.status);
        } catch (error) {
          console.error('[updateTicket] Status persisted, but status e-mail notification failed for ticket', id, error);
        }
      }
      return true;
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
    const mode = params.get('mode');
    const oobCode = params.get('oobCode');
    if ((params.get('view') === 'password-reset' || mode === 'resetPassword') && oobCode) {
      setCurrentView('password-reset');
      return;
    }

    const allowedViews: ViewState[] = ['public-form', 'login', 'password-reset', 'home', 'inbox', 'os-board', 'approvals', 'finance', 'kpi', 'settings', 'audit-logs'];
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
      if (currentView === 'password-reset') {
        params.set('view', currentView);
      } else if (currentView === 'public-form' || currentView === 'login' || currentView === 'approvals') {
        params.delete('mode');
        params.delete('oobCode');
        params.delete('apiKey');
        params.delete('lang');
        params.delete('issuedAt');
        params.set('view', currentView);
      } else {
        params.delete('mode');
        params.delete('oobCode');
        params.delete('apiKey');
        params.delete('lang');
        params.delete('issuedAt');
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






