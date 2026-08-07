import React, { useCallback, useEffect, useState } from 'react';
import { ChevronDown, MailQuestion } from 'lucide-react';
import {
  createTicketFromDropped,
  dismissDroppedInbound,
  fetchDroppedInbound,
  linkDroppedInbound,
  type DroppedInboundItem,
} from '../../services/droppedInboundApi';
import { repairMojibake } from '../../utils/text';

/**
 * ENTRARAM E NÃO VIRARAM NADA.
 *
 * Vinte e três mensagens sumiram em silêncio antes desta fila existir — todas `Re:`
 * de conversas reais sobre goteira e portão, a mesma thread voltando semana após
 * semana enquanto quem escreveu achava que tinha avisado.
 *
 * Fica na Inbox, e não na tela de Saúde de E-mail, por um motivo simples: isto é
 * TRIAGEM, e triagem é trabalho de quem opera. A tela de saúde é de diagnóstico e
 * nem sequer abre para o papel Gestor.
 *
 * Some da tela quando a fila está vazia — o normal é não ter nada aqui.
 */
export function DroppedInboundQueue({
  onLinked,
  sedes = [],
}: {
  onLinked?: (ticketId: string) => void;
  /** Códigos de sede do catálogo. É o único dado que faltava para virar OS. */
  sedes?: string[];
}) {
  const [itens, setItens] = useState<DroppedInboundItem[]>([]);
  const [aberto, setAberto] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState('');
  const [alvo, setAlvo] = useState<Record<string, string>>({});
  const [sedeNova, setSedeNova] = useState<Record<string, string>>({});

  const recarregar = useCallback(async () => {
    try {
      setItens(await fetchDroppedInbound());
      setErro('');
    } catch (e) {
      // Falha aqui não pode derrubar a Inbox: a fila é um extra sobre a tela que a
      // pessoa veio usar.
      setErro(e instanceof Error ? e.message : 'Falha ao carregar a fila.');
    }
  }, []);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  if (itens.length === 0 && !erro) return null;

  const vincular = async (item: DroppedInboundItem) => {
    const ticketId = (alvo[item.id] || '').trim().toUpperCase();
    if (!ticketId) return setErro('Informe a OS de destino.');
    setOcupado(item.id);
    try {
      await linkDroppedInbound(item.id, ticketId);
      setItens(atual => atual.filter(i => i.id !== item.id));
      onLinked?.(ticketId);
      setErro('');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível vincular.');
    } finally {
      setOcupado(null);
    }
  };

  /**
   * Vira OS. A sede é o único campo pedido — era exatamente o que faltava para a
   * mensagem ter virado OS sozinha na entrada.
   */
  const criar = async (item: DroppedInboundItem) => {
    const sede = (sedeNova[item.id] || '').trim();
    if (!sede) return setErro('Escolha a sede da nova OS.');
    setOcupado(item.id);
    try {
      const ticketId = await createTicketFromDropped(item.id, sede);
      setItens(atual => atual.filter(i => i.id !== item.id));
      onLinked?.(ticketId);
      setErro('');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível criar a OS.');
    } finally {
      setOcupado(null);
    }
  };

  const descartar = async (item: DroppedInboundItem) => {
    setOcupado(item.id);
    try {
      await dismissDroppedInbound(item.id);
      setItens(atual => atual.filter(i => i.id !== item.id));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível descartar.');
    } finally {
      setOcupado(null);
    }
  };

  return (
    <div className="border-b border-amber-300 bg-amber-50/70">
      <button
        type="button"
        onClick={() => setAberto(v => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-amber-900 transition-colors hover:bg-amber-100/60"
      >
        <MailQuestion size={14} className="shrink-0" />
        <span className="min-w-0">
          <strong>{itens.length}</strong> mensagem(ns) sem OS
        </span>
        <ChevronDown size={14} className={`ml-auto shrink-0 transition-transform ${aberto ? 'rotate-180' : ''}`} />
      </button>

      {aberto && (
        <div className="space-y-2 px-2 pb-2">
          {erro && <p className="px-1 text-[11px] text-red-700">{erro}</p>}
          {itens.map(item => (
            <div key={item.id} className="rounded-sm border border-amber-200 bg-white p-2">
              <div className="text-[11px] text-roman-text-sub">{item.fromEmail || 'remetente desconhecido'}</div>
              <div className="mt-0.5 text-[12px] font-medium text-roman-text-main">
                {repairMojibake(item.subject) || '(sem assunto)'}
              </div>
              {item.text && (
                <p className="mt-1 line-clamp-3 text-[11px] text-roman-text-sub">{repairMojibake(item.text)}</p>
              )}
              {item.attachments && item.attachments.length > 0 ? (
                <p className="mt-1 text-[11px] text-roman-text-sub">
                  📎 {item.attachments.length} anexo(s) guardado(s) — vão junto para a OS.
                </p>
              ) : item.attachmentCount > 0 ? (
                <p className="mt-1 text-[11px] text-amber-800">
                  ⚠️ {item.attachmentCount} anexo(s) não preservado(s) — abra o e-mail original.
                </p>
              ) : null}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <input
                  type="text"
                  value={alvo[item.id] || ''}
                  onChange={event => setAlvo(a => ({ ...a, [item.id]: event.target.value }))}
                  placeholder="OS-0000"
                  className="w-24 rounded-sm border border-roman-border bg-roman-bg px-1.5 py-1 text-[11px] font-mono text-roman-text-main outline-none focus:border-roman-primary"
                />
                <button
                  type="button"
                  disabled={ocupado === item.id}
                  onClick={() => void vincular(item)}
                  className="rounded-sm bg-roman-primary px-2 py-1 text-[11px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  Vincular
                </button>
                <button
                  type="button"
                  disabled={ocupado === item.id}
                  onClick={() => void descartar(item)}
                  className="ml-auto text-[11px] text-roman-text-sub underline underline-offset-2 hover:text-red-700 disabled:opacity-50"
                >
                  Não é trabalho
                </button>
              </div>

              {/* A saída que faltava: mensagem que É trabalho novo vira OS aqui, sem
                  precisar existir uma para vincular. */}
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 border-t border-amber-100 pt-1.5">
                <span className="text-[11px] text-roman-text-sub">ou criar OS na sede</span>
                <select
                  value={sedeNova[item.id] || ''}
                  onChange={event => setSedeNova(s => ({ ...s, [item.id]: event.target.value }))}
                  className="rounded-sm border border-roman-border bg-roman-bg px-1.5 py-1 text-[11px] text-roman-text-main outline-none focus:border-roman-primary"
                >
                  <option value="">sede…</option>
                  {sedes.map(sede => (
                    <option key={sede} value={sede}>
                      {sede}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={ocupado === item.id || !sedeNova[item.id]}
                  onClick={() => void criar(item)}
                  className="rounded-sm border border-roman-primary px-2 py-1 text-[11px] font-medium text-roman-primary transition-colors hover:bg-roman-primary/10 disabled:opacity-40"
                >
                  Criar OS
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
