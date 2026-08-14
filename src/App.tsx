import React, { Component, lazy, ReactNode, Suspense, useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import {
  BarChart2,
  AlertTriangle,
  CalendarCheck,
  DollarSign,
  FileText,
  Home,
  Image as ImageIcon,
  Inbox,
  Loader2,
  LogOut,
  Palette,
  RefreshCw,
  ScrollText,
  Settings,
  Table,
  X,
} from 'lucide-react';

import { SidebarIcon } from './components/ui/SidebarIcon';
import { NotificationsPopover } from './components/NotificationsPopover';
import { WhatsNewModal } from './components/WhatsNewModal';
import { CURRENT_RELEASE, hasSeenRelease, markReleaseSeen } from './constants/releaseNotes';
import { useApp } from './context/AppContext';
import { useAttachmentPreview } from './context/AttachmentPreviewContext';
import type { AttachmentPreviewItem } from './context/AttachmentPreviewContext';
import { resolveAttachmentUrl } from './services/attachmentAccess';
import { mensagemDeErro } from './utils/errorMessage';
import { ViewState } from './types';

const CHUNK_RELOAD_KEY = 'os-chunk-reloaded-once';
function isChunkLoadError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '');
  const normalized = message.toLowerCase();
  return (
    normalized.includes('failed to fetch dynamically imported module') ||
    normalized.includes('importing a module script failed') ||
    normalized.includes('chunkloaderror') ||
    normalized.includes('loading chunk')
  );
}
function lazyWithAutoRecovery<T extends ComponentType<any>>(loader: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      const module = await loader();
      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem(CHUNK_RELOAD_KEY);
      }
      return module;
    } catch (error) {
      if (typeof window !== 'undefined' && isChunkLoadError(error)) {
        const alreadyReloaded = window.sessionStorage.getItem(CHUNK_RELOAD_KEY) === '1';
        if (!alreadyReloaded) {
          window.sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
          const url = new URL(window.location.href);
          url.searchParams.set('__chunkFix', String(Date.now()));
          window.location.replace(url.toString());
        } else {
          window.sessionStorage.removeItem(CHUNK_RELOAD_KEY);
        }
      }
      throw error;
    }
  });
}
const KpiView = lazyWithAutoRecovery(async () => ({ default: (await import('./views/KpiView')).KpiView }));
const SettingsView = lazyWithAutoRecovery(async () => ({ default: (await import('./views/SettingsView')).SettingsView }));
const TrackingView = lazyWithAutoRecovery(async () => ({ default: (await import('./views/TrackingView')).TrackingView }));
const FinanceView = lazyWithAutoRecovery(async () => ({ default: (await import('./views/FinanceView')).FinanceView }));
const HomeView = lazyWithAutoRecovery(async () => ({ default: (await import('./views/HomeView')).HomeView }));
const InboxView = lazyWithAutoRecovery(async () => ({ default: (await import('./views/InboxView')).InboxView }));
const OsBoardView = lazyWithAutoRecovery(async () => ({ default: (await import('./views/OsBoardView')).OsBoardView }));
const TodayView = lazyWithAutoRecovery(async () => ({ default: (await import('./views/TodayView')).TodayView }));
const SplitLoginView = lazyWithAutoRecovery(async () => ({ default: (await import('./views/SplitLoginView')).SplitLoginView }));
const PasswordResetView = lazyWithAutoRecovery(async () => ({ default: (await import('./views/PasswordResetView')).PasswordResetView }));
const PublicFormView = lazyWithAutoRecovery(async () => ({ default: (await import('./views/PublicFormView')).PublicFormView }));
const EmailHealthView = lazyWithAutoRecovery(async () => ({ default: (await import('./views/EmailHealthView')).EmailHealthView }));
const AuditLogsView = lazyWithAutoRecovery(async () => ({ default: (await import('./views/AuditLogsView')).AuditLogsView }));

export const VIEWS = {
  LANDING: 'landing',
  LOGIN: 'login',
  PASSWORD_RESET: 'password-reset',
  PUBLIC_FORM: 'public-form',
  HOME: 'home',
  TODAY: 'today',
  INBOX: 'inbox',
  OS_BOARD: 'os-board',
  USERS: 'users',
  KPI: 'kpi',
  SETTINGS: 'settings',
  TRACKING: 'tracking',
  FINANCE: 'finance',
  EMAIL_HEALTH: 'email-health',
  AUDIT_LOGS: 'audit-logs',
} as const;

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Quando muda, o boundary tenta renderizar de novo (ex.: ao trocar de view). */
  resetKey?: unknown;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: unknown) {
     
    console.error('Erro não tratado na view:', error, info);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
          <p className="text-roman-text-main font-serif text-lg">Algo deu errado ao carregar esta tela.</p>
          <p className="text-roman-text-sub text-sm max-w-md">
            Tente recarregar a página. Se o problema persistir, contate o suporte.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-sm bg-roman-primary hover:bg-roman-primary-hover text-roman-on-primary text-sm font-medium transition-colors"
          >
            Recarregar
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

function ViewLoader({ fullScreen = false }: { fullScreen?: boolean }) {
  if (fullScreen) {
    return (
      <div className="h-screen w-full bg-roman-bg flex items-center justify-center text-roman-text-sub font-serif italic">
        Carregando...
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center text-roman-text-sub font-serif italic">
      Carregando...
    </div>
  );
}

export default function App() {
  const { attachmentPreview, closeAttachment } = useAttachmentPreview();
  const {
    currentView,
    navigateTo,
    trackingTicketToken,
    setActiveTicketId,
    tickets,
    ticketsError,
    refreshTickets,
    updateTicket,
    login,
    loginWithGoogleAccount,
    requestPasswordReset,
    logout,
    currentUser,
    currentUserEmail,
    authEnabled,
    authResolved,
    authorizationResolved,
    theme,
    setTheme,
    availableThemes,
  } = useApp();

  const themeMenuRef = useRef<HTMLDivElement>(null);
  const attachmentContentRef = useRef<HTMLDivElement>(null);
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const [showAllAttachmentNames, setShowAllAttachmentNames] = useState(false);
  const [resolvedAttachmentItems, setResolvedAttachmentItems] = useState<AttachmentPreviewItem[]>([]);
  const [attachmentResolveLoading, setAttachmentResolveLoading] = useState(false);
  const [attachmentResolveError, setAttachmentResolveError] = useState<string | null>(null);
  const currentRole = currentUser?.role || '';
  const isRequesterRole = currentRole === 'Usuario';
  const canAccessInbox = !isRequesterRole;
  const canAccessOsBoard = currentRole === 'Admin' || currentRole === 'Gestor';
  /**
   * A tela Hoje deixou de ser prévia de Admin — ela é a porta de entrada.
   *
   * Ficou fechada enquanto era experimento, e o preço apareceu na medição de 13/08:
   * a agenda existe COMPLETA (campo, gravação, precedência, tela), e tinha **1 OS
   * com data futura em 181**. Não era desenho ruim nem falta de adesão — os 7
   * gestores, incluindo quem responde por 406 das 1.207 ações dos últimos 90 dias,
   * não enxergavam a tela onde a próxima ação se define.
   *
   * `Usuario` (solicitante, 18 dos 28 cadastrados) continua fora: a agenda é
   * operacional, e a tela dele é o portal de acompanhamento no Início.
   */
  const canAccessToday = currentRole === 'Admin' || currentRole === 'Gestor' || currentRole === 'Diretor';

  /**
   * Onde a pessoa cai ao entrar — e para onde volta quando a tela atual é negada.
   *
   * Quem opera cai na agenda; o solicitante cai no portal dele. Derivado do papel de
   * propósito: mandar todo mundo para uma constante foi o que criou o saguão que não
   * levava a lugar nenhum.
   */
  const telaDeEntrada = canAccessToday ? VIEWS.TODAY : VIEWS.HOME;
  const canAccessFinance = currentRole === 'Admin' || currentRole === 'Gestor';
  const canAccessEmailHealth = currentRole === 'Admin' || currentRole === 'Diretor';
  const canAccessAudit = currentRole === 'Admin';
  const canAccessKpi = currentRole === 'Admin' || currentRole === 'Diretor' || currentRole === 'Usuario';
  const canAccessSettings = currentRole === 'Admin' || currentRole === 'Gestor';
  const isManagerOrAdmin = currentRole === 'Admin' || currentRole === 'Gestor';

  // Novidades (patch notes): aparece uma vez por versão, só para Admin/Gestor.
  const [showWhatsNew, setShowWhatsNew] = useState(false);
  useEffect(() => {
    if (isManagerOrAdmin && !hasSeenRelease(CURRENT_RELEASE.version)) {
      setShowWhatsNew(true);
    }
  }, [isManagerOrAdmin]);
  const closeWhatsNew = () => {
    markReleaseSeen(CURRENT_RELEASE.version);
    setShowWhatsNew(false);
  };

  const restrictedViews = useMemo(
    () =>
      new Set<ViewState>(
        [
          !canAccessInbox ? VIEWS.INBOX : null,
          !canAccessToday ? VIEWS.TODAY : null,
          !canAccessFinance ? VIEWS.FINANCE : null,
          !canAccessEmailHealth ? VIEWS.EMAIL_HEALTH : null,
          !canAccessAudit ? VIEWS.AUDIT_LOGS : null,
          !canAccessKpi ? VIEWS.KPI : null,
          !canAccessSettings ? VIEWS.SETTINGS : null,
        ].filter(Boolean) as ViewState[]
      ),
    [canAccessInbox, canAccessToday, canAccessFinance, canAccessEmailHealth, canAccessAudit, canAccessKpi, canAccessSettings]
  );
  const initials =
    (currentUser?.name || currentUserEmail || 'RG')
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0]?.toUpperCase() || '')
      .join('') || 'RG';


  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (themeMenuRef.current && !themeMenuRef.current.contains(event.target as Node) && showThemeMenu) {
        setShowThemeMenu(false);
      }
    }

    if (showThemeMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showThemeMenu]);

  useEffect(() => {
    function handleEsc(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      if (attachmentPreview) closeAttachment();
      if (showThemeMenu) setShowThemeMenu(false);
    }
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [attachmentPreview, closeAttachment, showThemeMenu]);

  useEffect(() => {
    if (!attachmentPreview) return;
    setShowAllAttachmentNames(false);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Always start attachment modal at the top to avoid opening mid-scroll.
    window.requestAnimationFrame(() => {
      if (attachmentContentRef.current) {
        attachmentContentRef.current.scrollTop = 0;
      }
    });
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [attachmentPreview]);

  useEffect(() => {
    let cancelled = false;
    if (!attachmentPreview) {
      setResolvedAttachmentItems([]);
      setAttachmentResolveLoading(false);
      setAttachmentResolveError(null);
      return;
    }

    const rawItems = attachmentPreview.items && attachmentPreview.items.length > 0
      ? attachmentPreview.items
      : [{
          title: attachmentPreview.title,
          type: attachmentPreview.type,
          url: attachmentPreview.url || null,
          ticketId: attachmentPreview.ticketId || null,
          path: attachmentPreview.path || null,
          driveFileId: attachmentPreview.driveFileId || null,
        }];
    const visibleItems = rawItems.filter(item => {
      const fileRef = `${String(item.title || '')} ${String(item.url || '')} ${String(item.path || '')}`.toLowerCase();
      return !fileRef.includes('.gif');
    });

    setAttachmentResolveLoading(true);
    setAttachmentResolveError(null);
    setResolvedAttachmentItems([]);
    void Promise.all(
      visibleItems.map(async item => {
        try {
          const url = await resolveAttachmentUrl(item);
          return { item: { ...item, url }, error: null };
        } catch (error) {
          return {
            item: { ...item, url: null },
            error: mensagemDeErro(error, 'Não foi possível abrir o anexo.'),
          };
        }
      })
    ).then(results => {
      if (cancelled) return;
      setResolvedAttachmentItems(results.map(result => result.item));
      const failed = results.filter(result => result.error);
      if (failed.length > 0) {
        setAttachmentResolveError(
          failed.length === results.length
            ? failed[0].error
            : `${failed.length} anexo(s) não puderam ser carregados.`
        );
      }
      setAttachmentResolveLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [attachmentPreview]);

  useEffect(() => {
    if (authEnabled && (!authResolved || (currentUserEmail && !authorizationResolved))) {
      return;
    }
    if (!currentUser) return;
    if (restrictedViews.has(currentView)) {
      navigateTo(telaDeEntrada);
    }
  }, [authEnabled, authResolved, authorizationResolved, currentUser, currentUserEmail, currentView, navigateTo, restrictedViews, telaDeEntrada]);

  useEffect(() => {
    const reviewerName = currentUser?.name?.trim();
    if (!reviewerName) return;
    const reviewerKey = reviewerName.toLocaleLowerCase('pt-BR');

    tickets
      .filter(ticket => String(ticket.viewingBy?.name || '').trim().toLocaleLowerCase('pt-BR') === reviewerKey)
      .forEach(ticket => {
        updateTicket(ticket.id, { viewingBy: null });
      });
  }, [currentView, currentUser?.name, tickets, updateTicket]);

  useEffect(() => {
    if (currentView === VIEWS.USERS) {
      navigateTo(VIEWS.SETTINGS);
    }
  }, [currentView, navigateTo]);

  useEffect(() => {
    const publicViews = new Set<ViewState>([VIEWS.LANDING, VIEWS.LOGIN, VIEWS.PASSWORD_RESET, VIEWS.PUBLIC_FORM, VIEWS.TRACKING]);
    if (authEnabled && (!authResolved || (currentUserEmail && !authorizationResolved))) {
      return;
    }
    if (!currentUser && !publicViews.has(currentView)) {
      const params = new URLSearchParams(window.location.search);
      params.set('redirectView', currentView);
      const query = params.toString();
      window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
      const timer = window.setTimeout(() => {
        navigateTo(VIEWS.LOGIN);
      }, 900);
      return () => window.clearTimeout(timer);
    }
    // LANDING conta junto com LOGIN desde 13/08: as duas renderizam a MESMA tela de
    // entrada. Sem isto, quem chegou por `/` (o caso normal, e o valor guardado em
    // localStorage) logava com sucesso e ficava preso no próprio formulário, porque o
    // redirecionamento só olhava para LOGIN. Seis E2E caíram por isso.
    if (currentUser && (currentView === VIEWS.LOGIN || currentView === VIEWS.LANDING)) {
      const params = new URLSearchParams(window.location.search);
      const redirectView = params.get('redirectView') || params.get('view');
      if (redirectView === VIEWS.FINANCE || redirectView === VIEWS.INBOX || redirectView === VIEWS.SETTINGS || redirectView === VIEWS.KPI || redirectView === VIEWS.AUDIT_LOGS) {
        const requestedTicketId = params.get('ticketId');
        if (
          requestedTicketId &&
          (redirectView === VIEWS.FINANCE || redirectView === VIEWS.INBOX)
        ) {
          setActiveTicketId(requestedTicketId);
        }
        navigateTo(redirectView as ViewState);
      } else {
        navigateTo(telaDeEntrada);
      }
    }
  }, [authEnabled, authResolved, authorizationResolved, currentUser, currentUserEmail, currentView, navigateTo, setActiveTicketId, telaDeEntrada]);

  /**
   * A LANDING VIROU O PRÓPRIO LOGIN (13/08).
   *
   * A tela anterior repetia o painel esquerdo do login — mesmo logo, mesmo "Gestão de
   * Manutenção" em serifa com o dourado no itálico — e o único conteúdo dela eram dois
   * cartões: entrar e abrir chamado. As 28 pessoas com acesso pagavam um clique por
   * dia para atravessar uma tela que repetia a seguinte.
   *
   * `LANDING` continua existindo como rota (é o valor guardado em localStorage e o
   * padrão de quem chega deslogado) — só que agora renderiza a mesma coisa que
   * `LOGIN`, sem "Voltar", porque não há para onde voltar.
   */
  if (currentView === VIEWS.LANDING || currentView === VIEWS.LOGIN) {
    if (authEnabled && (!authResolved || (currentUserEmail && !authorizationResolved))) {
      return <ViewLoader fullScreen />;
    }
    return (
      <Suspense fallback={<ViewLoader fullScreen />}>
        <SplitLoginView
          onLogin={async (email, password) => {
            await login(email, password);
          }}
          onGoogleLogin={async () => {
            await loginWithGoogleAccount();
          }}
          onForgotPassword={async email => {
            await requestPasswordReset(email);
          }}
          onOpenForm={() => navigateTo(VIEWS.PUBLIC_FORM)}
          authEnabled={authEnabled}
        />
      </Suspense>
    );
  }

  if (currentView === VIEWS.PUBLIC_FORM) {
    return (
      <Suspense fallback={<ViewLoader fullScreen />}>
        <PublicFormView onBack={() => navigateTo(VIEWS.LANDING)} />
      </Suspense>
    );
  }

  if (currentView === VIEWS.PASSWORD_RESET) {
    return (
      <Suspense fallback={<ViewLoader fullScreen />}>
        <PasswordResetView onBack={() => navigateTo(VIEWS.LOGIN)} />
      </Suspense>
    );
  }

  if (currentView === VIEWS.TRACKING) {
    return (
      <Suspense fallback={<ViewLoader fullScreen />}>
        <TrackingView ticketToken={trackingTicketToken} onBack={() => navigateTo(canAccessInbox ? VIEWS.INBOX : VIEWS.HOME)} />
      </Suspense>
    );
  }

  if (authEnabled && (!authResolved || (currentUserEmail && !authorizationResolved))) {
    return <ViewLoader fullScreen />;
  }

  return (
    <div className="theme-bridge relative flex h-screen overflow-hidden bg-roman-bg text-roman-text-main font-sans text-sm">
      <aside className="sticky top-0 flex h-screen w-14 shrink-0 overflow-visible bg-roman-sidebar flex-col py-3 z-[90] border-r border-roman-border">
        <div className="flex items-center justify-center px-2 mb-6">
          <img src="/serv3-selo.svg" alt="Serv3" className="h-8 w-8" />
        </div>
        <nav className="flex flex-col gap-1.5 w-full px-1.5">
          {/* O Início virou o portal DO SOLICITANTE e sai da barra de quem opera.
              Medido em 13/08: para Admin/Gestor/Diretor, 100% do que havia nele era
              link para outra tela — quatro cartões e três atalhos que abriam a Gestão.
              Saguão que só aponta para as duas telas onde o trabalho acontece é uma
              parada a mais no caminho, não uma tela. */}
          {isRequesterRole && (
            <SidebarIcon icon={<Home size={20} />} active={currentView === VIEWS.HOME} onClick={() => navigateTo(VIEWS.HOME)} title="Minhas solicitações" />
          )}
          {canAccessToday && <SidebarIcon icon={<CalendarCheck size={20} />} active={currentView === VIEWS.TODAY} onClick={() => navigateTo(VIEWS.TODAY)} title="Hoje" />}
          {canAccessInbox && (
            <SidebarIcon icon={<Inbox size={20} />} active={currentView === VIEWS.INBOX} onClick={() => navigateTo(VIEWS.INBOX)} title="Caixa de Entrada" />
          )}
          {canAccessOsBoard && <SidebarIcon icon={<Table size={20} />} active={currentView === VIEWS.OS_BOARD} onClick={() => navigateTo(VIEWS.OS_BOARD)} title="Gestão de OS" />}
          {canAccessFinance && <SidebarIcon icon={<DollarSign size={20} />} active={currentView === VIEWS.FINANCE} onClick={() => navigateTo(VIEWS.FINANCE)} title="Financeiro" />}
          {canAccessAudit && <SidebarIcon icon={<ScrollText size={20} />} active={currentView === VIEWS.AUDIT_LOGS} onClick={() => navigateTo(VIEWS.AUDIT_LOGS)} title="Auditoria" />}
          {canAccessKpi && <SidebarIcon icon={<BarChart2 size={20} />} active={currentView === VIEWS.KPI} onClick={() => navigateTo(VIEWS.KPI)} title="Indicadores" />}
          {canAccessSettings && <SidebarIcon icon={<Settings size={20} />} active={currentView === VIEWS.SETTINGS} onClick={() => navigateTo(VIEWS.SETTINGS)} title="Configurações" />}
        </nav>
        <div className="mt-auto flex flex-col gap-3 px-2.5">
          {currentUser?.id && <NotificationsPopover userKey={currentUser.id} />}
          <div className="relative" ref={themeMenuRef}>
            <button
              onClick={event => {
                event.stopPropagation();
                setShowThemeMenu(previous => !previous);
              }}
              className={`w-full flex items-center justify-center py-2 transition-colors ${showThemeMenu ? 'text-roman-primary' : 'text-white/70 hover:text-white'}`}
              title="Temas"
              aria-label="Temas"
              aria-expanded={showThemeMenu}
            >
              <Palette size={16} />
            </button>
            {showThemeMenu && (
              <div className="fixed left-[4.25rem] bottom-24 z-[220] w-64 rounded-xl border border-roman-border bg-roman-surface p-2.5 shadow-2xl">
                <p className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-wide text-roman-text-sub">Temas</p>
                <div className="space-y-1">
                  {availableThemes.map(option => {
                    const selected = theme === option.id;
                    return (
                      <button
                        key={option.id}
                        onClick={() => {
                          setTheme(option.id);
                          setShowThemeMenu(false);
                        }}
                        className={`flex w-full items-center justify-between rounded-sm px-2.5 py-2 text-left text-xs transition-colors ${selected ? 'bg-roman-primary/15 text-roman-primary' : 'text-roman-text-main hover:bg-roman-bg'}`}
                      >
                        <span>{option.label}</span>
                        {selected && <span className="text-[11px] font-semibold uppercase tracking-wide">Ativo</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <button onClick={() => { void logout().finally(() => navigateTo(VIEWS.LANDING)); }} className="flex items-center justify-center text-white/70 hover:text-white transition-colors py-2" title="Sair" aria-label="Sair">
            <LogOut size={16} />
          </button>
          <div className="flex items-center justify-center rounded-xl border border-white/10 bg-roman-sidebar-light px-1.5 py-1.5" title={`Logado como: ${currentUser?.name || currentUserEmail || 'Usuário'}`}>
            <div className="w-8 h-8 rounded-full bg-roman-sidebar border border-roman-primary/30 flex items-center justify-center text-roman-primary font-serif font-medium text-xs">
              {initials}
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 min-h-0 flex flex-col min-w-0 overflow-hidden">
        {ticketsError && (
          <div className="flex min-h-11 shrink-0 items-center justify-between gap-3 border-b border-roman-primary/35 bg-roman-primary/12 px-3 py-2 text-xs text-roman-text-main md:px-4">
            <div className="flex min-w-0 items-center gap-2">
              <AlertTriangle size={14} className="shrink-0" />
              <span className="truncate">
                Não foi possível atualizar os tickets. Os dados já carregados foram mantidos.
              </span>
            </div>
            <button
              type="button"
              onClick={() => void refreshTickets()}
              className="inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-sm border border-roman-primary/35 bg-roman-surface px-2.5 font-medium hover:bg-roman-primary/12"
            >
              <RefreshCw size={14} />
              Tentar novamente
            </button>
          </div>
        )}
        <ErrorBoundary resetKey={currentView}>
          <Suspense fallback={<ViewLoader />}>
            {currentView === VIEWS.HOME && <HomeView />}
            {currentView === VIEWS.TODAY && canAccessToday && <TodayView />}
            {currentView === VIEWS.INBOX && canAccessInbox && <InboxView />}
            {currentView === VIEWS.OS_BOARD && canAccessOsBoard && <OsBoardView />}
            {currentView === VIEWS.FINANCE && canAccessFinance && <FinanceView />}
            {currentView === VIEWS.EMAIL_HEALTH && canAccessEmailHealth && <EmailHealthView />}
            {currentView === VIEWS.AUDIT_LOGS && canAccessAudit && <AuditLogsView />}
            {currentView === VIEWS.KPI && canAccessKpi && <KpiView />}
            {currentView === VIEWS.SETTINGS && canAccessSettings && <SettingsView />}
          </Suspense>
        </ErrorBoundary>
      </main>

      <WhatsNewModal isOpen={showWhatsNew} onClose={closeWhatsNew} />

      {attachmentPreview && (() => {
        const attachmentItems = resolvedAttachmentItems;
        const previewUrl = attachmentItems[0]?.url || null;
        const visibleAttachmentNames = showAllAttachmentNames ? attachmentItems : attachmentItems.slice(0, 6);
        const hasMoreAttachmentNames = attachmentItems.length > 6;

        return (
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 md:p-8 animate-in fade-in"
            onClick={event => {
              if (event.target === event.currentTarget) closeAttachment();
            }}
            role="dialog"
            aria-modal="true"
            aria-label="Visualizador de anexo"
          >
            <div className="bg-roman-surface w-full max-w-5xl h-[88vh] md:h-[82vh] rounded-sm shadow-2xl flex flex-col overflow-hidden border border-roman-border">
              <div className="flex justify-between items-center p-4 border-b border-roman-border bg-roman-sidebar text-white">
                <div className="flex items-center gap-3">
                  {attachmentPreview.type === 'image' ? <ImageIcon size={20} className="text-roman-primary" /> : <FileText size={20} className="text-roman-primary" />}
                  <h3 className="font-serif text-lg font-medium">{attachmentPreview.title}</h3>
                </div>
                <button onClick={closeAttachment} className="text-white/70 hover:text-white transition-colors">
                  <X size={20} />
                </button>
              </div>
              {attachmentItems.length > 1 && (
                <div className="px-4 py-3 border-b border-roman-border bg-roman-bg/60">
                  <div className="flex flex-wrap gap-2">
                    {visibleAttachmentNames.map((item, index) => (
                    <span key={`${item.title}-${index}`} className="px-3 py-1.5 rounded-sm border bg-roman-surface text-roman-text-main border-roman-border text-xs font-medium">
                      {item.title}
                    </span>
                    ))}
                  </div>
                  {hasMoreAttachmentNames && (
                    <button
                      type="button"
                      onClick={() => setShowAllAttachmentNames(current => !current)}
                      className="mt-2 text-xs font-medium text-roman-primary hover:underline"
                    >
                      {showAllAttachmentNames ? 'Mostrar menos' : `Ver todos (${attachmentItems.length})`}
                    </button>
                  )}
                </div>
              )}
              {attachmentResolveError && (
                <div className="border-b border-roman-danger/35 bg-roman-danger/12 px-4 py-2 text-xs text-roman-danger" role="alert">
                  {attachmentResolveError}
                </div>
              )}
              <div ref={attachmentContentRef} className="flex-1 bg-roman-bg p-8 overflow-auto">
                {attachmentResolveLoading ? (
                  <div className="flex h-full items-center justify-center gap-2 text-sm text-roman-text-sub">
                    <Loader2 size={16} className="animate-spin" />
                    Carregando anexo...
                  </div>
                ) : attachmentPreview.type === 'image' && attachmentItems.some(item => item.url) ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
                    {attachmentItems.map((item, index) => (
                      <div key={`${item.title}-${index}`} className="bg-roman-surface border border-roman-border shadow-lg rounded-sm overflow-hidden">
                        <div className="px-4 py-2 border-b border-roman-border text-sm font-medium text-roman-text-main">{item.title}</div>
                        {item.url ? (
                          <img
                            src={item.url}
                            alt={item.title}
                            className="w-full max-h-[60vh] object-contain bg-roman-bg"
                          />
                        ) : (
                          <div className="h-80 flex items-center justify-center text-roman-text-sub font-serif italic">Pré-visualização indisponível</div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : attachmentPreview.type === 'pdf' && previewUrl ? (
                  <iframe
                    title={attachmentPreview.title}
                    src={previewUrl}
                    className="w-full h-full bg-roman-surface border border-roman-border shadow-lg"
                  />
                ) : attachmentPreview.type === 'image' ? (
                  <div className="flex flex-col items-center justify-center gap-4 text-roman-text-sub">
                    <ImageIcon size={64} strokeWidth={1} />
                    <p className="font-serif italic text-sm">Pré-visualização indisponível</p>
                    <p className="text-xs opacity-60">{attachmentPreview.title}</p>
                  </div>
                ) : (
                  <div className="w-full max-w-2xl h-full bg-roman-surface shadow-lg border border-roman-border p-12 flex flex-col">
                    <div className="border-b-2 border-roman-border pb-4 mb-8 flex justify-between items-end">
                      <h1 className="text-3xl font-serif font-bold text-roman-text-main">Documento</h1>
                      <span className="text-roman-text-sub font-mono">Prévia indisponível</span>
                    </div>
                    <div className="space-y-4 flex-1 text-roman-text-sub">
                      <p>O arquivo não pôde ser renderizado no navegador.</p>
                      {previewUrl && (
                        <a href={previewUrl} target="_blank" rel="noreferrer" className="text-roman-primary underline">Abrir arquivo em nova aba</a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}









