import React, { useEffect, useState } from 'react';
import { CircleAlert, PauseCircle } from 'lucide-react';
import { SUSPENSION_REASON_LABEL } from '../../constants/agenda';
import { activeSuspension } from '../../utils/agenda';
import { isTicketOpen } from '../../constants/ticketLifecycle';
import type { Ticket } from '../../types';

/**
 * O QUE PRECISA ACONTECER — no lugar da faixa que adivinhava pela etapa.
 *
 * A faixa antiga (`getStageGuidance`) traduzia o status num conselho fixo: em
 * "Aguardando Orçamento" ela dizia "lance as cotações". Era chute com cara de
 * instrução — e chutava para as 163 OS paradas na segunda etapa, onde dizia
 * "registre o parecer técnico" havia meses.
 *
 * Agora quem responde é o dado: a próxima ação que alguém escreveu, a suspensão que
 * alguém justificou, ou o vazio — dito com todas as letras, porque OS viva que
 * ninguém está tocando é a informação mais importante da tela.
 */
export function NextActionStrip({ ticket }: { ticket: Ticket }) {
  /**
   * O relógio mora AQUI, não na InboxView.
   *
   * "Atrasada" e "suspensão vencida" mudam com o tempo, então a faixa precisa de um
   * relógio que anda. Colocá-lo na InboxView faria as 3 mil linhas dela re-renderizarem
   * a cada minuto para atualizar uma tarja — aqui só a tarja se repinta.
   */
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setAgora(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  if (!isTicketOpen(ticket.status)) return null;

  const suspensao = activeSuspension(ticket, agora);
  if (suspensao) {
    return (
      <div className="flex items-start gap-2 rounded-sm border border-roman-border bg-roman-bg px-3 py-2 text-[12.5px] text-roman-text-sub">
        <PauseCircle size={14} className="mt-0.5 shrink-0" />
        <span className="min-w-0">
          Suspensa por <strong>{SUSPENSION_REASON_LABEL[suspensao.reason]}</strong> — revisar em{' '}
          {formatarData(suspensao.reviewAt)}
          {suspensao.note ? ` · ${suspensao.note}` : ''}
        </span>
      </div>
    );
  }

  const acao = ticket.nextAction;
  if (!acao?.dueAt) {
    return (
      <div className="flex items-start gap-2 rounded-sm border border-amber-300 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">
        <CircleAlert size={14} className="mt-0.5 shrink-0" />
        <span className="min-w-0">
          <strong>Sem próxima ação definida.</strong> Ninguém sabe o que acontece com esta OS.
        </span>
      </div>
    );
  }

  const atrasada = acao.dueAt.getTime() < agora.getTime();
  return (
    <div
      className={`flex items-start gap-2 rounded-sm border px-3 py-2 text-[12.5px] ${
        atrasada
          ? 'border-red-300 bg-red-50 text-red-800'
          : 'border-roman-primary/30 bg-roman-primary/8 text-roman-text-main'
      }`}
    >
      <span
        className={`mt-0.5 shrink-0 font-serif text-[10px] font-semibold uppercase tracking-widest ${
          atrasada ? 'text-red-700' : 'text-roman-primary'
        }`}
      >
        {atrasada ? 'Atrasada' : 'Próxima ação'}
      </span>
      <span className="min-w-0">
        {acao.what} · {formatarData(acao.dueAt)}
        {acao.ownerName ? ` · ${acao.ownerName}` : ''}
      </span>
    </div>
  );
}

function formatarData(date: Date) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Fortaleza',
  }).format(date);
}
