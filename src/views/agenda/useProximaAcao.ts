import { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { createCommitment } from '../../services/commitmentsApi';
import type { NextAction, Ticket, TicketAttention } from '../../types';

/**
 * O QUE O EDITOR PRECISA DO MUNDO — num lugar só.
 *
 * `EditorDeAcao` não conhece contexto nem API de propósito: recebe callbacks. Este
 * gancho é a outra metade — ele sabe gravar, e é o mesmo nas três telas.
 *
 * Sem isto, cada tela escreveria seu próprio `updateTicket(id, { nextAction })`, e a
 * terceira acabaria gravando um campo a menos que as outras duas. É o mesmo erro que
 * a moeda cometeu em quatro lugares.
 *
 * ⚠️ `virarVisita` NÃO atualiza lista nenhuma aqui. Na agenda, o `TodayView` mantém
 * os compromissos em memória para desenhar o dia e precisa somar o novo; na Caixa e
 * na Gestão não existe essa lista — o compromisso é criado e a tela segue. Quem
 * precisa da lista cuida dela.
 *
 * O nome comeca com `use` porque o React exige: a regra `rules-of-hooks` so
 * reconhece hook por esse prefixo, e sem ele ela nao consegue vigiar as chamadas
 * condicionais. O resto do nome fica em portugues, como no resto do repositorio.
 */
export function useProximaAcao(ticket: Ticket) {
  const { updateTicket, currentUser } = useApp();
  const [editando, setEditando] = useState(false);

  const salvar = async (acao: NextAction | null) => {
    const ok = await updateTicket(ticket.id, { nextAction: acao });
    // Fecha só no sucesso: no erro, o texto digitado tem de continuar na tela.
    if (ok) setEditando(false);
    return ok;
  };

  const suspender = async (attention: TicketAttention | null) => {
    const ok = await updateTicket(ticket.id, { attention });
    if (ok) setEditando(false);
    return ok;
  };

  const virarVisita = async (acao: NextAction, fornecedor: string) => {
    const compromisso = await createCommitment({
      ticketIds: [ticket.id],
      startAt: acao.dueAt,
      vendorName: fornecedor,
      sede: ticket.sede || null,
      siteId: ticket.siteId || null,
    });
    return compromisso.id;
  };

  return {
    editando,
    abrir: () => setEditando(true),
    fechar: () => setEditando(false),
    alternar: () => setEditando(v => !v),
    autorEmail: currentUser?.email,
    autorNome: currentUser?.name,
    salvar,
    suspender,
    virarVisita,
  };
}
