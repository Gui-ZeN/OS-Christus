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

export function EmailHealthView() {
  const { currentUser } = useApp();
  const canAccess = currentUser?.role === 'Admin' || currentUser?.role === 'Diretor';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<EmailHealthResponse | null>(null);

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

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/email/health', {
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

  return (
    <div className="flex-1 overflow-y-auto bg-roman-bg p-8">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8 border-b border-roman-border pb-4 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-serif font-medium text-roman-text-main mb-2">Saúde de E-mail</h1>
            <p className="text-roman-text-sub font-serif italic">Monitoramento de envio e recebimento nas últimas 24 horas.</p>
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

        {error && (
          <div className="mb-6 p-4 border border-red-200 bg-red-50 text-red-700 rounded-sm flex items-center gap-2">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
          {[
            { label: 'Total', value: data?.summary.total ?? 0 },
            { label: 'Sucesso', value: data?.summary.success ?? 0 },
            { label: 'Erros', value: data?.summary.errors ?? 0 },
            { label: 'Outbound', value: data?.summary.outbound ?? 0 },
            { label: 'Inbound', value: data?.summary.inbound ?? 0 },
            { label: 'Sync', value: data?.summary.sync ?? 0 },
          ].map(card => (
            <div key={card.label} className="bg-roman-surface border border-roman-border rounded-sm p-4">
              <div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub">{card.label}</div>
              <div className="text-2xl font-serif text-roman-text-main mt-2">{loading ? '...' : card.value}</div>
            </div>
          ))}
        </div>

        <section className="bg-roman-surface border border-roman-border rounded-sm p-5">
          <h2 className="text-lg font-serif text-roman-text-main mb-4 flex items-center gap-2">
            <Mail size={18} />
            Últimas falhas
          </h2>
          {(data?.recentErrors.length || 0) === 0 ? (
            <div className="py-8 text-center text-roman-text-sub font-serif italic flex items-center justify-center gap-2">
              <CheckCircle2 size={18} className="text-green-700" />
              Nenhuma falha recente.
            </div>
          ) : (
            <div className="space-y-3">
              {data?.recentErrors.map(item => (
                <div key={item.id} className="p-3 border border-roman-border rounded-sm bg-roman-bg">
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-roman-text-sub mb-1">
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
      </div>
    </div>
  );
}
