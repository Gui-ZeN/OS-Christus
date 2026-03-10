import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, History, RefreshCw, Search } from 'lucide-react';
import { AuditLogEntry, fetchAuditLogs } from '../services/auditLogsApi';
import { useApp } from '../context/AppContext';
import { EmptyState } from '../components/ui/EmptyState';
import { formatDateTimeSafe } from '../utils/date';

function formatDate(value: string | null) {
  return formatDateTimeSafe(value);
}

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
  'settings.update': 'Atualização de configurações',
  'procurement.quotes.save': 'Atualização de cotações',
  'procurement.contract.save': 'Atualização de contrato',
  'procurement.payment.save': 'Atualização de parcela',
  'procurement.measurement.save': 'Registro de medição',
  'procurement.update': 'Atualização de orçamento/contrato',
  'notifications.dismiss': 'Notificação dispensada',
};

const FIELD_LABELS: Record<string, string> = {
  id: 'ID',
  code: 'Código',
  name: 'Nome',
  active: 'Ativo',
  group: 'Grupo',
  regionId: 'Região',
  siteId: 'Sede',
  createdAt: 'Criado em',
  updatedAt: 'Atualizado em',
  email: 'E-mail',
  role: 'Papel',
  status: 'Status',
  label: 'Descrição',
  value: 'Valor',
  vendor: 'Fornecedor',
  installmentNumber: 'Parcela',
  totalInstallments: 'Total de parcelas',
  dueAt: 'Vencimento',
  paidAt: 'Pago em',
  progressPercent: 'Andamento da obra',
  releasePercent: 'Percentual liberado',
  requestedAt: 'Solicitado em',
  approvedAt: 'Liberado em',
  serviceCatalogName: 'Serviço',
  macroServiceName: 'Macroserviço',
  regionName: 'Região',
  siteName: 'Sede',
  sector: 'Setor',
  ticketType: 'Tipo de manutenção',
  subject: 'Assunto',
  requester: 'Solicitante',
};

const HIDDEN_FIELDS = new Set([
  'classification',
  'type',
  'history',
  'trackingToken',
  'attachments',
  'documents',
  'messageId',
  'threadId',
  'contentType',
  'path',
  'url',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

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

function humanizeValue(value: unknown): unknown {
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed) && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
      return formatDateTimeSafe(value);
    }
    return value;
  }
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (Array.isArray(value)) return value.map(humanizeValue);
  if (isRecord(value)) {
    const asDate = normalizeTimestampObject(value);
    if (asDate) return formatDateTimeSafe(asDate);
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [FIELD_LABELS[key] || key, humanizeValue(entry)])
    );
  }
  return value;
}

function extractDisplayPayload(log: AuditLogEntry, value: unknown) {
  if (!isRecord(value)) return null;

  const classification = isRecord(value.classification) ? value.classification : null;
  const measurement = isRecord(value.measurement) ? value.measurement : null;
  const payment = isRecord(value.payment) ? value.payment : null;
  const contract = isRecord(value.contract) ? value.contract : null;
  const base = measurement || payment || contract || value;

  const next: Record<string, unknown> = {};

  if (classification) {
    if (classification.ticketType) next.ticketType = classification.ticketType;
    if (classification.macroServiceName) next.macroServiceName = classification.macroServiceName;
    if (classification.serviceCatalogName) next.serviceCatalogName = classification.serviceCatalogName;
    if (classification.regionName) next.regionName = classification.regionName;
    if (classification.siteName) next.siteName = classification.siteName;
    if (classification.sector) next.sector = classification.sector;
  }

  for (const [key, entry] of Object.entries(base)) {
    if (HIDDEN_FIELDS.has(key)) continue;
    if (Array.isArray(entry) && key === 'items') {
      next.totalItems = `${entry.length} item(ns)`;
      continue;
    }
    if (Array.isArray(entry) && key === 'quotes') {
      next.totalQuotes = `${entry.length} cotação(ões)`;
      continue;
    }
    next[key] = entry;
  }

  if (log.entityId && !next.id) {
    next.id = log.entityId;
  }

  return next;
}

function formatDisplayValue(value: unknown) {
  const normalized = humanizeValue(value);
  if (normalized == null || normalized === '') return '—';
  if (Array.isArray(normalized)) {
    return normalized.length === 0 ? '—' : normalized.map(item => String(item)).join(', ');
  }
  if (isRecord(normalized)) {
    return Object.entries(normalized)
      .map(([key, entry]) => `${FIELD_LABELS[key] || key}: ${String(entry)}`)
      .join(' | ');
  }
  return String(normalized);
}

function buildDisplayRows(log: AuditLogEntry, value: unknown) {
  const payload = extractDisplayPayload(log, value);
  if (!payload) return [];

  return Object.entries(payload)
    .filter(([, entry]) => entry != null && entry !== '')
    .map(([key, entry]) => ({
      key,
      label: FIELD_LABELS[key] || key,
      value: formatDisplayValue(entry),
    }));
}

function describeLog(log: AuditLogEntry) {
  const afterRows = buildDisplayRows(log, log.after);
  const getValue = (field: string) => afterRows.find(row => row.key === field)?.value;

  switch (log.action) {
    case 'procurement.measurement.save':
      return `${getValue('label') || 'Medição registrada'}${getValue('progressPercent') ? ` com ${getValue('progressPercent')}` : ''}.`;
    case 'procurement.payment.save':
      return `${getValue('label') || 'Parcela atualizada'}${getValue('status') ? ` (${getValue('status')})` : ''}.`;
    case 'catalog.delete':
      return `${prettyEntity(log.entity)} ${objectDisplayName(log)} removido(a) do sistema.`;
    case 'users.create':
    case 'users.update':
    case 'users.delete':
      return `${prettyAction(log.action)}: ${objectDisplayName(log)}.`;
    default:
      return objectDisplayName(log) ? `${prettyAction(log.action)} em ${objectDisplayName(log)}.` : prettyAction(log.action);
  }
}

export function AuditLogsView() {
  const { currentUser } = useApp();
  const canAccess = currentUser?.role === 'Admin';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [search, setSearch] = useState('');
  const [includeSystem, setIncludeSystem] = useState(false);

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

  const filteredLogs = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return logs;
    return logs.filter(log =>
      [
        log.actor,
        log.action,
        log.entity,
        log.entityId || '',
        describeLog(log),
        buildDisplayRows(log, log.after).map(row => `${row.label} ${row.value}`).join(' '),
        buildDisplayRows(log, log.before).map(row => `${row.label} ${row.value}`).join(' '),
      ]
        .join(' ')
        .toLowerCase()
        .includes(term)
    );
  }, [logs, search]);

  return (
    <div className="flex-1 overflow-y-auto bg-roman-bg p-8">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8 border-b border-roman-border pb-4 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-serif font-medium text-roman-text-main mb-2">Auditoria do Sistema</h1>
            <p className="text-roman-text-sub font-serif italic">Registro das principais alterações persistidas no Firestore.</p>
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
          <div className="relative w-full md:max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-roman-text-sub" />
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Buscar por ação, entidade, ator ou id..."
              className="w-full border border-roman-border rounded-sm pl-10 pr-3 py-2 bg-roman-surface text-sm text-roman-text-main outline-none focus:border-roman-primary"
            />
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

        <section className="space-y-4">
          {!loading && filteredLogs.length === 0 && (
            <div className="bg-roman-surface border border-roman-border rounded-sm p-8 text-center text-roman-text-sub font-serif italic flex items-center justify-center gap-2">
              <History size={18} />
              Nenhum log encontrado.
            </div>
          )}

          {filteredLogs.map(log => {
            const beforeRows = buildDisplayRows(log, log.before);
            const afterRows = buildDisplayRows(log, log.after);
            const isDelete = log.action.includes('delete');
            const accentClass = isDelete ? 'border-l-red-400' : 'border-l-roman-primary';

            return (
              <article key={log.id} className={`bg-roman-surface border border-roman-border border-l-4 ${accentClass} rounded-sm p-5 shadow-sm`}>
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between mb-4">
                  <div>
                    <div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1">
                      {prettyEntity(log.entity)} {objectDisplayName(log) ? `· ${objectDisplayName(log)}` : ''}
                    </div>
                    <h2 className="text-lg font-serif text-roman-text-main">{prettyAction(log.action)}</h2>
                    <p className="text-sm text-roman-text-sub mt-1">{describeLog(log)}</p>
                  </div>
                  <div className="text-xs text-roman-text-sub md:text-right">
                    <div>Ator: {prettyActor(log.actor)}</div>
                    <div>{formatDate(log.createdAt)}</div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="border border-roman-border rounded-sm bg-roman-bg p-3">
                    <div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-2">Antes</div>
                    {beforeRows.length === 0 ? (
                      <div className="text-sm text-roman-text-sub">—</div>
                    ) : (
                      <div className="space-y-2">
                        {beforeRows.map(row => (
                          <div key={`before-${log.id}-${row.key}`} className="flex flex-col gap-1 border-b border-roman-border/60 pb-2 last:border-b-0 last:pb-0">
                            <div className="text-[10px] uppercase tracking-widest text-roman-text-sub">{row.label}</div>
                            <div className="text-sm text-roman-text-main">{row.value}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="border border-roman-border rounded-sm bg-roman-bg p-3">
                    <div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-2">Depois</div>
                    {afterRows.length === 0 ? (
                      <div className="text-sm text-roman-text-sub">—</div>
                    ) : (
                      <div className="space-y-2">
                        {afterRows.map(row => (
                          <div key={`after-${log.id}-${row.key}`} className="flex flex-col gap-1 border-b border-roman-border/60 pb-2 last:border-b-0 last:pb-0">
                            <div className="text-[10px] uppercase tracking-widest text-roman-text-sub">{row.label}</div>
                            <div className="text-sm text-roman-text-main">{row.value}</div>
                          </div>
                        ))}
                      </div>
                    )}
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
