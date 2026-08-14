import React, { useEffect, useState } from 'react';
import { CircleAlert, PauseCircle } from 'lucide-react';
import { SUSPENSION_REASON_LABEL } from '../../constants/agenda';
import { activeSuspension, resolvedAttentionOf } from '../../utils/agenda';
import { ATTENTION_KIND_LABEL, ATTENTION_KIND_WHY } from '../../constants/attentionKind';
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

  /**
   * A faixa lia SÓ `ticket.nextAction` — campo preenchido em 0 de 177 OS na produção.
   * Resultado: ela repreendia em 100% das telas, inclusive numa OS criada há um
   * minuto ("Ninguém sabe o que acontece com esta OS"), e ignorava a constatação que
   * o servidor já tinha calculado para aquela mesma OS.
   *
   * Aviso que aparece sempre não avisa nada: vira moldura. Agora usa a mesma
   * precedência da agenda — manual ganha da proposta do sistema — e some quando não
   * há fato nenhum a relatar. Silêncio aqui significa "nada pendente", e passa a ser
   * informação.
   */
  const resolvida = resolvedAttentionOf(ticket);
  if (!resolvida) return null;

  const atrasada = resolvida.dueAt.getTime() < agora.getTime();

  // Proposta do sistema: mostra a constatação e POR QUE ela apareceu. É o critério
  // que abriu a tela Hoje — toda atenção precisa saber se explicar, senão a pessoa
  // não julga se faz sentido e aprende a ignorar.
  if (resolvida.proposta && resolvida.kind) {
    return (
      <div
        className={`flex items-start gap-2 rounded-sm border px-3 py-2 text-[12.5px] ${
          atrasada ? 'border-roman-primary/35 bg-roman-primary/12 text-roman-text-main' : 'border-roman-border bg-roman-bg text-roman-text-sub'
        }`}
      >
        <CircleAlert size={14} className="mt-0.5 shrink-0" />
        <span className="min-w-0">
          <strong>{ATTENTION_KIND_LABEL[resolvida.kind] || 'Requer atenção'}</strong>
          {ATTENTION_KIND_WHY[resolvida.kind] ? ` — ${ATTENTION_KIND_WHY[resolvida.kind]}` : ''}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`flex items-start gap-2 rounded-sm border px-3 py-2 text-[12.5px] ${
        atrasada
          ? 'border-roman-danger/35 bg-roman-danger/12 text-roman-danger'
          : 'border-roman-primary/30 bg-roman-primary/8 text-roman-text-main'
      }`}
    >
      <span
        className={`mt-0.5 shrink-0 font-serif text-[11px] font-semibold uppercase tracking-widest ${
          atrasada ? 'text-roman-danger' : 'text-roman-primary'
        }`}
      >
        {atrasada ? 'Atrasada' : 'Próxima ação'}
      </span>
      <span className="min-w-0">
        {resolvida.what} · {formatarData(resolvida.dueAt)}
        {ticket.nextAction?.ownerName ? ` · ${ticket.nextAction.ownerName}` : ''}
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
