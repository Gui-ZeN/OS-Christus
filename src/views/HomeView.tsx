import React, { useMemo } from 'react';
import { Plus, Users, BarChart2 } from 'lucide-react';
import { StatCard } from '../components/ui/StatCard';
import { ActivityItem } from '../components/ui/ActivityItem';
import { useApp } from '../context/AppContext';

const ACTIVITY_TITLES: Record<string, string> = {
  customer: 'Mensagem do Solicitante',
  tech: 'Parecer Técnico Recebido',
  system: 'Atualização de Status',
};

function formatActivityTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return 'agora';
  if (diffMins < 60) return `${diffMins}min`;
  if (diffHours < 24) {
    const h = date.getHours().toString().padStart(2, '0');
    const m = date.getMinutes().toString().padStart(2, '0');
    return `${h}:${m}`;
  }
  if (diffDays === 1) return 'Ontem';
  return `${diffDays}d`;
}

export function HomeView() {
  const { navigateTo, tickets } = useApp();

  const stats = useMemo(() => ({
    novas: tickets.filter(t => t.status === 'Nova OS').length,
    aguardandoOrcamento: tickets.filter(t => t.status === 'Aguardando Orçamento').length,
    aguardandoAprovacao: tickets.filter(t => t.status.toLowerCase().includes('aguardando aprovação')).length,
    encerradas: tickets.filter(t => t.status === 'Encerrada').length,
  }), [tickets]);

  const recentActivity = useMemo(() => {
    return tickets
      .flatMap(t => t.history
        .filter(h => h.type !== 'field_change')
        .map(h => ({ ...h, ticketId: t.id }))
      )
      .sort((a, b) => b.time.getTime() - a.time.getTime())
      .slice(0, 4);
  }, [tickets]);

  return (
    <div className="flex-1 overflow-y-auto bg-roman-bg p-8">
      <div className="max-w-5xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-serif font-medium text-roman-text-main mb-2">Olá, Rafael</h1>
          <p className="text-roman-text-sub font-serif italic">Aqui está o resumo das suas responsabilidades de hoje.</p>
        </header>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <StatCard title="Novas OS" value={String(stats.novas)} highlight onClick={() => navigateTo('inbox')} />
          <StatCard title="Aguardando Orçamento" value={String(stats.aguardandoOrcamento)} />
          <StatCard title="Aguardando Aprovação" value={String(stats.aguardandoAprovacao)} />
          <StatCard title="OS Concluídas (Mês)" value={String(stats.encerradas)} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Recent Activity */}
          <div className="lg:col-span-2 bg-roman-surface border border-roman-border rounded-sm p-6">
            <h2 className="font-serif text-lg font-medium text-roman-text-main mb-4 border-b border-roman-border pb-2">Atividade Recente</h2>
            <div className="space-y-4">
              {recentActivity.length === 0 ? (
                <p className="text-sm text-roman-text-sub font-serif italic">Nenhuma atividade registrada.</p>
              ) : recentActivity.map(item => (
                <ActivityItem
                  key={item.id}
                  time={formatActivityTime(item.time)}
                  title={ACTIVITY_TITLES[item.type] ?? 'Atualização'}
                  desc={`${item.text ? item.text.slice(0, 60) + (item.text.length > 60 ? '…' : '') : '—'} (${item.ticketId})`}
                />
              ))}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-roman-surface border border-roman-border rounded-sm p-6">
            <h2 className="font-serif text-lg font-medium text-roman-text-main mb-4 border-b border-roman-border pb-2">Ações Rápidas</h2>
            <div className="space-y-3">
              <button onClick={() => navigateTo('inbox')} className="w-full text-left px-4 py-3 border border-roman-border rounded-sm hover:border-roman-primary hover:bg-roman-primary/5 transition-colors flex items-center gap-3">
                <Plus size={18} className="text-roman-primary" />
                <span className="font-medium">Registrar Nova OS</span>
              </button>
              <button onClick={() => navigateTo('users')} className="w-full text-left px-4 py-3 border border-roman-border rounded-sm hover:border-roman-primary hover:bg-roman-primary/5 transition-colors flex items-center gap-3">
                <Users size={18} className="text-roman-primary" />
                <span className="font-medium">Gerenciar Equipes</span>
              </button>
              <button onClick={() => navigateTo('kpi')} className="w-full text-left px-4 py-3 border border-roman-border rounded-sm hover:border-roman-primary hover:bg-roman-primary/5 transition-colors flex items-center gap-3">
                <BarChart2 size={18} className="text-roman-primary" />
                <span className="font-medium">Ver Relatórios</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
