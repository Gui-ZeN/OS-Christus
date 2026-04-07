import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, FolderKanban, History, RefreshCw, Search } from 'lucide-react';
import { AuditLogEntry, fetchAuditLogs } from '../services/auditLogsApi';
import { useApp } from '../context/AppContext';
import { EmptyState } from '../components/ui/EmptyState';
import { formatDateTimeSafe } from '../utils/date';

const ENTITY_LABELS: Record<string, string> = {
  regions: 'Regiões',
  sites: 'Sedes',
  users: 'Usuários',
  user: 'Usuário',
  ticket: 'OS',
  tickets: 'OS',
  settings: 'Configurações',
  catalog: 'Catálogo',
  notifications: 'Notificações',
  procurement: 'Financeiro e execução',
  finance: 'Financeiro',
  email: 'E-mail',
  'firestore.legacy': 'Legado do Firestore',
};

const ACTION_LABELS: Record<string, string> = {
  'catalog.delete': 'Exclusão de item do catálogo',
  'catalog.upsert': 'Atualização de item do catálogo',
  'users.create': 'Criação de usuário',
  'users.update': 'Atualização de usuário',
  'users.delete': 'Exclusão de usuário',
  'tickets.create': 'Criação de OS',
  'tickets.update': 'Atualização de OS',
  'tickets.delete': 'Exclusão de OS',
  'tickets.status.change': 'Mudança de status da OS',
  'settings.update': 'Atualização de configurações',
  'procurement.quotes.save': 'Atualização de cotações',
  'procurement.contract.save': 'Atualização de contrato',
  'procurement.payment.save': 'Atualização de lançamento',
  'procurement.measurement.save': 'Registro de medição',
  'procurement.update': 'Atualização de orçamento/contrato',
  'notifications.dismiss': 'Notificação dispensada',
};

type AuditCategory = 'status' | 'financeiro' | 'aprovacao' | 'cadastro' | 'exclusao' | 'configuracao' | 'outros';

const CATEGORY_LABELS: Record<AuditCategory, string> = {
  status: 'Status',
  financeiro: 'Financeiro',
  aprovacao: 'Aprovação',
  cadastro: 'Cadastro',
  exclusao: 'Exclusão',
  configuracao: 'Configuração',
  outros: 'Outros',
};

const CATEGORY_STYLES: Record<AuditCategory, string> = {
  status: 'border-sky-200 bg-sky-50 text-sky-700',
  financeiro: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  aprovacao: 'border-amber-200 bg-amber-50 text-amber-700',
  cadastro: 'border-violet-200 bg-violet-50 text-violet-700',
  exclusao: 'border-red-200 bg-red-50 text-red-700',
  configuracao: 'border-stone-200 bg-stone-100 text-stone-700',
  outros: 'border-roman-border bg-roman-bg text-roman-text-sub',
};

function prettyActor(actor: string) {
  const value = String(actor || '').trim();
  if (!value) return 'Sistema';
  if (/^admin\b/i.test(value) || /@os-christus\.local$/i.test(value)) {
    return 'Administrador OS Christus';
  }
  const match = value.match(/^(.+?)\s*<(.+?)>$/);
  if (match) return match[1].trim();
  return value;
}

function prettyEntity(entity: string) {
  return ENTITY_LABELS[entity] || entity;
}

function prettyAction(action: string) {
  return ACTION_LABELS[action] || action;
}

function getAuditCategory(log: AuditLogEntry): AuditCategory {
  const action = log.action || '';
  if (action.includes('delete')) return 'exclusao';
  if (action === 'tickets.status.change' || action === 'tickets.update') return 'status';
  if (action.startsWith('procurement.payment') || action.startsWith('procurement.measurement')) return 'financeiro';
  if (action.startsWith('procurement.quotes') || action.startsWith('procurement.contract')) return 'aprovacao';
  if (action.startsWith('users.') || action.startsWith('catalog.')) return 'cadastro';
  if (action.startsWith('settings.') || action.startsWith('notifications.')) return 'configuracao';
  return 'outros';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function objectDisplayName(log: AuditLogEntry) {
  const before = isRecord(log.before) ? log.before : null;
  const after = isRecord(log.after) ? log.after : null;
  const source = after || before;
  const name = source?.name;
  if (typeof name === 'string' && name.trim()) return name;
  return log.entityId || '';
}

function normalizeTimestampObject(value: Record<string, unknown>) {
  const seconds = typeof value._seconds === 'number' ? value._seconds : typeof value.seconds === 'number' ? value.seconds : null;
  const nanos = typeof value._nanoseconds === 'number' ? value._nanoseconds : typeof value.nanoseconds === 'number' ? value.nanoseconds : 0;
  if (seconds == null) return null;
  return new Date(seconds * 1000 + Math.floor(nanos / 1_000_000));
}

function getTicketReference(log: AuditLogEntry) {
  const directValues = [log.entityId, objectDisplayName(log)];
  for (const value of directValues) {
    const text = String(value || '').trim();
    const match = text.match(/OS-\d{4,}/i);
    if (match) return match[0].toUpperCase();
  }
  const before = isRecord(log.before) ? log.before : null;
  const after = isRecord(log.after) ? log.after : null;
  const sourceId = typeof after?.id === 'string' ? after.id : typeof before?.id === 'string' ? before.id : null;
  if (sourceId?.match(/^OS-\d+/i)) return sourceId.toUpperCase();
  return null;
}

function extractSummary(log: AuditLogEntry) {
  const after = isRecord(log.after) ? log.after : null;
  const before = isRecord(log.before) ? log.before : null;
  const classification = after && isRecord(after.classification) ? after.classification : before && isRecord(before.classification) ? before.classification : null;
  const measurement = after && isRecord(after.measurement) ? after.measurement : null;
  const payment = after && isRecord(after.payment) ? after.payment : null;
  const contract = after && isRecord(after.contract) ? after.contract : null;
  const source = measurement || payment || contract || after || before;

  const service = classification?.serviceCatalogName || classification?.macroServiceName || null;
  const region = classification?.regionName || null;
  const site = classification?.siteName || null;
  const subject = typeof after?.subject === 'string' ? after.subject : typeof before?.subject === 'string' ? before.subject : null;

  switch (log.action) {
    case 'procurement.measurement.save': {
      const label = typeof source?.label === 'string' ? source.label : 'Medição registrada';
      const progress = source?.progressPercent != null ? `${source.progressPercent}%` : null;
      return [label, progress ? `andamento em ${progress}` : null, service ? `serviço: ${service}` : null].filter(Boolean).join(' · ');
    }
    case 'procurement.payment.save': {
      const label = typeof source?.label === 'string' ? source.label : 'Lançamento atualizado';
      const status = typeof source?.status === 'string' ? source.status : null;
      return [label, status ? `status: ${status}` : null, service ? `serviço: ${service}` : null].filter(Boolean).join(' · ');
    }
    case 'tickets.status.change': {
      const previousStatus = typeof before?.status === 'string' ? before.status : null;
      const nextStatus = typeof after?.status === 'string' ? after.status : null;
      return [subject, previousStatus && nextStatus ? `${previousStatus} → ${nextStatus}` : nextStatus].filter(Boolean).join(' · ');
    }
    case 'tickets.create':
    case 'tickets.update':
    case 'tickets.delete':
      return [subject, region, site].filter(Boolean).join(' · ');
    case 'catalog.delete':
      return `${prettyEntity(log.entity)} removido(a): ${objectDisplayName(log) || log.entityId || 'item sem nome'}`;
    case 'catalog.upsert':
      return `${prettyEntity(log.entity)} salvo(a): ${objectDisplayName(log) || log.entityId || 'item sem nome'}`;
    case 'users.create':
    case 'users.update':
    case 'users.delete':
      return objectDisplayName(log) || log.entityId || 'Usuário';
    default: {
      const label = objectDisplayName(log);
      const created = after && isRecord(after.createdAt) ? normalizeTimestampObject(after.createdAt) : null;
      return [label, created ? formatDateTimeSafe(created) : null].filter(Boolean).join(' · ');
    }
  }
}

export function AuditLogsView() {
  const { currentUser } = useApp();
  const canAccess = currentUser?.role === 'Admin';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [search, setSearch] = useState('');
  const [selectedTicket, setSelectedTicket] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState<'all' | AuditCategory>('all');
  const [includeSystem, setIncludeSystem] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchAuditLogs(150, includeSystem);
      setLogs(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha inesperada.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [includeSystem]);

  const ticketOptions = useMemo(() => {
    const values = [...new Set(logs.map(getTicketReference).filter((value): value is string => Boolean(value)))];
    return values.sort((a: string, b: string) => b.localeCompare(a, 'pt-BR'));
  }, [logs]);

  const filteredLogs = useMemo(() => {
    const term = search.trim().toLowerCase();
    return logs.filter(log => {
      const ticketRef = getTicketReference(log);
      const category = getAuditCategory(log);
      if (selectedTicket !== 'all' && ticketRef !== selectedTicket) return false;
      if (selectedCategory !== 'all' && category !== selectedCategory) return false;
      if (!term) return true;
      return [
        ticketRef || '',
        CATEGORY_LABELS[category],
        prettyEntity(log.entity),
        prettyAction(log.action),
        prettyActor(log.actor),
        objectDisplayName(log),
        log.entityId || '',
        extractSummary(log),
      ]
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  }, [logs, search, selectedTicket, selectedCategory]);

  if (!canAccess) {
    return (
      <div className="flex-1 overflow-y-auto bg-roman-bg p-8">
        <div className="max-w-4xl mx-auto min-h-[60vh]">
          <EmptyState
            icon={History}
            title="Acesso restrito"
            description="Os logs de auditoria estão disponíveis apenas para perfis Admin."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-roman-bg p-8">
      <div className="max-w-5xl mx-auto">
        <header className="mb-8 border-b border-roman-border pb-4 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-serif font-medium text-roman-text-main mb-2">Auditoria do Sistema</h1>
            <p className="text-roman-text-sub font-serif italic">Registro central das ações da OS e das principais alterações persistidas no sistema.</p>
          </div>
          <button
            onClick={() => void load()}
            className="px-4 py-2 bg-roman-surface border border-roman-border hover:border-roman-primary rounded-sm text-sm font-medium text-roman-text-main flex items-center gap-2"
            disabled={loading}
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Atualizar
          </button>
        </header>

        <div className="mb-6 flex flex-col md:flex-row gap-4 md:items-center md:justify-between">
          <div className="flex w-full flex-col gap-3 md:max-w-4xl md:flex-row">
            <div className="relative w-full md:max-w-md">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-roman-text-sub" />
              <input
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Buscar por OS, ação, ator ou entidade..."
                className="w-full border border-roman-border rounded-sm pl-10 pr-3 py-2 bg-roman-surface text-sm text-roman-text-main outline-none focus:border-roman-primary"
              />
            </div>
            <div className="relative w-full md:max-w-xs">
              <FolderKanban size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-roman-text-sub" />
              <select
                value={selectedTicket}
                onChange={event => setSelectedTicket(event.target.value)}
                className="w-full appearance-none border border-roman-border rounded-sm pl-10 pr-3 py-2 bg-roman-surface text-sm text-roman-text-main outline-none focus:border-roman-primary"
              >
                <option value="all">Todas as OS</option>
                {ticketOptions.map(ticket => (
                  <option key={ticket} value={ticket}>
                    {ticket}
                  </option>
                ))}
              </select>
            </div>
            <div className="relative w-full md:max-w-xs">
              <select
                value={selectedCategory}
                onChange={event => setSelectedCategory(event.target.value as 'all' | AuditCategory)}
                className="w-full appearance-none border border-roman-border rounded-sm px-3 py-2 bg-roman-surface text-sm text-roman-text-main outline-none focus:border-roman-primary"
              >
                <option value="all">Todas as categorias</option>
                {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-xs text-roman-text-sub">
              <input
                type="checkbox"
                checked={includeSystem}
                onChange={event => setIncludeSystem(event.target.checked)}
              />
              Exibir logs técnicos
            </label>
            <div className="text-xs text-roman-text-sub font-serif italic">
              {loading ? 'Carregando logs...' : `${filteredLogs.length} registro(s) exibido(s)`}
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 border border-red-200 bg-red-50 text-red-700 rounded-sm flex items-center gap-2">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        <section className="space-y-3">
          {!loading && filteredLogs.length === 0 && (
            <div className="bg-roman-surface border border-roman-border rounded-sm p-8 text-center text-roman-text-sub font-serif italic flex items-center justify-center gap-2">
              <History size={18} />
              Nenhum log encontrado.
            </div>
          )}

          {filteredLogs.map(log => {
            const category = getAuditCategory(log);
            const isDelete = category === 'exclusao';
            const accentClass = isDelete ? 'border-l-red-400' : 'border-l-roman-primary';
            const ticketRef = getTicketReference(log);

            return (
              <article key={log.id} className={`bg-roman-surface border border-roman-border border-l-4 ${accentClass} rounded-sm px-5 py-4 shadow-sm`}>
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-medium ${CATEGORY_STYLES[category]}`}>
                        {CATEGORY_LABELS[category]}
                      </span>
                      <span className="text-[10px] uppercase tracking-widest text-roman-text-sub font-serif">
                        {ticketRef || 'Ação geral do sistema'}
                      </span>
                    </div>
                    <div className="text-base font-serif text-roman-text-main">{prettyAction(log.action)}</div>
                    <div className="text-sm text-roman-text-sub">{extractSummary(log) || 'Sem resumo disponível.'}</div>
                  </div>
                  <div className="text-xs text-roman-text-sub md:text-right shrink-0">
                    <div>{prettyActor(log.actor)}</div>
                    <div>{formatDateTimeSafe(log.createdAt)}</div>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </div>
  );
}
