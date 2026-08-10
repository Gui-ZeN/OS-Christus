import React, { useState } from 'react';
import { Loader2, ExternalLink } from 'lucide-react';
import { ModalShell } from '../../components/ui/ModalShell';
import { TicketHistory } from '../inbox/TicketHistory';
import { useApp } from '../../context/AppContext';
import { useAttachmentPreview } from '../../context/AttachmentPreviewContext';
import { notifyTicketPublicReply } from '../../services/ticketEmail';
import { mensagemDeErro } from '../../utils/errorMessage';
import { repairMojibake } from '../../utils/text';
import type { HistoryItem } from '../../types';

/**
 * A conversa da OS, sem a OS inteira em volta.
 *
 * Ler e responder é o segundo motivo de alguém entrar na Inbox — e não precisa da
 * Inbox. Aqui a resposta é PÚBLICA e só isso: vai para quem abriu e para quem está
 * em cópia, que é o que "responder aos interessados" quer dizer.
 *
 * O que ficou de fora, e por quê: anexo, nota interna, troca de etapa junto,
 * cadastro de terceiro. Não é limitação técnica — é o ponto da tela. Quem precisa
 * de qualquer uma dessas coisas tem o link para a OS completa, a um clique.
 *
 * O envio reusa `notifyTicketPublicReply`, o MESMO serviço da Inbox. Um segundo
 * botão de responder não pode virar um segundo jeito de mandar e-mail.
 */
export function ConversaModal({ ticketId, onClose }: { ticketId: string; onClose: () => void }) {
  const { tickets, currentUser, updateTicket, setActiveTicketId, navigateTo } = useApp();
  // Resolve a OS VIVA do contexto a cada render, em vez de receber uma cópia.
  // Com a cópia, a mensagem recém-enviada não aparecia na conversa aberta: o
  // histórico exibido era o de quando o modal abriu.
  const ticket = tickets.find(item => item.id === ticketId) || null;
  const { openAttachment } = useAttachmentPreview();

  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState('');
  const [erro, setErro] = useState('');

  if (!ticket) return null;

  const destinatarios = [ticket.requesterEmail, ...(ticket.requesterCcEmails || [])].filter(Boolean);

  const abrirCompleta = () => {
    setActiveTicketId(ticket.id);
    navigateTo('inbox');
    onClose();
  };

  const enviar = async () => {
    const mensagem = texto.trim();
    if (!mensagem || enviando) return;
    setEnviando(true);
    setErro('');
    setAviso('');
    try {
      const entrada: HistoryItem = {
        id: crypto.randomUUID(),
        type: 'tech',
        sender: currentUser?.name || 'Gestão',
        time: new Date(),
        text: mensagem,
        visibility: 'public',
      };
      // Grava PRIMEIRO, envia depois: mensagem que saiu por e-mail e não ficou na OS
      // é pior que mensagem não enviada — ninguém sabe que ela existe.
      const ok = await updateTicket(ticket.id, { history: [...(ticket.history || []), entrada] });
      if (!ok) {
        setErro('Não foi possível registrar a mensagem. Seu texto foi mantido — tente de novo.');
        return;
      }
      setTexto('');
      const resultado = await notifyTicketPublicReply(
        ticket,
        currentUser?.name || 'Gestão',
        mensagem,
        [],
        ticket.requesterCcEmails || []
      );
      if (resultado === 'no-recipient') {
        setAviso('Mensagem registrada na OS, mas ela não tem e-mail de solicitante — nada foi enviado.');
      } else if (resultado === 'failed') {
        setAviso('Mensagem registrada na OS, mas o e-mail NÃO saiu. Tente reenviar pela OS completa.');
      } else {
        setAviso('Mensagem registrada e enviada.');
      }
    } catch (e) {
      setErro(mensagemDeErro(e, 'Falha ao enviar a mensagem.'));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <ModalShell
      isOpen
      onClose={onClose}
      title="Conversa da OS"
      description={`${ticket.id} · ${repairMojibake(ticket.subject)}`}
      maxWidthClass="max-w-3xl"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={abrirCompleta}
            className="inline-flex items-center gap-1.5 rounded-sm px-2 py-2 text-sm font-medium text-roman-text-sub hover:text-roman-text-main"
          >
            <ExternalLink size={14} /> Abrir a OS completa
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-sm border border-roman-border bg-roman-surface px-4 py-2 text-sm font-medium text-roman-text-sub hover:text-roman-text-main"
            >
              Fechar
            </button>
            <button
              type="button"
              onClick={() => void enviar()}
              disabled={!texto.trim() || enviando}
              className="inline-flex items-center gap-2 rounded-sm bg-roman-sidebar px-4 py-2 text-sm font-medium text-white hover:bg-roman-sidebar-light disabled:opacity-60"
            >
              {enviando && <Loader2 size={15} className="animate-spin" />}
              Responder
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="max-h-[45vh] overflow-y-auto rounded-sm border border-roman-border bg-roman-bg p-3">
          <TicketHistory
            ticketId={ticket.id}
            history={ticket.history || []}
            canManageStatus={false}
            isSending={enviando}
            onUpdateItemTime={() => {}}
            onOpenAttachment={openAttachment}
          />
        </div>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-roman-text-main">Responder</span>
          <textarea
            value={texto}
            onChange={event => setTexto(event.target.value)}
            rows={4}
            placeholder="A resposta vai por e-mail para quem abriu a OS e para quem está em cópia."
            className="w-full resize-y rounded-sm border border-roman-border bg-roman-surface px-3 py-2 text-sm text-roman-text-main outline-none focus:border-roman-primary"
          />
        </label>

        <p className="text-xs text-roman-text-sub">
          {destinatarios.length > 0
            ? <>Vai para: <span className="text-roman-text-main">{destinatarios.join(', ')}</span></>
            : 'Esta OS não tem e-mail de destinatário — a mensagem fica registrada, mas não será enviada.'}
        </p>

        {aviso && <div className="rounded-sm border border-roman-border bg-roman-bg p-3 text-sm text-roman-text-main">{aviso}</div>}
        {erro && <div className="rounded-sm border border-red-200 bg-red-50 p-3 text-sm text-red-700">{erro}</div>}
      </div>
    </ModalShell>
  );
}
