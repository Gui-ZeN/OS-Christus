import React, { Component, lazy, ReactNode, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart2,
  DollarSign,
  FileText,
  Home,
  Image as ImageIcon,
  Inbox,
  Landmark,
  LogOut,
  Palette,
  ScrollText,
  Settings,
  Shield,
  X,
} from 'lucide-react';

import { SidebarIcon } from './components/ui/SidebarIcon';
import { useApp } from './context/AppContext';
import { ViewState } from './types';

const KpiView = lazy(async () => ({ default: (await import('./views/KpiView')).KpiView }));
const SettingsView = lazy(async () => ({ default: (await import('./views/SettingsView')).SettingsView }));
const TrackingView = lazy(async () => ({ default: (await import('./views/TrackingView')).TrackingView }));
const ApprovalsView = lazy(async () => ({ default: (await import('./views/ApprovalsView')).ApprovalsView }));
const FinanceView = lazy(async () => ({ default: (await import('./views/FinanceView')).FinanceView }));
const HomeView = lazy(async () => ({ default: (await import('./views/HomeView')).HomeView }));
const InboxView = lazy(async () => ({ default: (await import('./views/InboxView')).InboxView }));
const SplitLoginView = lazy(async () => ({ default: (await import('./views/SplitLoginView')).SplitLoginView }));
const LandingView = lazy(async () => ({ default: (await import('./views/LandingView')).LandingView }));
const PublicFormView = lazy(async () => ({ default: (await import('./views/PublicFormView')).PublicFormView }));
const EmailHealthView = lazy(async () => ({ default: (await import('./views/EmailHealthView')).EmailHealthView }));
const AuditLogsView = lazy(async () => ({ default: (await import('./views/AuditLogsView')).AuditLogsView }));

export const VIEWS = {
  LANDING: 'landing',
  LOGIN: 'login',
  PUBLIC_FORM: 'public-form',
  HOME: 'home',
  INBOX: 'inbox',
  USERS: 'users',
  KPI: 'kpi',
  SETTINGS: 'settings',
  TRACKING: 'tracking',
  APPROVALS: 'approvals',
  FINANCE: 'finance',
  EMAIL_HEALTH: 'email-health',
  AUDIT_LOGS: 'audit-logs',
} as const;

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-roman-text-sub font-serif italic p-8">
          <p className="text-base">Ocorreu um erro inesperado nesta tela.</p>
          <button
            className="text-roman-primary underline text-sm"
            onClick={() => this.setState({ hasError: false })}
          >
            Tentar novamente
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
  const {
    currentView,
    navigateTo,
    trackingTicketToken,
    attachmentPreview,
    closeAttachment,
    setActiveTicketId,
    tickets,
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
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const currentRole = currentUser?.role || '';
  const isRequesterRole = currentRole === 'Usuario';
  const canAccessInbox = !isRequesterRole;
  const canAccessApprovals = currentRole === 'Admin' || currentRole === 'Diretor';
  const canAccessFinance = currentRole === 'Admin' || currentRole === 'Diretor';
  const canAccessEmailHealth = currentRole === 'Admin' || currentRole === 'Diretor';
  const canAccessAudit = currentRole === 'Admin';
  const canAccessKpi = currentRole === 'Admin' || currentRole === 'Diretor';
  const canAccessSettings = currentRole === 'Admin';
  const restrictedViews = useMemo(
    () =>
      new Set<ViewState>(
        [
          !canAccessInbox ? VIEWS.INBOX : null,
          !canAccessApprovals ? VIEWS.APPROVALS : null,
          !canAccessFinance ? VIEWS.FINANCE : null,
          !canAccessEmailHealth ? VIEWS.EMAIL_HEALTH : null,
          !canAccessAudit ? VIEWS.AUDIT_LOGS : null,
          !canAccessKpi ? VIEWS.KPI : null,
          !canAccessSettings ? VIEWS.SETTINGS : null,
        ].filter(Boolean) as ViewState[]
      ),
    [canAccessInbox, canAccessApprovals, canAccessFinance, canAccessEmailHealth, canAccessAudit, canAccessKpi, canAccessSettings]
  );
  const initials =
    (currentUser?.name || currentUserEmail || 'RG')
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0]?.toUpperCase() || '')
      .join('') || 'RG';

  const canOpenView = (view: ViewState) => {
    if (view === VIEWS.INBOX) return canAccessInbox;
    if (view === VIEWS.APPROVALS) return canAccessApprovals;
    if (view === VIEWS.FINANCE) return canAccessFinance;
    if (view === VIEWS.EMAIL_HEALTH) return canAccessEmailHealth;
    if (view === VIEWS.AUDIT_LOGS) return canAccessAudit;
    if (view === VIEWS.KPI) return canAccessKpi;
    if (view === VIEWS.SETTINGS) return canAccessSettings;
    return true;
  };

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
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [attachmentPreview]);

  useEffect(() => {
    if (authEnabled && (!authResolved || (currentUserEmail && !authorizationResolved))) {
      return;
    }
    if (!currentUser) return;
    if (restrictedViews.has(currentView)) {
      navigateTo(VIEWS.HOME);
    }
  }, [authEnabled, authResolved, authorizationResolved, currentUser, currentUserEmail, currentView, navigateTo, restrictedViews]);

  useEffect(() => {
    if (currentView === VIEWS.APPROVALS) return;
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
    const publicViews = new Set<ViewState>([VIEWS.LANDING, VIEWS.LOGIN, VIEWS.PUBLIC_FORM, VIEWS.TRACKING]);
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
    if (currentUser && currentView === VIEWS.LOGIN) {
      const params = new URLSearchParams(window.location.search);
      const redirectView = params.get('redirectView') || params.get('view');
      if (redirectView === VIEWS.APPROVALS || redirectView === VIEWS.FINANCE || redirectView === VIEWS.INBOX || redirectView === VIEWS.SETTINGS || redirectView === VIEWS.KPI || redirectView === VIEWS.AUDIT_LOGS) {
        const requestedTicketId = params.get('ticketId');
        if (
          requestedTicketId &&
          (redirectView === VIEWS.APPROVALS || redirectView === VIEWS.FINANCE || redirectView === VIEWS.INBOX)
        ) {
          setActiveTicketId(requestedTicketId);
        }
        navigateTo(redirectView as ViewState);
      } else {
        navigateTo(VIEWS.HOME);
      }
    }
  }, [authEnabled, authResolved, authorizationResolved, currentUser, currentUserEmail, currentView, navigateTo, setActiveTicketId]);

  if (currentView === VIEWS.LANDING) {
    if (authEnabled && (!authResolved || (currentUserEmail && !authorizationResolved))) {
      return <ViewLoader fullScreen />;
    }
    return (
      <Suspense fallback={<ViewLoader fullScreen />}>
        <LandingView onOpenForm={() => navigateTo(VIEWS.PUBLIC_FORM)} onLogin={() => navigateTo(VIEWS.LOGIN)} />
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

  if (currentView === VIEWS.LOGIN) {
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
          onBack={() => navigateTo(VIEWS.LANDING)}
          authEnabled={authEnabled}
        />
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
    <div className="theme-bridge relative flex h-screen overflow-hidden bg-roman-bg text-roman-text-main font-sans text-[14px]">
      <aside className="sticky top-0 flex h-screen w-14 shrink-0 overflow-visible bg-roman-sidebar flex-col py-3 z-[90] border-r border-stone-900">
        <div className="flex items-center gap-3 px-4 mb-6 text-roman-primary justify-center">
          <Landmark size={22} />
        </div>
        <nav className="flex flex-col gap-1.5 w-full px-1.5">
          <SidebarIcon icon={<Home size={20} />} active={currentView === VIEWS.HOME} onClick={() => navigateTo(VIEWS.HOME)} title="Início" />
          {canAccessInbox && (
            <SidebarIcon icon={<Inbox size={20} />} active={currentView === VIEWS.INBOX} onClick={() => navigateTo(VIEWS.INBOX)} title="Caixa de Entrada" />
          )}
          {canAccessApprovals && <SidebarIcon icon={<Shield size={20} />} active={currentView === VIEWS.APPROVALS} onClick={() => navigateTo(VIEWS.APPROVALS)} title="Painel da Diretoria" />}
          {canAccessFinance && <SidebarIcon icon={<DollarSign size={20} />} active={currentView === VIEWS.FINANCE} onClick={() => navigateTo(VIEWS.FINANCE)} title="Financeiro" />}
          {canAccessAudit && <SidebarIcon icon={<ScrollText size={20} />} active={currentView === VIEWS.AUDIT_LOGS} onClick={() => navigateTo(VIEWS.AUDIT_LOGS)} title="Auditoria" />}
          {canAccessKpi && <SidebarIcon icon={<BarChart2 size={20} />} active={currentView === VIEWS.KPI} onClick={() => navigateTo(VIEWS.KPI)} title="Indicadores" />}
          {canAccessSettings && <SidebarIcon icon={<Settings size={20} />} active={currentView === VIEWS.SETTINGS} onClick={() => navigateTo(VIEWS.SETTINGS)} title="Configurações" />}
        </nav>
        <div className="mt-auto flex flex-col gap-3 px-2.5">
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
              <Palette size={18} />
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
                        className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${selected ? 'bg-roman-primary/15 text-roman-primary' : 'text-roman-text-main hover:bg-roman-bg'}`}
                      >
                        <span>{option.label}</span>
                        {selected && <span className="text-[10px] font-semibold uppercase tracking-wide">Ativo</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <button onClick={() => { void logout().finally(() => navigateTo(VIEWS.LANDING)); }} className="flex items-center justify-center text-white/70 hover:text-white transition-colors py-2" title="Sair" aria-label="Sair">
            <LogOut size={18} />
          </button>
          <div className="flex items-center justify-center rounded-xl border border-white/10 bg-roman-sidebar-light px-1.5 py-1.5" title={`Logado como: ${currentUser?.name || currentUserEmail || 'Usuário'}`}>
            <div className="w-8 h-8 rounded-full bg-roman-sidebar border border-roman-primary/30 flex items-center justify-center text-roman-primary font-serif font-medium text-xs">
              {initials}
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 min-h-0 flex flex-col min-w-0 overflow-hidden">
        <ErrorBoundary>
          <Suspense fallback={<ViewLoader />}>
            {currentView === VIEWS.HOME && <HomeView />}
            {currentView === VIEWS.INBOX && canAccessInbox && <InboxView />}
            {currentView === VIEWS.APPROVALS && canAccessApprovals && <ApprovalsView />}
            {currentView === VIEWS.FINANCE && canAccessFinance && <FinanceView />}
            {currentView === VIEWS.EMAIL_HEALTH && canAccessEmailHealth && <EmailHealthView />}
            {currentView === VIEWS.AUDIT_LOGS && canAccessAudit && <AuditLogsView />}
            {currentView === VIEWS.KPI && canAccessKpi && <KpiView />}
            {currentView === VIEWS.SETTINGS && canAccessSettings && <SettingsView />}
          </Suspense>
        </ErrorBoundary>
      </main>

      {attachmentPreview && (() => {
        const attachmentItems = attachmentPreview.items && attachmentPreview.items.length > 0
          ? attachmentPreview.items
          : [{ title: attachmentPreview.title, type: attachmentPreview.type, url: attachmentPreview.url || null }];
        const previewUrl = attachmentPreview.url || attachmentItems[0]?.url || null;

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
                  {attachmentPreview.type === 'pdf' ? <FileText size={20} className="text-roman-primary" /> : <ImageIcon size={20} className="text-roman-primary" />}
                  <h3 className="font-serif text-lg font-medium">{attachmentPreview.title}</h3>
                </div>
                <button onClick={closeAttachment} className="text-white/70 hover:text-white transition-colors">
                  <X size={24} />
                </button>
              </div>
              {attachmentItems.length > 1 && (
                <div className="px-4 py-3 border-b border-roman-border bg-roman-bg/60 flex flex-wrap gap-2">
                  {attachmentItems.map((item, index) => (
                    <span key={`${item.title}-${index}`} className="px-3 py-1.5 rounded-sm border bg-roman-surface text-roman-text-main border-roman-border text-xs font-medium">
                      {item.title}
                    </span>
                  ))}
                </div>
              )}
              <div className="flex-1 bg-roman-bg flex items-center justify-center p-8 overflow-auto">
                {attachmentPreview.type === 'image' && attachmentItems.some(item => item.url) ? (
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





