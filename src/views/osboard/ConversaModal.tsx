import React, { useState } from 'react';
import { Loader2, ExternalLink, Hourglass, Paperclip, X } from 'lucide-react';
import { ModalShell } from '../../components/ui/ModalShell';
import { TicketHistory } from '../inbox/TicketHistory';
import { useApp } from '../../context/AppContext';
import { useAttachmentPreview } from '../../context/AttachmentPreviewContext';
import { notifyTicketPublicReply } from '../../services/ticketEmail';
import { uploadMessageAttachment } from '../../services/ticketStorage';
import { mensagemDeErro } from '../../utils/errorMessage';
import { repairMojibake } from '../../utils/text';
import type { HistoryItem, TicketAttachment } from '../../types';

/**
 * A conversa da OS, sem a OS inteira em volta.
 *
 * Ler e responder é o segundo motivo de alguém entrar na Inbox — e não precisa da
 * Inbox.
 *
 * Nasceu só com resposta PÚBLICA, e isso devolvia à Inbox justamente o registro mais
 * frequente: 33% de todas as entradas do histórico são nota interna, a maior fatia de
 * conversa. Agora tem os dois modos, e a diferença entre eles grita — cor da caixa,
 * texto de ajuda, linha de destinatários e rótulo do botão mudam juntos. Uma abinha
 * discreta seria o caminho curto para mandar ao cliente o que era da casa.
 *
 * Interna é o padrão pela mesma razão: errar para dentro custa um registro a mais;
 * errar para fora não tem desfazer.
 *
 * Continua fora, e de propósito: trocar etapa junto (é o outro botão) e cadastro de
 * terceiro. Quem precisa disso tem o link para a OS completa, a um clique.
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
  /** Interna é o PADRÃO: errar para dentro custa um registro a mais; errar para fora
      manda para o cliente o que era da casa. */
  const [modo, setModo] = useState<'interna' | 'publica'>('interna');
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState('');
  const [erro, setErro] = useState('');

  if (!ticket) return null;

  const destinatarios = [ticket.requesterEmail, ...(ticket.requesterCcEmails || [])].filter(Boolean);
  const aguardaDesde = ticket.followUpRequestedAt ? new Date(ticket.followUpRequestedAt) : null;

  /**
   * Registra (ou desfaz) "estou esperando retorno".
   *
   * Mora aqui porque é aqui que o fato nasce: a pessoa acabou de escrever, ou acabou
   * de ligar. E é REGISTRO — o sistema não manda nada para ninguém, não verifica se
   * o pedido existiu, e não cobra quem deve responder. Ele guarda a data e devolve a
   * OS para a vista dela três dias úteis depois.
   */
  const marcarAguardando = async (aguardando: boolean) => {
    if (enviando) return;
    setEnviando(true);
    setErro('');
    setAviso('');
    try {
      const agora = new Date();
      const entrada: HistoryItem = {
        id: crypto.randomUUID(),
        type: 'system',
        sender: currentUser?.name || 'Sistema',
        time: agora,
        text: aguardando
          ? 'Registrado: aguardando retorno.'
          : 'Registrado: não aguarda mais retorno.',
        visibility: 'internal',
      };
      const ok = await updateTicket(ticket.id, {
        followUpRequestedAt: aguardando ? agora : null,
        history: [...(ticket.history || []), entrada],
      });
      if (!ok) setErro('Não foi possível registrar. Tente de novo.');
    } catch (e) {
      setErro(mensagemDeErro(e, 'Não foi possível registrar.'));
    } finally {
      setEnviando(false);
    }
  };

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
      // Anexos SOBEM antes de gravar: se a subida falhar, nada foi registrado e a
      // pessoa tenta de novo com o texto na mão. Gravar primeiro deixaria a entrada
      // no histórico prometendo um anexo que não existe.
      let anexos: TicketAttachment[] = [];
      if (arquivos.length > 0) {
        try {
          anexos = await Promise.all(
            arquivos.map(arquivo =>
              uploadMessageAttachment(ticket.id, modo === 'interna' ? 'internal' : 'public', arquivo)
            )
          );
        } catch (e) {
          setErro(mensagemDeErro(e, 'Falha ao subir o anexo. Nada foi registrado — tente de novo.'));
          return;
        }
      }

      const entrada: HistoryItem = {
        id: crypto.randomUUID(),
        // `internal` é o tipo que a Inbox usa para nota da casa — o mesmo, para as
        // duas telas contarem a mesma história no histórico.
        type: modo === 'interna' ? 'internal' : 'tech',
        sender: currentUser?.name || 'Gestão',
        time: new Date(),
        text: mensagem,
        visibility: modo === 'interna' ? 'internal' : 'public',
        attachments: anexos.length ? anexos : undefined,
      };
      // Grava PRIMEIRO, envia depois: mensagem que saiu por e-mail e não ficou na OS
      // é pior que mensagem não enviada — ninguém sabe que ela existe.
      const ok = await updateTicket(ticket.id, { history: [...(ticket.history || []), entrada] });
      if (!ok) {
        setErro('Não foi possível registrar a mensagem. Seu texto foi mantido — tente de novo.');
        return;
      }
      setTexto('');
      setArquivos([]);

      // Nota interna NÃO manda e-mail — é o ponto dela. Sair daqui antes de chamar o
      // serviço de envio é o que garante isso, em vez de depender de um parâmetro.
      if (modo === 'interna') {
        setAviso('Nota interna registrada. Ninguém foi notificado.');
        return;
      }

      const resultado = await notifyTicketPublicReply(
        ticket,
        currentUser?.name || 'Gestão',
        mensagem,
        anexos,
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
              className={`inline-flex items-center gap-2 rounded-sm px-4 py-2 text-sm font-medium text-white disabled:opacity-60 ${
                modo === 'interna' ? 'bg-roman-sidebar hover:bg-roman-sidebar-light' : 'bg-roman-primary hover:bg-roman-primary/90'
              }`}
            >
              {enviando && <Loader2 size={14} className="animate-spin" />}
              {modo === 'interna' ? 'Registrar nota' : 'Enviar ao solicitante'}
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

        {/* DOIS MODOS, e a diferença precisa gritar.
            33% de todas as entradas do histórico são notas internas — a maior fatia
            de conversa — e este modal só sabia mandar mensagem pública, devolvendo à
            Inbox justamente o registro mais frequente.
            O risco de juntá-los é mandar para o cliente o que era interno, então a
            distinção não é uma abinha: muda a cor da caixa, o texto de ajuda, o
            rótulo do botão e a linha de destinatários. */}
        <div className="flex gap-1 rounded-sm border border-roman-border bg-roman-bg p-1">
          {(['interna', 'publica'] as const).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => setModo(m)}
              className={`flex-1 rounded-sm px-3 py-1.5 text-sm font-medium transition-colors ${
                modo === m
                  ? m === 'interna'
                    ? 'bg-roman-surface text-roman-text-main shadow-sm'
                    : 'bg-roman-primary text-roman-on-primary shadow-sm'
                  : 'text-roman-text-sub hover:text-roman-text-main'
              }`}
            >
              {m === 'interna' ? 'Nota interna' : 'Mensagem ao solicitante'}
            </button>
          ))}
        </div>

        <label className="block">
          <textarea
            value={texto}
            onChange={event => setTexto(event.target.value)}
            rows={4}
            placeholder={
              modo === 'interna'
                ? 'Fica só no histórico da OS. Ninguém de fora recebe.'
                : 'Vai por e-mail para quem abriu a OS e para quem está em cópia.'
            }
            className={`w-full resize-y rounded-sm border px-3 py-2 text-sm text-roman-text-main outline-none ${
              modo === 'interna'
                ? 'border-roman-border bg-roman-bg/60 focus:border-roman-text-sub'
                : 'border-roman-primary/50 bg-roman-primary/[0.04] focus:border-roman-primary'
            }`}
          />
        </label>

        {arquivos.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {arquivos.map((arquivo, i) => (
              <span
                key={`${arquivo.name}-${i}`}
                className="inline-flex items-center gap-1 rounded-sm border border-roman-border bg-roman-bg px-2 py-1 text-xs text-roman-text-sub"
              >
                <Paperclip size={14} />
                {arquivo.name}
                <button
                  type="button"
                  onClick={() => setArquivos(prev => prev.filter((_, idx) => idx !== i))}
                  className="ml-0.5 hover:text-roman-danger"
                >
                  <X size={14} />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm border border-roman-border bg-roman-surface px-2.5 py-1.5 text-xs font-medium text-roman-text-sub hover:border-roman-primary hover:text-roman-text-main">
            <Paperclip size={14} />
            Anexar
            <input
              type="file"
              multiple
              className="hidden"
              onChange={event => {
                setArquivos(prev => [...prev, ...Array.from(event.target.files || [])]);
                event.target.value = '';
              }}
            />
          </label>
          {/* Os destinatários ficam GRUDADOS no botão de enviar, não no topo do
              modal: é aqui que a pessoa decide, e é aqui que ela precisa ver para
              quem vai. */}
          <span className="text-xs text-roman-text-sub">
            {modo === 'interna' ? (
              <>Não sai da OS — <span className="text-roman-text-main">ninguém é notificado</span>.</>
            ) : destinatarios.length > 0 ? (
              <>Vai para: <span className="text-roman-text-main">{destinatarios.join(', ')}</span></>
            ) : (
              'Esta OS não tem e-mail de destinatário — fica registrada, mas nada será enviado.'
            )}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-sm border border-roman-border bg-roman-bg p-3">
          <Hourglass size={14} className="text-roman-text-sub" />
          {aguardaDesde ? (
            <>
              <span className="flex-1 text-sm text-roman-text-main">
                Aguardando retorno desde{' '}
                {aguardaDesde.toLocaleDateString('pt-BR', { timeZone: 'America/Fortaleza' })}.
              </span>
              <button
                type="button"
                onClick={() => void marcarAguardando(false)}
                disabled={enviando}
                className="rounded-sm border border-roman-border bg-roman-surface px-2.5 py-1.5 text-xs font-medium text-roman-text-sub hover:text-roman-text-main disabled:opacity-60"
              >
                Já retornaram
              </button>
            </>
          ) : (
            <>
              <span className="flex-1 text-sm text-roman-text-sub">
                Pediu algo e está esperando resposta? Registre — a OS volta para você em 3 dias úteis.
              </span>
              <button
                type="button"
                onClick={() => void marcarAguardando(true)}
                disabled={enviando}
                className="rounded-sm border border-roman-border bg-roman-surface px-2.5 py-1.5 text-xs font-medium text-roman-text-sub hover:text-roman-text-main disabled:opacity-60"
              >
                Aguardo retorno
              </button>
            </>
          )}
        </div>

        {aviso && <div className="rounded-sm border border-roman-border bg-roman-bg p-3 text-sm text-roman-text-main">{aviso}</div>}
        {erro && <div className="rounded-sm border border-roman-danger/35 bg-roman-danger/12 p-3 text-sm text-roman-danger">{erro}</div>}
      </div>
    </ModalShell>
  );
}
