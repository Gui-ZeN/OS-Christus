import React, { useRef, useEffect } from 'react';
import { Home, Inbox, Users, BarChart2, Settings, Landmark, LogOut, X, FileText, Image as ImageIcon, Shield, DollarSign, Bell } from 'lucide-react';

import { SidebarIcon } from './components/ui/SidebarIcon';
import { UsersView } from './views/UsersView';
import { KpiView } from './views/KpiView';
import { SettingsView } from './views/SettingsView';
import { TrackingView } from './views/TrackingView';
import { ApprovalsView } from './views/ApprovalsView';
import { FinanceView } from './views/FinanceView';
import { HomeView } from './views/HomeView';
import { InboxView } from './views/InboxView';
import { SplitLoginView } from './views/SplitLoginView';
import { ViewState } from './types';
import { useApp } from './context/AppContext';

export const VIEWS = {
  LOGIN: 'login',
  HOME: 'home',
  INBOX: 'inbox',
  USERS: 'users',
  KPI: 'kpi',
  SETTINGS: 'settings',
  TRACKING: 'tracking',
  APPROVALS: 'approvals',
  FINANCE: 'finance'
} as const;

export default function App() {
  const { 
    currentView, 
    navigateTo, 
    trackingTicketId, 
    showNotifications, 
    setShowNotifications,
    attachmentPreview,
    closeAttachment
  } = useApp();
  
  const notificationRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node) && showNotifications) {
        // Check if the click was on the bell icon (which toggles it)
        // We can't easily check the bell icon ref here without more state, 
        // but typically the toggle logic handles the "open" click.
        // If we click outside, we just want to close.
        // However, if we click the bell again, it might toggle (close then open or open then close).
        // To avoid conflict, we usually rely on the fact that the bell click handler runs.
        // But if the bell is outside the notification panel (it is), clicking it will trigger this.
        // If this runs before the bell click handler, it closes. Then bell handler toggles it back open.
        // To fix this, we can check if the target is the bell button. 
        // Or simpler: just set to false. If the bell button was clicked, its handler will toggle it.
        // If it was true, this sets false. Bell handler sets !true = false. Result: false. Correct.
        // Wait, if it was true:
        // Click outside -> sets false.
        // Click bell -> sets !true (false).
        // Both set false. Correct.
        
        // What if it was false?
        // Click bell -> sets !false (true).
        // Click outside (bell is outside) -> sets false.
        // Race condition.
        
        // Let's just implement standard click outside.
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

  if (currentView === VIEWS.LOGIN) {
    return <SplitLoginView onLogin={() => navigateTo(VIEWS.HOME)} />;
  }

  if (currentView === VIEWS.TRACKING) {
    return <TrackingView ticketId={trackingTicketId || 'OS-0042'} onBack={() => navigateTo(VIEWS.INBOX)} />;
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
                e.stopPropagation(); // Prevent immediate close from document click
                setShowNotifications(!showNotifications);
              }} 
              className={`transition-colors ${showNotifications ? 'text-roman-primary' : 'text-white/40 hover:text-white/80'}`} 
              title="Notificações"
            >
              <Bell size={18} />
            </button>
            <span className="absolute -top-1 -right-1 w-2 h-2 bg-roman-primary rounded-full"></span>
          </div>
          <button onClick={() => navigateTo('login')} className="text-white/40 hover:text-white/80 transition-colors" title="Sair">
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
            <h3 className="font-serif text-lg text-roman-text-main font-medium">Notificações</h3>
            <button onClick={() => setShowNotifications(false)} className="text-roman-text-sub hover:text-roman-text-main"><X size={18}/></button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            
            {/* Notification 1: Actionable */}
            <div className="p-4 bg-roman-surface border border-roman-primary/30 rounded-sm shadow-sm relative overflow-hidden group">
              <div className="absolute top-0 left-0 w-1 h-full bg-roman-primary"></div>
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-roman-primary animate-pulse"></span>
                  <span className="text-xs font-serif italic text-roman-text-sub">Agora mesmo</span>
                </div>
                <button className="text-roman-text-sub hover:text-roman-text-main"><X size={14} /></button>
              </div>
              <p className="text-sm text-roman-text-main font-medium mb-1">Aprovação Necessária</p>
              <p className="text-xs text-roman-text-sub mb-3">Orçamento da OS-0048 excede o limite automático. Requer sua validação.</p>
              <button 
                onClick={() => {
                  navigateTo(VIEWS.APPROVALS);
                  setShowNotifications(false);
                }}
                className="w-full py-1.5 bg-roman-primary/10 hover:bg-roman-primary/20 text-roman-primary text-xs font-medium rounded-sm transition-colors border border-roman-primary/20"
              >
                Revisar Orçamento
              </button>
            </div>

            {/* Notification 2: Info */}
            <div className="p-4 bg-roman-bg border border-roman-border rounded-sm">
              <div className="flex justify-between items-start mb-2">
                <span className="text-xs font-serif italic text-roman-text-sub">Há 2 horas</span>
                <button className="text-roman-text-sub hover:text-roman-text-main"><X size={14} /></button>
              </div>
              <p className="text-sm text-roman-text-main font-medium mb-1">OS-0045 Validada</p>
              <p className="text-xs text-roman-text-sub">O solicitante aprovou a manutenção dos geradores. Pronta para pagamento.</p>
            </div>

            {/* Notification 3: Alert (SLA) */}
            <div className="p-4 bg-red-50 border border-red-200 rounded-sm">
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-500"></span>
                  <span className="text-xs font-serif italic text-red-700">Há 4 horas</span>
                </div>
                <button className="text-red-400 hover:text-red-700"><X size={14} /></button>
              </div>
              <p className="text-sm text-red-900 font-medium mb-1">SLA Vencido: OS-0044</p>
              <p className="text-xs text-red-700 mb-3">O prazo de resolução para esta OS crítica expirou.</p>
              <button 
                onClick={() => {
                  navigateTo(VIEWS.INBOX);
                  setShowNotifications(false);
                }}
                className="w-full py-1.5 bg-white hover:bg-red-100 text-red-700 text-xs font-medium rounded-sm transition-colors border border-red-200"
              >
                Ver OS Atrasada
              </button>
            </div>

            {/* Notification 4: Info */}
            <div className="p-4 bg-roman-bg border border-roman-border rounded-sm opacity-70 hover:opacity-100 transition-opacity">
              <div className="flex justify-between items-start mb-2">
                <span className="text-xs font-serif italic text-roman-text-sub">Ontem</span>
                <button className="text-roman-text-sub hover:text-roman-text-main"><X size={14} /></button>
              </div>
              <p className="text-sm text-roman-text-main font-medium mb-1">Nova OS Registrada</p>
              <p className="text-xs text-roman-text-sub">Infiltração Crítica no Teto do Refeitório (OS-0050).</p>
            </div>

          </div>
          <div className="p-3 border-t border-roman-border bg-roman-bg text-center">
            <button className="text-xs text-roman-primary hover:underline font-medium">Marcar todas como lidas</button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {currentView === VIEWS.HOME && <HomeView />}
        {currentView === VIEWS.INBOX && <InboxView />}
        {currentView === VIEWS.APPROVALS && <ApprovalsView />}
        {currentView === VIEWS.FINANCE && <FinanceView />}
        {currentView === VIEWS.USERS && <UsersView />}
        {currentView === VIEWS.KPI && <KpiView />}
        {currentView === VIEWS.SETTINGS && <SettingsView />}
      </main>

      {/* Attachment Modal */}
      {attachmentPreview && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-8 animate-in fade-in">
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
                <img src="https://picsum.photos/seed/facilities/800/600" alt="Anexo" className="max-w-full max-h-full object-contain shadow-md border border-stone-300" referrerPolicy="no-referrer" />
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



















