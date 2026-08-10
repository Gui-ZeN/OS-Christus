import React, { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { ModalShell } from '../../components/ui/ModalShell';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { useApp } from '../../context/AppContext';
import { getAllowedNextStatuses, type AppActorRole } from '../../constants/statusFlow';
import { TICKET_STATUS, type TicketStatus } from '../../constants/ticketStatus';
import { motivoQueImpedeEtapa } from '../../utils/statusChangeGuard';
import { mensagemDeErro } from '../../utils/errorMessage';
import { repairMojibake } from '../../utils/text';
import type { HistoryItem } from '../../types';

/**
 * Trocar a etapa sem abrir a OS inteira.
 *
 * Motivo medido: trocar etapa é **85% de tudo que um Gestor faz** (340 de 402 ações
 * desde 01/05). Para essa única coisa ele atravessava a Inbox inteira — conversa,
 * cotação, contrato, anexos, classificação — e a tela intimida quem só queria mover
 * uma OS de lugar.
 *
 * O que este modal NÃO faz, de propósito: não reimplementa a troca. Usa as mesmas
 * permissões (`getAllowedNextStatuses`), a mesma trava de conteúdo
 * (`motivoQueImpedeEtapa`), a mesma escrita (`updateTicket`) e o mesmo registro no
 * histórico. Segundo caminho para mudar etapa não pode virar segunda regra.
 */
export function EtapaModal({ ticketId, onClose }: { ticketId: string; onClose: () => void }) {
  const { tickets, currentUser, updateTicket } = useApp();
  // A OS viva do contexto, não uma cópia: se alguém mudar a etapa em outra aba
  // enquanto este modal está aberto, as opções oferecidas acompanham.
  const ticket = tickets.find(item => item.id === ticketId) || null;
  const actorRole = (currentUser?.role || 'Usuario') as AppActorRole;

  const [destino, setDestino] = useState<TicketStatus | ''>('');
  const [motivo, setMotivo] = useState('');
  const [avisarSolicitante, setAvisarSolicitante] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const opcoes = useMemo(
    () => (ticket ? getAllowedNextStatuses(actorRole, 'inbox', ticket.status as TicketStatus) : []),
    [actorRole, ticket]
  );

  if (!ticket) return null;

  const impedimento = destino ? motivoQueImpedeEtapa(ticket, destino) : null;
  const podeSalvar = Boolean(destino) && motivo.trim().length > 0 && !impedimento && !salvando;

  const salvar = async () => {
    if (!podeSalvar || !destino) return;
    setSalvando(true);
    setErro('');
    try {
      const entrada: HistoryItem = {
        id: crypto.randomUUID(),
        type: 'system',
        sender: currentUser?.name || 'Sistema',
        time: new Date(),
        text: `Transição manual via Gestão: ${ticket.status} -> ${destino}. Motivo: ${motivo.trim()}.`,
        visibility: 'internal',
      };
      const ok = await updateTicket(
        ticket.id,
        { status: destino, history: [...(ticket.history || []), entrada] },
        { sendEmailUpdate: avisarSolicitante }
      );
      // `updateTicket` reverte o otimista sozinho e não lança — o modal fica aberto
      // com o texto digitado em vez de fechar fingindo que salvou.
      if (!ok) {
        setErro('Não foi possível salvar. Verifique a conexão e tente de novo — seu texto foi mantido.');
        return;
      }
      onClose();
    } catch (e) {
      setErro(mensagemDeErro(e, 'Não foi possível trocar a etapa.'));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <ModalShell
      isOpen
      onClose={onClose}
      title="Trocar etapa"
      description={`${ticket.id} · ${repairMojibake(ticket.subject)}`}
      maxWidthClass="max-w-lg"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm border border-roman-border bg-roman-surface px-4 py-2 text-sm font-medium text-roman-text-sub hover:text-roman-text-main"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void salvar()}
            disabled={!podeSalvar}
            className="inline-flex items-center gap-2 rounded-sm bg-roman-sidebar px-4 py-2 text-sm font-medium text-white hover:bg-roman-sidebar-light disabled:opacity-60"
          >
            {salvando && <Loader2 size={15} className="animate-spin" />}
            Trocar etapa
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-roman-text-sub">
          <span>Hoje:</span>
          <StatusBadge status={ticket.status} />
        </div>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-roman-text-main">Nova etapa</span>
          <select
            value={destino}
            onChange={event => setDestino(event.target.value as TicketStatus)}
            className="w-full rounded-sm border border-roman-border bg-roman-surface px-3 py-2 text-sm text-roman-text-main outline-none focus:border-roman-primary"
          >
            <option value="">Escolha para onde vai…</option>
            {opcoes.map(status => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </label>

        {impedimento && (
          <div className="rounded-sm border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            {impedimento}
          </div>
        )}

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-roman-text-main">Por quê</span>
          <textarea
            value={motivo}
            onChange={event => setMotivo(event.target.value)}
            rows={3}
            placeholder="Uma linha basta — fica no histórico da OS."
            className="w-full resize-y rounded-sm border border-roman-border bg-roman-surface px-3 py-2 text-sm text-roman-text-main outline-none focus:border-roman-primary"
          />
        </label>

        {/* Desmarcado por padrão: avisar o solicitante é decisão, não rotina. Cada
            troca de etapa vira e-mail para a sede se ninguém pensar a respeito. */}
        <label className="flex cursor-pointer items-start gap-2 text-sm text-roman-text-sub">
          <input
            type="checkbox"
            checked={avisarSolicitante}
            onChange={event => setAvisarSolicitante(event.target.checked)}
            className="mt-0.5 h-4 w-4 accent-roman-primary"
          />
          <span>
            Avisar quem abriu a OS por e-mail
            {ticket.requesterEmail ? ` (${ticket.requesterEmail})` : ' — esta OS não tem e-mail do solicitante'}
          </span>
        </label>

        {erro && <div className="rounded-sm border border-red-200 bg-red-50 p-3 text-sm text-red-700">{erro}</div>}

        {destino === TICKET_STATUS.CANCELED && (
          <div className="rounded-sm border border-roman-border bg-roman-bg p-3 text-sm text-roman-text-sub">
            Cancelar não é o mesmo que encerrar. Se o serviço foi feito, use{' '}
            <strong className="text-roman-text-main">Encerrada</strong> — o relatório separa os dois.
          </div>
        )}
      </div>
    </ModalShell>
  );
}
