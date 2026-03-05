import React, { lazy, Suspense, useRef, useEffect } from 'react';
import { Home, Inbox, Users, BarChart2, Settings, Landmark, LogOut, X, FileText, Image as ImageIcon, Shield, DollarSign, Bell } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import { SidebarIcon } from './components/ui/SidebarIcon';
import { ViewState } from './types';
import { useApp } from './context/AppContext';

const UsersView = lazy(async () => ({ default: (await import('./views/UsersView')).UsersView }));
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
  FINANCE: 'finance'
} as const;

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
    showNotifications,
    setShowNotifications,
    attachmentPreview,
    closeAttachment,
    notifications,
    unreadCount,
    markNotificationRead,
    dismissNotification,
    markAllNotificationsRead,
    setActiveTicketId
  } = useApp();
  
  const notificationRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node) && showNotifications) {
        setShowNotifications(false);
      }
    }

    if (showNotifications) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showNotifications, setShowNotifications]);

  useEffect(() => {
    function handleEsc(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      if (attachmentPreview) closeAttachment();
      if (showNotifications) setShowNotifications(false);
    }
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [attachmentPreview, closeAttachment, showNotifications, setShowNotifications]);

  useEffect(() => {
    if (!attachmentPreview) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [attachmentPreview]);

  if (currentView === VIEWS.LANDING) {
    return (
      <Suspense fallback={<ViewLoader fullScreen />}>
        <LandingView
          onOpenForm={() => navigateTo(VIEWS.PUBLIC_FORM)}
          onLogin={() => navigateTo(VIEWS.LOGIN)}
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

  if (currentView === VIEWS.LOGIN) {
    return (
      <Suspense fallback={<ViewLoader fullScreen />}>
        <SplitLoginView
          onLogin={() => navigateTo(VIEWS.HOME)}
          onBack={() => navigateTo(VIEWS.LANDING)}
        />
      </Suspense>
    );
  }

  if (currentView === VIEWS.TRACKING) {
    return (
      <Suspense fallback={<ViewLoader fullScreen />}>
        <TrackingView ticketToken={trackingTicketToken} onBack={() => navigateTo(VIEWS.INBOX)} />
      </Suspense>
    );
  }

  return (
    <div className="flex h-screen bg-roman-bg text-roman-text-main font-sans text-[13px]">
      {/* Narrow Sidebar (Dark Stone) */}
      <aside className="w-14 bg-roman-sidebar flex flex-col items-center py-4 z-20 border-r border-stone-900">
        <div className="w-8 h-8 flex items-center justify-center mb-6 text-roman-primary">
          <Landmark size={24} />
        </div>
        <nav className="flex flex-col gap-4 w-full">
          <SidebarIcon icon={<Home size={20} />} active={currentView === VIEWS.HOME} onClick={() => navigateTo(VIEWS.HOME)} title="Início" />
          <SidebarIcon icon={<Inbox size={20} />} active={currentView === VIEWS.INBOX} onClick={() => navigateTo(VIEWS.INBOX)} title="Caixa de Entrada" />
          <SidebarIcon icon={<Shield size={20} />} active={currentView === VIEWS.APPROVALS} onClick={() => navigateTo(VIEWS.APPROVALS)} title="Painel da Diretoria" />
          <SidebarIcon icon={<DollarSign size={20} />} active={currentView === VIEWS.FINANCE} onClick={() => navigateTo(VIEWS.FINANCE)} title="Financeiro" />
          <SidebarIcon icon={<Users size={20} />} active={currentView === VIEWS.USERS} onClick={() => navigateTo(VIEWS.USERS)} title="Usuários" />
          <SidebarIcon icon={<BarChart2 size={20} />} active={currentView === VIEWS.KPI} onClick={() => navigateTo(VIEWS.KPI)} title="Indicadores" />
          <SidebarIcon icon={<Settings size={20} />} active={currentView === VIEWS.SETTINGS} onClick={() => navigateTo(VIEWS.SETTINGS)} title="Configurações" />
        </nav>
        <div className="mt-auto flex flex-col gap-4 items-center">
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowNotifications(!showNotifications);
              }}
              className={`transition-colors ${showNotifications ? 'text-roman-primary' : 'text-white/40 hover:text-white/80'}`}
              title="Notificações"
              aria-label="Notificações"
              aria-expanded={showNotifications}
            >
              <Bell size={18} />
            </button>
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] bg-roman-primary rounded-full flex items-center justify-center text-white text-[9px] font-bold px-0.5">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </div>
          <button onClick={() => navigateTo(VIEWS.LANDING)} className="text-white/40 hover:text-white/80 transition-colors" title="Sair" aria-label="Sair">
            <LogOut size={18} />
          </button>
          <div className="w-8 h-8 rounded-full bg-roman-sidebar-light border border-roman-primary/30 flex items-center justify-center text-roman-primary font-serif font-medium text-xs" title="Logado como: Rafael">
             RG
          </div>
        </div>
      </aside>

      {/* Notifications Panel */}
      {showNotifications && (
        <div ref={notificationRef} className="absolute left-14 top-0 bottom-0 w-96 bg-roman-surface border-r border-roman-border shadow-2xl z-30 animate-in slide-in-from-left-4 flex flex-col">
          <div className="p-4 border-b border-roman-border flex justify-between items-center bg-roman-bg">
            <div className="flex items-center gap-2">
              <h3 className="font-serif text-lg text-roman-text-main font-medium">Notificações</h3>
              {unreadCount > 0 && (
                <span className="bg-roman-primary text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{unreadCount}</span>
              )}
            </div>
            <button onClick={() => setShowNotifications(false)} className="text-roman-text-sub hover:text-roman-text-main" aria-label="Fechar notificações"><X size={18}/></button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {notifications.length === 0 && (
              <div className="py-12 text-center text-roman-text-sub font-serif italic">
                Nenhuma notificação.
              </div>
            )}
            {notifications.map(n => {
              const isAlert = n.type === 'alert';
              const isActionable = n.type === 'actionable';
              return (
                <div
                  key={n.id}
                  onClick={() => markNotificationRead(n.id)}
                  className={`p-4 rounded-sm relative overflow-hidden transition-opacity ${
                    isAlert
                      ? 'bg-red-50 border border-red-200'
                      : isActionable
                      ? 'bg-roman-surface border border-roman-primary/30 shadow-sm'
                      : 'bg-roman-bg border border-roman-border'
                  } ${n.read ? 'opacity-60 hover:opacity-90' : ''}`}
                >
                  {isActionable && <div className="absolute top-0 left-0 w-1 h-full bg-roman-primary"></div>}
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      {!n.read && (
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isAlert ? 'bg-red-500' : isActionable ? 'bg-roman-primary animate-pulse' : 'bg-roman-primary'}`}></span>
                      )}
                      <span className={`text-xs font-serif italic ${isAlert ? 'text-red-700' : 'text-roman-text-sub'}`}>
                        {formatDistanceToNow(n.time, { addSuffix: true, locale: ptBR })}
                      </span>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); dismissNotification(n.id); }}
                      className={`transition-colors ${isAlert ? 'text-red-400 hover:text-red-700' : 'text-roman-text-sub hover:text-roman-text-main'}`}
                      aria-label="Dispensar notificação"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <p className={`text-sm font-medium mb-1 ${isAlert ? 'text-red-900' : 'text-roman-text-main'}`}>{n.title}</p>
                  <p className={`text-xs ${isAlert ? 'text-red-700' : 'text-roman-text-sub'} ${n.action ? 'mb-3' : ''}`}>{n.body}</p>
                  {n.action && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        markNotificationRead(n.id);
                        if (n.action!.ticketId) setActiveTicketId(n.action!.ticketId);
                        navigateTo(n.action!.view);
                        setShowNotifications(false);
                      }}
                      className={`w-full py-1.5 text-xs font-medium rounded-sm transition-colors border ${
                        isAlert
                          ? 'bg-white hover:bg-red-100 text-red-700 border-red-200'
                          : 'bg-roman-primary/10 hover:bg-roman-primary/20 text-roman-primary border-roman-primary/20'
                      }`}
                    >
                      {n.action.label}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <div className="p-3 border-t border-roman-border bg-roman-bg text-center">
            <button
              onClick={markAllNotificationsRead}
              disabled={unreadCount === 0}
              className="text-xs text-roman-primary hover:underline font-medium disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Marcar todas como lidas {unreadCount > 0 ? `(${unreadCount})` : ''}
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Suspense fallback={<ViewLoader />}>
          {currentView === VIEWS.HOME && <HomeView />}
          {currentView === VIEWS.INBOX && <InboxView />}
          {currentView === VIEWS.APPROVALS && <ApprovalsView />}
          {currentView === VIEWS.FINANCE && <FinanceView />}
          {currentView === VIEWS.USERS && <UsersView />}
          {currentView === VIEWS.KPI && <KpiView />}
          {currentView === VIEWS.SETTINGS && <SettingsView />}
        </Suspense>
      </main>

      {/* Attachment Modal */}
      {attachmentPreview && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-8 animate-in fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeAttachment();
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Visualizador de anexo"
        >
          <div className="bg-roman-surface w-full max-w-4xl h-[80vh] rounded-sm shadow-2xl flex flex-col overflow-hidden border border-stone-700">
            <div className="flex justify-between items-center p-4 border-b border-roman-border bg-stone-900 text-white">
              <div className="flex items-center gap-3">
                {attachmentPreview.type === 'pdf' ? <FileText size={20} className="text-roman-primary" /> : <ImageIcon size={20} className="text-roman-primary" />}
                <h3 className="font-serif text-lg font-medium">{attachmentPreview.title}</h3>
              </div>
              <button onClick={closeAttachment} className="text-stone-400 hover:text-white transition-colors"><X size={24} /></button>
            </div>
            <div className="flex-1 bg-stone-100 flex items-center justify-center p-8 overflow-auto">
              {attachmentPreview.type === 'image' ? (
                <div className="flex flex-col items-center justify-center gap-4 text-stone-400">
                  <ImageIcon size={64} strokeWidth={1} />
                  <p className="font-serif italic text-sm">Pré-visualização indisponível offline</p>
                  <p className="text-xs opacity-60">{attachmentPreview.title}</p>
                </div>
              ) : (
                <div className="w-full max-w-2xl h-full bg-white shadow-lg border border-stone-300 p-12 flex flex-col">
                  <div className="border-b-2 border-stone-800 pb-4 mb-8 flex justify-between items-end">
                    <h1 className="text-3xl font-serif font-bold text-stone-800">ORÇAMENTO COMERCIAL</h1>
                    <span className="text-stone-500 font-mono">#DOC-2026</span>
                  </div>
                  <div className="space-y-4 flex-1">
                    <div className="h-4 bg-stone-200 w-3/4 rounded"></div>
                    <div className="h-4 bg-stone-200 w-full rounded"></div>
                    <div className="h-4 bg-stone-200 w-5/6 rounded"></div>
                    <div className="h-4 bg-stone-200 w-full rounded mt-8"></div>
                    <div className="h-32 bg-stone-100 border border-stone-200 w-full rounded mt-4 flex items-center justify-center text-stone-400 font-serif italic">Tabela de Custos Simulada</div>
                  </div>
                  <div className="mt-8 pt-8 border-t border-stone-200 flex justify-between items-center">
                    <div className="w-48 h-px bg-stone-800 relative"><span className="absolute -bottom-6 left-0 right-0 text-center text-xs text-stone-500">Assinatura do Fornecedor</span></div>
                    <div className="text-2xl font-serif font-bold text-stone-800">R$ --.---,--</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}












