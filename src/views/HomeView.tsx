import React, { useMemo } from 'react';
import { AlertTriangle, BarChart2, Building2, Plus, ShieldAlert, Users } from 'lucide-react';
import { ActivityItem } from '../components/ui/ActivityItem';
import { StatCard } from '../components/ui/StatCard';
import { TICKET_STATUS } from '../constants/ticketStatus';
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

function isOpenStatus(status: string) {
  return status !== TICKET_STATUS.CLOSED && status !== TICKET_STATUS.CANCELED;
}

export function HomeView() {
  const { navigateTo, tickets, currentUser, currentUserEmail } = useApp();
  const greetingName =
    currentUser?.name ||
    currentUserEmail.split('@')[0]?.replace(/[-_.]+/g, ' ')?.replace(/\b\w/g, char => char.toUpperCase()) ||
    'Usuário';

  const stats = useMemo(
    () => ({
      novas: tickets.filter(ticket => ticket.status === TICKET_STATUS.NEW).length,
      aguardandoOrcamento: tickets.filter(ticket => ticket.status === TICKET_STATUS.WAITING_BUDGET).length,
      aguardandoAprovacao: tickets.filter(ticket => ticket.status.toLowerCase().includes('aprovação') || ticket.status.toLowerCase().includes('aprovacao')).length,
      encerradas: tickets.filter(ticket => ticket.status === TICKET_STATUS.CLOSED).length,
    }),
    [tickets]
  );

  const recentActivity = useMemo(() => {
    return tickets
      .flatMap(ticket =>
        ticket.history
          .filter(item => item.type !== 'field_change')
          .map(item => ({ ...item, ticketId: ticket.id, subject: ticket.subject }))
      )
      .sort((a, b) => b.time.getTime() - a.time.getTime())
      .slice(0, 5);
  }, [tickets]);

  const siteOverview = useMemo(() => {
    const grouped = new Map<string, { site: string; region: string; open: number; inProgress: number; waitingPayment: number; overdue: number }>();

    for (const ticket of tickets) {
      const key = `${ticket.sede}|${ticket.region}`;
      if (!grouped.has(key)) {
        grouped.set(key, {
          site: ticket.sede,
          region: ticket.region,
          open: 0,
          inProgress: 0,
          waitingPayment: 0,
          overdue: 0,
        });
      }
      const current = grouped.get(key)!;
      if (isOpenStatus(ticket.status)) current.open += 1;
      if (ticket.status === TICKET_STATUS.IN_PROGRESS || ticket.status === TICKET_STATUS.WAITING_PRELIM_ACTIONS) current.inProgress += 1;
      if (ticket.status === TICKET_STATUS.WAITING_PAYMENT) current.waitingPayment += 1;
      if (ticket.sla?.status === 'overdue') current.overdue += 1;
    }

    return [...grouped.values()].sort((a, b) => b.open - a.open).slice(0, 8);
  }, [tickets]);

  const guaranteeAlerts = useMemo(() => {
    return tickets
      .filter(ticket => ticket.guarantee?.status === 'active' && ticket.guarantee.endAt)
      .map(ticket => ({
        id: ticket.id,
        subject: ticket.subject,
        site: ticket.sede,
        endAt: ticket.guarantee!.endAt!,
        daysLeft: Math.ceil((ticket.guarantee!.endAt!.getTime() - Date.now()) / 86400000),
      }))
      .filter(item => item.daysLeft <= 45)
      .sort((a, b) => a.daysLeft - b.daysLeft)
      .slice(0, 5);
  }, [tickets]);

  const executiveQueue = useMemo(() => {
    return tickets
      .filter(ticket =>
        [
          TICKET_STATUS.WAITING_SOLUTION_APPROVAL,
          TICKET_STATUS.WAITING_BUDGET_APPROVAL,
          TICKET_STATUS.WAITING_CONTRACT_APPROVAL,
          TICKET_STATUS.WAITING_PAYMENT,
        ].includes(ticket.status)
      )
      .sort((a, b) => b.time.getTime() - a.time.getTime())
      .slice(0, 5);
  }, [tickets]);

  const isExecutive = currentUser?.role === 'Admin' || currentUser?.role === 'Diretor';

  return (
    <div className="flex-1 overflow-y-auto bg-roman-bg p-8">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-serif font-medium text-roman-text-main mb-2">Olá, {greetingName}</h1>
          <p className="text-roman-text-sub font-serif italic">
            {isExecutive
              ? 'Resumo gerencial por sede, gargalos de aprovação e alertas de garantia.'
              : 'Aqui está o resumo das suas responsabilidades operacionais de hoje.'}
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <StatCard title="Novas OS" value={String(stats.novas)} highlight onClick={() => navigateTo('inbox')} />
          <StatCard title="Aguardando Orçamento" value={String(stats.aguardandoOrcamento)} />
          <StatCard title="Aguardando Aprovação" value={String(stats.aguardandoAprovacao)} onClick={isExecutive ? () => navigateTo('approvals') : undefined} />
          <StatCard title="OS Concluídas" value={String(stats.encerradas)} />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 mb-8">
          <div className="xl:col-span-2 bg-roman-surface border border-roman-border rounded-sm p-6">
            <div className="flex items-center justify-between mb-4 border-b border-roman-border pb-2">
              <h2 className="font-serif text-lg font-medium text-roman-text-main">Painel por Sede</h2>
              <Building2 size={16} className="text-roman-text-sub" />
            </div>
            {siteOverview.length === 0 ? (
              <p className="text-sm text-roman-text-sub font-serif italic">Nenhuma OS disponível para consolidar.</p>
            ) : (
              <div className="space-y-3">
                {siteOverview.map(site => (
                  <div key={`${site.site}-${site.region}`} className="grid grid-cols-1 md:grid-cols-[1.6fr_repeat(4,0.7fr)] gap-3 items-center border border-roman-border rounded-sm bg-roman-bg px-4 py-3">
                    <div>
                      <div className="font-medium text-roman-text-main">{site.site}</div>
                      <div className="text-xs text-roman-text-sub">{site.region}</div>
                    </div>
                    <div className="text-sm">
                      <div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub">Abertas</div>
                      <div className="font-medium text-roman-text-main">{site.open}</div>
                    </div>
                    <div className="text-sm">
                      <div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub">Execução</div>
                      <div className="font-medium text-roman-text-main">{site.inProgress}</div>
                    </div>
                    <div className="text-sm">
                      <div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub">Pagamento</div>
                      <div className="font-medium text-roman-text-main">{site.waitingPayment}</div>
                    </div>
                    <div className="text-sm">
                      <div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub">SLA vencido</div>
                      <div className={`font-medium ${site.overdue > 0 ? 'text-red-700' : 'text-roman-text-main'}`}>{site.overdue}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-roman-surface border border-roman-border rounded-sm p-6">
            <h2 className="font-serif text-lg font-medium text-roman-text-main mb-4 border-b border-roman-border pb-2">Ações Rápidas</h2>
            <div className="space-y-3">
              <button onClick={() => navigateTo('inbox')} className="w-full text-left px-4 py-3 border border-roman-border rounded-sm hover:border-roman-primary hover:bg-roman-primary/5 transition-colors flex items-center gap-3">
                <Plus size={18} className="text-roman-primary" />
                <span className="font-medium">Registrar Nova OS</span>
              </button>
              {currentUser?.role === 'Admin' && (
                <button onClick={() => navigateTo('users')} className="w-full text-left px-4 py-3 border border-roman-border rounded-sm hover:border-roman-primary hover:bg-roman-primary/5 transition-colors flex items-center gap-3">
                  <Users size={18} className="text-roman-primary" />
                  <span className="font-medium">Gerenciar Equipes</span>
                </button>
              )}
              {isExecutive && (
                <button onClick={() => navigateTo('kpi')} className="w-full text-left px-4 py-3 border border-roman-border rounded-sm hover:border-roman-primary hover:bg-roman-primary/5 transition-colors flex items-center gap-3">
                  <BarChart2 size={18} className="text-roman-primary" />
                  <span className="font-medium">Ver Indicadores</span>
                </button>
              )}
            </div>

            <div className="mt-6 space-y-3">
              <div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub">Alertas de garantia</div>
              {guaranteeAlerts.length === 0 ? (
                <p className="text-sm text-roman-text-sub font-serif italic">Nenhuma garantia próxima do vencimento.</p>
              ) : (
                guaranteeAlerts.map(item => (
                  <div key={item.id} className="border border-amber-200 bg-amber-50 rounded-sm px-3 py-2 text-sm">
                    <div className="flex items-center gap-2 text-amber-800 font-medium"><ShieldAlert size={14} /> {item.id}</div>
                    <div className="text-amber-900">{item.subject}</div>
                    <div className="text-xs text-amber-800">{item.site} • {item.daysLeft} dia(s) para vencer</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 bg-roman-surface border border-roman-border rounded-sm p-6">
            <h2 className="font-serif text-lg font-medium text-roman-text-main mb-4 border-b border-roman-border pb-2">Atividade Recente</h2>
            <div className="space-y-4">
              {recentActivity.length === 0 ? (
                <p className="text-sm text-roman-text-sub font-serif italic">Nenhuma atividade registrada.</p>
              ) : (
                recentActivity.map(item => (
                  <ActivityItem
                    key={item.id}
                    time={formatActivityTime(item.time)}
                    title={ACTIVITY_TITLES[item.type] ?? 'Atualização'}
                    desc={`${item.subject}: ${item.text ? item.text.slice(0, 70) + (item.text.length > 70 ? '…' : '') : '—'} (${item.ticketId})`}
                  />
                ))
              )}
            </div>
          </div>

          <div className="bg-roman-surface border border-roman-border rounded-sm p-6">
            <div className="flex items-center justify-between mb-4 border-b border-roman-border pb-2">
              <h2 className="font-serif text-lg font-medium text-roman-text-main">Fila Executiva</h2>
              <AlertTriangle size={16} className="text-roman-text-sub" />
            </div>
            {executiveQueue.length === 0 ? (
              <p className="text-sm text-roman-text-sub font-serif italic">Nenhum item crítico aguardando decisão.</p>
            ) : (
              <div className="space-y-3">
                {executiveQueue.map(ticket => (
                  <button
                    key={ticket.id}
                    onClick={() => {
                      navigateTo(ticket.status === TICKET_STATUS.WAITING_PAYMENT ? 'finance' : 'approvals');
                    }}
                    className="w-full text-left border border-roman-border rounded-sm bg-roman-bg px-4 py-3 hover:border-roman-primary transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium text-roman-text-main">{ticket.id}</div>
                      <div className="text-[10px] uppercase tracking-widest text-roman-text-sub">{ticket.sede}</div>
                    </div>
                    <div className="text-sm text-roman-text-main mt-1">{ticket.subject}</div>
                    <div className="text-xs text-roman-text-sub mt-2">{ticket.status}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
