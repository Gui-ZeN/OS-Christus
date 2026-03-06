import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, History, RefreshCw, Search } from 'lucide-react';
import { AuditLogEntry, fetchAuditLogs } from '../services/auditLogsApi';
import { useApp } from '../context/AppContext';
import { EmptyState } from '../components/ui/EmptyState';
import { formatDateTimeSafe } from '../utils/date';

function formatDate(value: string | null) {
  return formatDateTimeSafe(value);
}

function safeJson(value: unknown) {
  if (value == null) return '-';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '[não serializável]';
  }
}

export function AuditLogsView() {
  const { currentUser } = useApp();
  const canAccess = currentUser?.role === 'Admin';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [search, setSearch] = useState('');

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
      const result = await fetchAuditLogs(150);
      setLogs(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha inesperada.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filteredLogs = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return logs;
    return logs.filter(log =>
      [log.actor, log.action, log.entity, log.entityId || '', safeJson(log.after), safeJson(log.before)]
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
            <p className="text-roman-text-sub font-serif italic">Registro das principais alteracoes persistidas no Firestore.</p>
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
              placeholder="Buscar por acao, entidade, ator ou id..."
              className="w-full border border-roman-border rounded-sm pl-10 pr-3 py-2 bg-roman-surface text-sm text-roman-text-main outline-none focus:border-roman-primary"
            />
          </div>
          <div className="text-xs text-roman-text-sub font-serif italic">
            {loading ? 'Carregando logs...' : `${filteredLogs.length} registro(s) exibido(s)`}
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

          {filteredLogs.map(log => (
            <article key={log.id} className="bg-roman-surface border border-roman-border rounded-sm p-5 shadow-sm">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between mb-4">
                <div>
                  <div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1">
                    {log.entity} {log.entityId ? `· ${log.entityId}` : ''}
                  </div>
                  <h2 className="text-lg font-serif text-roman-text-main">{log.action}</h2>
                </div>
                <div className="text-xs text-roman-text-sub md:text-right">
                  <div>Ator: {log.actor}</div>
                  <div>{formatDate(log.createdAt)}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="border border-roman-border rounded-sm bg-roman-bg p-3">
                  <div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-2">Antes</div>
                  <pre className="text-xs text-roman-text-sub whitespace-pre-wrap break-words font-mono">{safeJson(log.before)}</pre>
                </div>
                <div className="border border-roman-border rounded-sm bg-roman-bg p-3">
                  <div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-2">Depois</div>
                  <pre className="text-xs text-roman-text-sub whitespace-pre-wrap break-words font-mono">{safeJson(log.after)}</pre>
                </div>
              </div>
            </article>
          ))}
        </section>
      </div>
    </div>
  );
}
