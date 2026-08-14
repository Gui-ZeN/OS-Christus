import React, { useEffect, useState } from 'react';
import { Loader2, UserRound } from 'lucide-react';
import { ModalShell } from '../../components/ui/ModalShell';
import { useApp } from '../../context/AppContext';
import { fetchUsers, type DirectoryUser } from '../../services/directoryApi';
import { mensagemDeErro } from '../../utils/errorMessage';
import { repairMojibake } from '../../utils/text';
import type { HistoryItem } from '../../types';

/**
 * Quem responde por esta OS não parar.
 *
 * Não confundir com a equipe: 180 das 195 OS vivas já têm `assignedTeam`, e isso não
 * moveu nenhuma das 155 paradas há 39 dias. Equipe responde pelo trabalho; pessoa
 * responde pelo prazo. "Construtora" não abre o sistema nem é cobrada por uma OS.
 *
 * A lista oferece só Admin e Gestor — são os papéis que conseguem agir sobre a OS.
 * Nomear alguém que não pode mexer seria criar responsabilidade sem poder.
 */
export function ResponsavelModal({ ticketId, onClose }: { ticketId: string; onClose: () => void }) {
  const { tickets, currentUser, updateTicket } = useApp();
  const ticket = tickets.find(item => item.id === ticketId) || null;

  const [pessoas, setPessoas] = useState<DirectoryUser[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [escolhido, setEscolhido] = useState<string>('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const todos = await fetchUsers();
        if (cancelado) return;
        setPessoas(
          todos.filter(
            pessoa =>
              (pessoa.role === 'Admin' || pessoa.role === 'Gestor') &&
              pessoa.active !== false &&
              pessoa.status !== 'Inativo'
          )
        );
      } catch (e) {
        if (!cancelado) setErro(mensagemDeErro(e, 'Não foi possível carregar as pessoas.'));
      } finally {
        if (!cancelado) setCarregando(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  useEffect(() => {
    setEscolhido(ticket?.responsible?.email || '');
  }, [ticket?.responsible?.email]);

  if (!ticket) return null;

  const atual = ticket.responsible;
  const mudou = (escolhido || '') !== (atual?.email || '');

  const salvar = async () => {
    if (!mudou || salvando) return;
    setSalvando(true);
    setErro('');
    try {
      const pessoa = pessoas.find(item => item.email === escolhido) || null;
      // `setAt` reinicia o relógio de "sem progresso": quem assume uma OS parada há
      // 39 dias merece a janela inteira, não uma cobrança no mesmo segundo.
      const responsible = pessoa
        ? { email: pessoa.email, name: pessoa.name, setAt: new Date() }
        : null;
      const entrada: HistoryItem = {
        id: crypto.randomUUID(),
        type: 'system',
        sender: currentUser?.name || 'Sistema',
        time: new Date(),
        text: responsible
          ? `Responsável pela OS: ${responsible.name} (${responsible.email}).`
          : `Responsável removido${atual ? ` (era ${atual.name})` : ''}.`,
        visibility: 'internal',
      };
      const ok = await updateTicket(ticket.id, {
        responsible,
        history: [...(ticket.history || []), entrada],
      });
      if (!ok) {
        setErro('Não foi possível salvar. Verifique a conexão e tente de novo.');
        return;
      }
      onClose();
    } catch (e) {
      setErro(mensagemDeErro(e, 'Não foi possível definir o responsável.'));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <ModalShell
      isOpen
      onClose={onClose}
      title="Responsável pela OS"
      description={`${ticket.id} · ${repairMojibake(ticket.subject)}`}
      maxWidthClass="max-w-md"
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
            disabled={!mudou || salvando}
            className="inline-flex items-center gap-2 rounded-sm bg-roman-sidebar px-4 py-2 text-sm font-medium text-white hover:bg-roman-sidebar-light disabled:opacity-60"
          >
            {salvando && <Loader2 size={14} className="animate-spin" />}
            Salvar
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-roman-text-sub">
          Quem responde por esta OS <strong className="text-roman-text-main">não parar</strong> — não
          quem executa. A execução continua com {' '}
          <span className="text-roman-text-main">{repairMojibake(ticket.assignedTeam || 'a equipe definida na OS')}</span>.
        </p>

        {carregando ? (
          <div className="flex items-center gap-2 py-4 text-sm text-roman-text-sub">
            <Loader2 size={14} className="animate-spin" /> Carregando pessoas…
          </div>
        ) : (
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-roman-text-main">Responsável</span>
            <select
              value={escolhido}
              onChange={event => setEscolhido(event.target.value)}
              className="w-full rounded-sm border border-roman-border bg-roman-surface px-3 py-2 text-sm text-roman-text-main outline-none focus:border-roman-primary"
            >
              <option value="">Sem responsável</option>
              {pessoas.map(pessoa => (
                <option key={pessoa.email} value={pessoa.email}>
                  {pessoa.name} · {pessoa.role}
                </option>
              ))}
            </select>
          </label>
        )}

        {currentUser?.email && escolhido !== currentUser.email && (
          <button
            type="button"
            onClick={() => setEscolhido(currentUser.email)}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-roman-primary hover:underline"
          >
            <UserRound size={14} /> Assumir eu mesmo
          </button>
        )}

        {erro && <div className="rounded-sm border border-roman-danger/35 bg-roman-danger/12 p-3 text-sm text-roman-danger">{erro}</div>}
      </div>
    </ModalShell>
  );
}
