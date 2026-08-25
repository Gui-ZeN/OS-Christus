import React from 'react';
import { ModalShell } from '../../components/ui/ModalShell';
import { useApp } from '../../context/AppContext';
import { activeSuspension } from '../../utils/agenda';
import { EditorDeAcao } from '../agenda/EditorDeAcao';
import { useProximaAcao } from '../agenda/useProximaAcao';

/**
 * Dizer quando a OS anda — sem sair da Gestão.
 *
 * A Gestão é a tela de varrer a fila: é lá que se percebe que uma OS está parada há
 * três semanas e que alguém precisa ligar na quinta. Até aqui, gravar essa data
 * exigia ir até o Hoje — sair da tela onde a decisão foi tomada para registrá-la em
 * outra. O campo distante é o campo vazio: quando a próxima ação dependia de alguém
 * digitar, ela estava preenchida em 1 de 181 OS.
 *
 * Mesmo desenho da Conversa e da Etapa, e pelo mesmo motivo: o Gestor não deveria
 * atravessar a Inbox inteira para fazer uma coisa só.
 *
 * ⚠️ O EDITOR É O MESMO das outras duas telas (`EditorDeAcao`), e a gravação é o
 * mesmo gancho (`useProximaAcao`). Um editor por tela divergiria em silêncio — um
 * aceitando data no passado, outro não — e ninguém compararia.
 */
export function ProximaAcaoModal({ ticketId, onClose }: { ticketId: string; onClose: () => void }) {
  const { tickets } = useApp();
  const ticket = tickets.find(t => t.id === ticketId);
  const agora = React.useMemo(() => new Date(), []);

  // O gancho precisa de uma OS; enquanto ela não estiver na lista carregada, não há
  // o que editar. Acontece com a OS que saiu do filtro entre o clique e o render.
  const editor = useProximaAcao(ticket ?? ({ id: ticketId } as never));

  if (!ticket) {
    return (
      <ModalShell isOpen onClose={onClose} title="Próxima ação" maxWidthClass="max-w-xl">
        <p className="text-sm text-roman-text-sub">
          Esta OS não está mais na lista carregada. Feche e abra de novo.
        </p>
      </ModalShell>
    );
  }

  return (
    <ModalShell
      isOpen
      onClose={onClose}
      title="Próxima ação"
      description={`${ticket.id} · ${ticket.subject || 'sem assunto'}`}
      maxWidthClass="max-w-xl"
    >
      <EditorDeAcao
        acao={ticket.nextAction}
        suspensao={activeSuspension(ticket, agora)}
        agora={agora}
        autorEmail={editor.autorEmail}
        autorNome={editor.autorNome}
        onSalvar={async acao => {
          const ok = await editor.salvar(acao);
          if (ok) onClose();
          return ok;
        }}
        onSuspender={async attention => {
          const ok = await editor.suspender(attention);
          if (ok) onClose();
          return ok;
        }}
        onVirarVisita={editor.virarVisita}
        onCancelar={onClose}
      />
    </ModalShell>
  );
}
