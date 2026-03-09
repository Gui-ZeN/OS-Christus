import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Mail, RefreshCw } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { EmptyState } from '../components/ui/EmptyState';
import { getAuthenticatedActorHeaders } from '../services/actorHeaders';
import { formatDateTimeSafe } from '../utils/date';

type EmailHealthResponse = {
  ok: boolean;
  windowHours: number;
  summary: {
    total: number;
    success: number;
    errors: number;
    outbound: number;
    inbound: number;
    sync: number;
    byProvider: Record<string, number>;
  };
  recentErrors: Array<{
    id: string;
    createdAt: string | { _seconds?: number };
    provider: string | null;
    type: string | null;
    ticketId: string | null;
    error: string;
  }>;
};

function formatDate(value: unknown) {
  return formatDateTimeSafe(value);
}

export function EmailHealthView({ embedded = false }: { embedded?: boolean }) {
  const { currentUser } = useApp();
  const canAccess = currentUser?.role === 'Admin' || currentUser?.role === 'Diretor';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<EmailHealthResponse | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/mail?route=health', {
        headers: await getAuthenticatedActorHeaders(),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || 'Falha ao carregar saúde de e-mail.');
      }
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha inesperada.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 60000);
    return () => clearInterval(timer);
  }, []);

  if (!canAccess) {
    return (
      <div className="flex-1 overflow-y-auto bg-roman-bg p-8">
        <div className="max-w-4xl mx-auto min-h-[60vh]">
          <EmptyState
            icon={Mail}
            title="Acesso restrito"
            description="O monitoramento de e-mail está disponível apenas para Diretor e Admin."
          />
        </div>
      </div>
    );
  }

  const content = (
    <>
      {!embedded && (
        <header className="mb-8 flex items-end justify-between gap-4 border-b border-roman-border pb-4">
          <div>
            <h1 className="mb-2 text-3xl font-serif font-medium text-roman-text-main">Saúde de E-mail</h1>
            <p className="font-serif italic text-roman-text-sub">Monitoramento de envio e recebimento nas últimas 24 horas.</p>
          </div>
          <button
            onClick={() => void load()}
            className="flex items-center gap-2 rounded-sm border border-roman-border bg-roman-surface px-4 py-2 text-sm font-medium text-roman-text-main hover:border-roman-primary"
            disabled={loading}
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Atualizar
          </button>
        </header>
      )}

      {embedded && (
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-serif text-roman-text-main">Saúde de E-mail</h3>
            <p className="text-sm text-roman-text-sub">Entregas, inbound, sync e falhas recentes no mesmo painel.</p>
          </div>
          <button
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-full border border-roman-border bg-white px-4 py-2 text-sm font-medium text-roman-text-main hover:border-roman-primary"
            disabled={loading}
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Atualizar
          </button>
        </div>
      )}

      {error && (
        <div className="mb-6 flex items-center gap-2 rounded-sm border border-red-200 bg-red-50 p-4 text-red-700">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {[
          { label: 'Total', value: data?.summary.total ?? 0 },
          { label: 'Sucesso', value: data?.summary.success ?? 0 },
          { label: 'Erros', value: data?.summary.errors ?? 0 },
          { label: 'Outbound', value: data?.summary.outbound ?? 0 },
          { label: 'Inbound', value: data?.summary.inbound ?? 0 },
          { label: 'Sync', value: data?.summary.sync ?? 0 },
        ].map(card => (
          <div key={card.label} className="rounded-sm border border-roman-border bg-roman-surface p-4">
            <div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub">{card.label}</div>
            <div className="mt-2 text-2xl font-serif text-roman-text-main">{loading ? '...' : card.value}</div>
          </div>
        ))}
      </div>

      <section className="rounded-sm border border-roman-border bg-roman-surface p-5">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-serif text-roman-text-main">
          <Mail size={18} />
          Últimas falhas
        </h2>
        {(data?.recentErrors.length || 0) === 0 ? (
          <div className="flex items-center justify-center gap-2 py-8 text-center font-serif italic text-roman-text-sub">
            <CheckCircle2 size={18} className="text-green-700" />
            Nenhuma falha recente.
          </div>
        ) : (
          <div className="space-y-3">
            {data?.recentErrors.map(item => (
              <div key={item.id} className="rounded-sm border border-roman-border bg-roman-bg p-3">
                <div className="mb-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-roman-text-sub">
                  <span>{formatDate(item.createdAt)}</span>
                  <span>Provider: {item.provider || '-'}</span>
                  <span>Tipo: {item.type || '-'}</span>
                  <span>Ticket: {item.ticketId || '-'}</span>
                </div>
                <div className="text-sm text-red-700">{item.error}</div>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );

  if (embedded) {
    return <div className="rounded-[1.5rem] border border-stone-200/80 bg-[linear-gradient(180deg,#fffaf2_0%,#fff_100%)] p-6">{content}</div>;
  }

  return (
    <div className="flex-1 overflow-y-auto bg-roman-bg p-8">
      <div className="mx-auto max-w-6xl">{content}</div>
    </div>
  );
}
