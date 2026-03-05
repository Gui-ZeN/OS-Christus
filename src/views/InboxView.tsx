import React, { useState, useRef, useEffect, useMemo } from 'react';
import { CheckCircle, Loader2, FileText, Shield, List, Play, CheckSquare, Paperclip, Search, Filter, Clock, AlertCircle, User, Image as ImageIcon, ChevronDown, Plus, MoreHorizontal, Lock, Bold, Italic, ExternalLink, Copy, X, DollarSign } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { TicketListItem } from '../components/ui/TicketListItem';
import { PropertyField } from '../components/ui/PropertyField';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useApp } from '../context/AppContext';
import { useClickOutside } from '../hooks/useClickOutside';
import { InboxFilter, HistoryItem, Ticket } from '../types';
import { TICKET_STATUS } from '../constants/ticketStatus';

// Z7: Renders a filter section with checkboxes for a given dimension
function renderFilterSection(
  label: string,
  dim: keyof InboxFilter,
  options: string[],
  inboxFilter: InboxFilter,
  setInboxFilter: (f: InboxFilter) => void
) {
  return (
    <div>
      <div className="px-4 py-2 text-[10px] font-serif uppercase tracking-widest text-roman-text-sub border-b border-roman-border bg-roman-bg/50 flex justify-between items-center">
        <span>{label}</span>
        {inboxFilter[dim].length > 0 && (
          <button
            onClick={() => setInboxFilter({ ...inboxFilter, [dim]: [] })}
            className="text-roman-primary hover:underline normal-case tracking-normal font-sans text-[11px]"
          >
            Limpar
          </button>
        )}
      </div>
      {options.map(opt => (
        <button
          key={opt}
          onClick={() => {
            const current = inboxFilter[dim];
            const next = current.includes(opt) ? current.filter(v => v !== opt) : [...current, opt];
            setInboxFilter({ ...inboxFilter, [dim]: next });
          }}
          className={`w-full text-left px-4 py-2 text-[12px] hover:bg-roman-bg transition-colors flex items-center gap-2 ${inboxFilter[dim].includes(opt) ? 'text-roman-primary font-medium' : 'text-roman-text-main'}`}
        >
          <div className={`w-3 h-3 border rounded-sm flex items-center justify-center flex-shrink-0 ${inboxFilter[dim].includes(opt) ? 'bg-roman-primary border-roman-primary' : 'border-roman-border'}`}>
            {inboxFilter[dim].includes(opt) && <CheckSquare size={9} className="text-white" />}
          </div>
          {opt}
        </button>
      ))}
    </div>
  );
}

export function InboxView() {
  const {
    navigateTo,
    openAttachment,
    setTrackingTicketToken,
    activeTicketId,
    setActiveTicketId,
    inboxFilter,
    setInboxFilter,
    tickets,
    updateTicket,
    addTicket,
  } = useApp();

  const [replyMode, setReplyMode] = useState<'public' | 'internal'>('internal');
  const [replyText, setReplyText] = useState('');
  const [techTeam, setTechTeam] = useState('');
  const [customEmail, setCustomEmail] = useState('');

  const replyFileRef = useRef<HTMLInputElement>(null);
  const replyTextRef = useRef<HTMLTextAreaElement>(null);
  const [replyFiles, setReplyFiles] = useState<File[]>([]);

  // Derived state — usa tickets do contexto (mutável)
  const activeTicket = tickets.find(t => t.id === activeTicketId) ?? tickets[0];
  const isClosed = activeTicket.status === TICKET_STATUS.CLOSED || activeTicket.status === TICKET_STATUS.CANCELED;

  // Reseta campos ao trocar de ticket
  useEffect(() => {
    setReplyText('');
    setTechTeam('');
    setCustomEmail('');
    setReplyFiles([]);
    if (replyFileRef.current) replyFileRef.current.value = '';
  }, [activeTicketId]);

  // Z5: Registra mudança de equipe técnica direto no histórico do ticket
  const handleTechTeamChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newValue = e.target.value;
    const oldValue = techTeam || 'Não atribuído';
    setTechTeam(newValue);

    const item: HistoryItem = {
      id: crypto.randomUUID(),
      type: 'field_change',
      sender: 'Rafael (Gestor)',
      time: new Date(),
      field: 'Equipe Técnica',
      from: oldValue,
      to: newValue,
    };
    updateTicket(activeTicket.id, { history: [...activeTicket.history, item] });
  };

  // Botão principal de ação: transição de status + registro no histórico
  const handleSend = () => {
    const now = new Date();
    const sender = 'Rafael (Gestor)';

    if (replyMode === 'internal') {
      const items: HistoryItem[] = [];
      let newStatus = activeTicket.status;

      if (activeTicket.status === TICKET_STATUS.NEW || activeTicket.status.includes('Aprovada na Triagem')) {
        newStatus = TICKET_STATUS.WAITING_TECH_OPINION;
        const target =
          techTeam === 'Terceirizada' && customEmail
            ? customEmail
            : techTeam || 'Equipe Técnica';

        if (replyText.trim()) {
          items.push({ id: crypto.randomUUID(), type: 'system', sender, time: now, text: replyText.trim() });
        }
        items.push({
          id: crypto.randomUUID(),
          type: 'system',
          sender,
          time: new Date(now.getTime() + 1),
          text: `Parecer técnico solicitado para ${target}.`,
        });
      } else if (activeTicket.status === TICKET_STATUS.WAITING_TECH_OPINION) {
        newStatus = TICKET_STATUS.WAITING_SOLUTION_APPROVAL;
        if (replyText.trim()) {
          items.push({ id: crypto.randomUUID(), type: 'tech', sender, time: now, text: replyText.trim() });
        }
        items.push({
          id: crypto.randomUUID(),
          type: 'system',
          sender,
          time: new Date(now.getTime() + 1),
          text: 'Parecer consolidado e enviado para aprovação da Diretoria.',
        });
      } else if (replyText.trim()) {
        items.push({ id: crypto.randomUUID(), type: 'system', sender, time: now, text: replyText.trim() });
      }

      if (items.length > 0 || newStatus !== activeTicket.status) {
        updateTicket(activeTicket.id, { status: newStatus, history: [...activeTicket.history, ...items] });
      }
    } else {
      if (!replyText.trim()) return;
      const item: HistoryItem = { id: crypto.randomUUID(), type: 'tech', sender, time: now, text: replyText.trim() };
      updateTicket(activeTicket.id, { history: [...activeTicket.history, item] });
    }

    setReplyText('');
    setReplyFiles([]);
    if (replyFileRef.current) replyFileRef.current.value = '';
  };

  // Controle de Execução
  const handleStartExecution = () => {
    const item: HistoryItem = {
      id: crypto.randomUUID(), type: 'system', sender: 'Rafael (Gestor)',
      time: new Date(), text: 'Execução da obra iniciada.',
    };
    updateTicket(activeTicket.id, { status: TICKET_STATUS.IN_PROGRESS, history: [...activeTicket.history, item] });
  };

  const handleSendForValidation = () => {
    const item: HistoryItem = {
      id: crypto.randomUUID(), type: 'system', sender: 'Rafael (Gestor)',
      time: new Date(), text: 'Serviço concluído. Aguardando validação do solicitante.',
    };
    updateTicket(activeTicket.id, { status: TICKET_STATUS.WAITING_MAINTENANCE_APPROVAL, history: [...activeTicket.history, item] });
  };

  const handleCloseTicket = () => {
    const item: HistoryItem = {
      id: crypto.randomUUID(), type: 'system', sender: 'Rafael (Gestor)',
      time: new Date(), text: 'OS encerrada após confirmação de pagamento.',
    };
    updateTicket(activeTicket.id, { status: TICKET_STATUS.CLOSED, history: [...activeTicket.history, item] });
  };

  const [isSending, setIsSending] = useState(false);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [showMobileTicketList, setShowMobileTicketList] = useState(false);
  const [showMobileContext, setShowMobileContext] = useState(false);
  const [showQuotesModal, setShowQuotesModal] = useState(false);
  const [showPrelimModal, setShowPrelimModal] = useState(false);
  const [quoteAttachments, setQuoteAttachments] = useState<Array<File | null>>([null, null, null]);
  const [prelimChecked, setPrelimsChecked] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<string | null>(null);
  const isMobileOverlayOpen = showMobileTicketList || showMobileContext;
  const shouldLockBodyScroll = isMobileOverlayOpen || showQuotesModal || showPrelimModal;

  useEffect(() => {
    function handleEsc(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      if (showQuotesModal) setShowQuotesModal(false);
      if (showPrelimModal) setShowPrelimModal(false);
      if (showActionsMenu) setShowActionsMenu(false);
      if (showFilterMenu) setShowFilterMenu(false);
      if (showMobileTicketList) setShowMobileTicketList(false);
      if (showMobileContext) setShowMobileContext(false);
    }
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [showQuotesModal, showPrelimModal, showActionsMenu, showFilterMenu, showMobileTicketList, showMobileContext]);

  useEffect(() => {
    setShowActionsMenu(false);
    setShowMobileTicketList(false);
    setShowMobileContext(false);
  }, [activeTicketId]);

  useEffect(() => {
    if (!shouldLockBodyScroll) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [shouldLockBodyScroll]);

  // useClickOutside substitui o useEffect manual anterior
  const filterMenuRef = useClickOutside<HTMLDivElement>(() => setShowFilterMenu(false));
  const actionsMenuRef = useClickOutside<HTMLDivElement>(() => setShowActionsMenu(false));

  const [quotes, setQuotes] = useState([
    { vendor: '', value: '' },
    { vendor: '', value: '' },
    { vendor: '', value: '' },
  ]);

  // Reseta cotações ao trocar de ticket
  useEffect(() => {
    setQuotes([{ vendor: '', value: '' }, { vendor: '', value: '' }, { vendor: '', value: '' }]);
    setQuoteAttachments([null, null, null]);
  }, [activeTicketId]);

  // useMemo evita recalcular em todo re-render
  const filteredTickets = useMemo(() => tickets.filter(t => {
    if (inboxFilter.status.length > 0 && !inboxFilter.status.includes(t.status)) return false;
    if (inboxFilter.priority.length > 0 && t.priority && !inboxFilter.priority.includes(t.priority)) return false;
    if (inboxFilter.region.length > 0 && !inboxFilter.region.includes(t.region)) return false;
    if (inboxFilter.type.length > 0 && !inboxFilter.type.includes(t.type)) return false;
    return true;
  }).sort((a, b) => {
    const isAUrgentCorrective = a.type === 'Corretiva' && a.priority === 'Urgente';
    const isBUrgentCorrective = b.type === 'Corretiva' && b.priority === 'Urgente';
    if (isAUrgentCorrective && !isBUrgentCorrective) return -1;
    if (!isAUrgentCorrective && isBUrgentCorrective) return 1;
    return b.time.getTime() - a.time.getTime();
  }), [tickets, inboxFilter]);

  const handleReplyFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setReplyFiles(Array.from(e.target.files));
  };

  // Labels dinâmicos do reply box conforme status
  let internalTabLabel = 'Nota Interna';
  let internalPlaceholder = 'Adicione uma nota interna...';
  let internalButtonText = 'Salvar Nota';
  let internalActionText = 'Ação: Registrar nota no histórico';

  if (activeTicket.status === TICKET_STATUS.NEW || activeTicket.status.includes('Aprovada na Triagem')) {
    internalTabLabel = 'Solicitar Parecer Técnico';
    internalPlaceholder = 'Descreva a solicitação para a equipe técnica...';
    internalButtonText = 'Avançar: Aguardando Parecer';
    internalActionText = `Ação: Disparar e-mail para ${techTeam === 'Terceirizada' && customEmail ? customEmail : techTeam || 'Equipe Técnica'}`;
  } else if (activeTicket.status === TICKET_STATUS.WAITING_TECH_OPINION) {
    internalTabLabel = 'Enviar Parecer à Diretoria';
    internalPlaceholder = 'Consolide o parecer técnico antes de enviar para aprovação...';
    internalButtonText = 'Enviar para Aprovação';
    internalActionText = 'Ação: Mover para Aguardando Aprovação da Solução';
  } else if (activeTicket.status.includes('Orçamento') || activeTicket.status.includes('Cotação')) {
    internalTabLabel = 'Anotação de Cotação';
    internalPlaceholder = 'Registre detalhes das negociações com fornecedores...';
    internalButtonText = 'Salvar Anotação';
    internalActionText = 'Ação: Registrar no histórico interno';
  } else if (activeTicket.status.includes('Validação') || activeTicket.status.includes('Execução')) {
    internalTabLabel = 'Diário de Obra';
    internalPlaceholder = 'Registre o andamento da execução...';
    internalButtonText = 'Salvar Registro';
    internalActionText = 'Ação: Registrar no histórico interno';
  }

  const handleQuoteChange = (index: number, field: 'vendor' | 'value', value: string) => {
    const newQuotes = [...quotes];
    newQuotes[index][field] = value;
    setQuotes(newQuotes);
  };

  const handleQuoteAttachmentChange = (index: number, file: File | null) => {
    setQuoteAttachments(prev => prev.map((item, i) => (i === index ? file : item)));
  };

  const applyFormatting = (type: 'bold' | 'italic' | 'list') => {
    if (!replyTextRef.current) return;
    const el = replyTextRef.current;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = replyText.slice(start, end);
    const before = replyText.slice(0, start);
    const after = replyText.slice(end);

    let insertion = selected;
    if (type === 'bold') insertion = `**${selected || 'texto'}**`;
    if (type === 'italic') insertion = `*${selected || 'texto'}*`;
    if (type === 'list') insertion = selected ? selected.split('\n').map(line => `- ${line}`).join('\n') : '- item';

    const next = `${before}${insertion}${after}`;
    setReplyText(next);
  };

  const handleSendToDirector = () => {
    const filled = quotes.filter(q => q.vendor.trim() !== '' && q.value.trim() !== '');
    if (filled.length < 3) {
      setToast('Erro: Preencha os 3 orçamentos antes de enviar.');
      setTimeout(() => setToast(null), 3000);
      return;
    }
    setIsSending(true);
    setTimeout(() => {
      const historyItem: HistoryItem = {
        id: crypto.randomUUID(),
        type: 'system',
        sender: 'Rafael (Gestor)',
        time: new Date(),
        text: 'Orçamentos consolidados e enviados para aprovação da Diretoria.',
      };
      updateTicket(activeTicket.id, {
        status: TICKET_STATUS.WAITING_BUDGET_APPROVAL,
        history: [...activeTicket.history, historyItem],
      });
      setIsSending(false);
      setToast('Orçamentos enviados para a Diretoria com sucesso!');
      setTimeout(() => setToast(null), 3000);
    }, 1500);
  };

  // Usa trackingToken (opaco) em vez do ID sequencial
  const handleCopyLink = () => {
    const trackingToken = encodeURIComponent(activeTicket.trackingToken);
    const url = `${window.location.origin}/?tracking=${trackingToken}`;
    navigator.clipboard.writeText(url).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    });
    setToast('Link copiado para a área de transferência!');
    setTimeout(() => setToast(null), 3000);
    setShowActionsMenu(false);
  };

  const handleOpenTracking = () => {
    setTrackingTicketToken(activeTicket.trackingToken);
    navigateTo('tracking');
    setShowActionsMenu(false);
    setShowMobileContext(false);
  };

  const getNextTicketNumber = () => {
    return tickets.reduce((max, t) => {
      const n = parseInt(t.id.replace('OS-', ''), 10);
      return isNaN(n) ? max : Math.max(max, n);
    }, 0) + 1;
  };

  const handleDuplicateTicket = () => {
    const nextNum = getNextTicketNumber();
    const newId = `OS-${String(nextNum).padStart(4, '0')}`;
    const newToken = `trk_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const now = new Date();

    const duplicated: Ticket = {
      ...activeTicket,
      id: newId,
      trackingToken: newToken,
      status: TICKET_STATUS.NEW,
      time: now,
      history: [
        ...activeTicket.history,
        {
          id: crypto.randomUUID(),
          type: 'system',
          sender: 'Sistema',
          time: now,
          text: `OS duplicada de ${activeTicket.id} e reiniciada para triagem.`,
        },
      ],
    };

    updateTicket(activeTicket.id, {
      history: [
        ...activeTicket.history,
        {
          id: crypto.randomUUID(),
          type: 'system',
          sender: 'Rafael (Gestor)',
          time: now,
          text: `OS duplicada para ${newId}.`,
        },
      ],
    });

    addTicket(duplicated);
    setActiveTicketId(newId);
    setShowActionsMenu(false);
    setToast(`OS ${activeTicket.id} duplicada como ${newId}.`);
    setTimeout(() => setToast(null), 3000);
  };

  const handleCancelTicket = () => {
    if (activeTicket.status === TICKET_STATUS.CANCELED) return;
    updateTicket(activeTicket.id, {
      status: TICKET_STATUS.CANCELED,
      history: [
        ...activeTicket.history,
        {
          id: crypto.randomUUID(),
          type: 'system',
          sender: 'Rafael (Gestor)',
          time: new Date(),
          text: 'OS cancelada pelo gestor através do menu de ações.',
        },
      ],
    });
    setShowActionsMenu(false);
    setToast(`OS ${activeTicket.id} cancelada.`);
    setTimeout(() => setToast(null), 3000);
  };

  const handleReopenTicket = () => {
    updateTicket(activeTicket.id, {
      status: TICKET_STATUS.IN_PROGRESS,
      history: [
        ...activeTicket.history,
        {
          id: crypto.randomUUID(),
          type: 'system',
          sender: 'Rafael (Gestor)',
          time: new Date(),
          text: 'OS reaberta pelo gestor para continuação do atendimento.',
        },
      ],
    });
    setShowActionsMenu(false);
    setToast(`OS ${activeTicket.id} reaberta.`);
    setTimeout(() => setToast(null), 3000);
  };

  // Z7: active chips
  const activeChips: { dim: keyof typeof inboxFilter; value: string }[] = (
    ['status', 'priority', 'region', 'type'] as (keyof typeof inboxFilter)[]
  ).flatMap(dim => inboxFilter[dim].map(value => ({ dim, value })));

  const removeChip = (dim: keyof typeof inboxFilter, value: string) => {
    setInboxFilter({ ...inboxFilter, [dim]: inboxFilter[dim].filter(v => v !== value) });
  };

  return (
    <div className="flex-1 flex overflow-hidden relative">
      {/* Toast */}
      {toast && (
        <div className={`absolute top-6 left-1/2 -translate-x-1/2 px-6 py-3 rounded-sm shadow-lg flex items-center gap-3 z-[100] animate-in slide-in-from-top-4 fade-in ${toast.includes('Erro') ? 'bg-red-800 text-white' : 'bg-green-800 text-white'}`}>
          {toast.includes('Erro') ? <AlertCircle size={18} /> : <CheckCircle size={18} />}
          <span className="font-medium text-sm">{toast}</span>
        </div>
      )}

      {isMobileOverlayOpen && (
        <button
          className="md:hidden fixed inset-0 bg-black/40 z-30"
          onClick={() => {
            setShowMobileTicketList(false);
            setShowMobileContext(false);
          }}
          aria-label="Fechar painéis móveis"
        />
      )}

      {/* Ticket List Pane */}
      <div id="ticket-list-drawer" className={`fixed md:static inset-y-0 left-0 z-40 w-[86vw] max-w-80 md:w-80 bg-roman-surface border-r border-roman-border flex flex-col shadow-[1px_0_5px_rgba(0,0,0,0.02)] transition-transform duration-200 ${showMobileTicketList ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="h-14 border-b border-roman-border flex items-center justify-between px-4 hover:bg-roman-bg cursor-pointer">
          <div className="flex items-center gap-2">
            <h2 className="font-serif text-[16px] font-semibold tracking-wide">Minhas Filas (Rafael)</h2>
            <ChevronDown size={16} className="text-roman-text-sub" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-roman-text-sub font-serif italic text-sm">{tickets.length}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowMobileTicketList(false);
                setShowMobileContext(false);
              }}
              className="md:hidden text-roman-text-sub hover:text-roman-text-main"
              aria-label="Fechar lista"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="p-2 border-b border-roman-border flex gap-2 bg-roman-bg/50 overflow-x-auto [&::-webkit-scrollbar]:hidden">
          <button onClick={() => setInboxFilter({ ...inboxFilter, status: [TICKET_STATUS.NEW] })} className={`border rounded px-3 py-1.5 text-center transition-colors font-medium whitespace-nowrap ${inboxFilter.status.includes(TICKET_STATUS.NEW) && inboxFilter.status.length === 1 ? 'border-roman-primary/50 bg-roman-primary/10 text-roman-primary' : 'border-roman-border hover:bg-roman-border-light text-roman-text-sub'}`}>
            Novas OS ({tickets.filter(t => t.status === TICKET_STATUS.NEW).length})
          </button>
          <button onClick={() => setInboxFilter({ ...inboxFilter, status: [TICKET_STATUS.WAITING_BUDGET] })} className={`border rounded px-3 py-1.5 text-center transition-colors font-medium whitespace-nowrap ${inboxFilter.status.includes(TICKET_STATUS.WAITING_BUDGET) && inboxFilter.status.length === 1 ? 'border-roman-primary/50 bg-roman-primary/10 text-roman-primary' : 'border-roman-border hover:bg-roman-border-light text-roman-text-sub'}`}>
            Aguard. Orçamento ({tickets.filter(t => t.status === TICKET_STATUS.WAITING_BUDGET).length})
          </button>
          <button onClick={() => setInboxFilter({ ...inboxFilter, status: [TICKET_STATUS.IN_PROGRESS] })} className={`border rounded px-3 py-1.5 text-center transition-colors font-medium whitespace-nowrap ${inboxFilter.status.includes(TICKET_STATUS.IN_PROGRESS) && inboxFilter.status.length === 1 ? 'border-roman-primary/50 bg-roman-primary/10 text-roman-primary' : 'border-roman-border hover:bg-roman-border-light text-roman-text-sub'}`}>
            Em Execução ({tickets.filter(t => t.status === TICKET_STATUS.IN_PROGRESS).length})
          </button>
          <button onClick={() => setInboxFilter({ status: [], priority: [], region: [], type: [] })} className={`border rounded px-3 py-1.5 text-center transition-colors font-medium whitespace-nowrap ${inboxFilter.status.length === 0 ? 'border-roman-primary/50 bg-roman-primary/10 text-roman-primary' : 'border-roman-border hover:bg-roman-border-light text-roman-text-sub'}`}>
            Limpar Filtros
          </button>
        </div>

        {/* Z7: Active Filter Chips */}
        {activeChips.length > 0 && (
          <div className="px-2 py-2 border-b border-roman-border flex flex-wrap gap-1.5 bg-roman-bg/70">
            {activeChips.map(chip => (
              <span
                key={`${String(chip.dim)}-${chip.value}`}
                className="inline-flex items-center gap-1 bg-roman-primary/10 text-roman-primary border border-roman-primary/30 rounded-sm px-2 py-0.5 text-[11px] font-medium"
              >
                {chip.value}
                <button
                  onClick={() => removeChip(chip.dim, chip.value)}
                  className="hover:text-red-600 transition-colors ml-0.5"
                  aria-label={`Remover filtro ${chip.value}`}
                >
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Ticket List */}
        <div className="flex-1 overflow-y-auto">
          {filteredTickets.length === 0 ? (
            <div className="p-8 text-center text-roman-text-sub font-serif italic">Nenhuma OS encontrada para este filtro.</div>
          ) : (
            filteredTickets.map(ticket => (
              <TicketListItem
                key={ticket.id}
                id={ticket.id}
                subject={ticket.subject}
                requester={ticket.requester}
                time={ticket.time}
                status={ticket.status}
                priority={ticket.priority}
                viewingBy={ticket.viewingBy}
                active={activeTicketId === ticket.id}
                onClick={() => {
                  setActiveTicketId(ticket.id);
                  setShowMobileTicketList(false);
                }}
              />
            ))
          )}
        </div>
      </div>

      {/* Main Ticket Workspace */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Navigation */}
        <header className="h-12 bg-roman-surface border-b border-roman-border flex items-center px-2">
          <div className="md:hidden flex h-full items-center gap-2 px-2">
            <button
              onClick={() => {
                setShowMobileTicketList(prev => !prev);
                setShowMobileContext(false);
              }}
              className="px-2 py-1 border border-roman-border rounded-sm text-xs text-roman-text-main"
              aria-expanded={showMobileTicketList}
              aria-controls="ticket-list-drawer"
            >
              Filas
            </button>
            <div className="text-[11px] text-roman-text-sub font-medium max-w-[42vw] truncate" title={`${activeTicket.id} · ${activeTicket.status}`}>
              #{activeTicket.id} · {activeTicket.status}
            </div>
            <button
              onClick={() => {
                setShowMobileContext(prev => !prev);
                setShowMobileTicketList(false);
              }}
              className="px-2 py-1 border border-roman-border rounded-sm text-xs text-roman-text-main"
              aria-expanded={showMobileContext}
              aria-controls="context-drawer"
            >
              Dados
            </button>
          </div>
          <div className="hidden md:flex h-full">
            <div className="h-full px-4 border-r border-roman-border flex items-center gap-2 bg-roman-bg border-t-2 border-t-roman-primary font-medium">
              <span className="w-2 h-2 rounded-full bg-roman-primary"></span>
              <span className="font-serif italic text-roman-text-sub mr-1">#{activeTicket.id}</span>
              {activeTicket.subject.length > 20
                ? `${activeTicket.subject.substring(0, 20)}…`
                : activeTicket.subject}
            </div>
            <button onClick={() => navigateTo('public-form')} className="h-full px-4 border-r border-roman-border flex items-center gap-2 hover:bg-roman-bg cursor-pointer text-roman-text-sub">
              <Plus size={16} />
              <span className="font-serif">Nova OS</span>
            </button>
          </div>
          <div className="ml-auto flex items-center gap-3 px-4 relative">
            <div className="hidden md:flex items-center gap-2 mr-4 text-xs text-roman-text-sub">
              <User size={14} />
              <span>Visualizando como: <strong>Rafael (Gestor)</strong></span>
            </div>
            <button
              onClick={() => setShowFilterMenu(!showFilterMenu)}
              className={`transition-colors ${showFilterMenu || Object.values(inboxFilter).some(arr => (arr as string[]).length > 0) ? 'text-roman-primary' : 'text-roman-text-sub hover:text-roman-text-main'}`}
              title="Filtros compostos"
              aria-label="Filtros compostos"
              aria-expanded={showFilterMenu}
            >
              <Filter size={18} />
            </button>
            {showFilterMenu && (
              <div ref={filterMenuRef} className="absolute top-8 right-10 w-72 bg-roman-surface border border-roman-border shadow-xl rounded-sm z-20 max-h-[500px] overflow-y-auto">
                <div className="px-4 py-3 border-b border-roman-border flex justify-between items-center bg-roman-bg sticky top-0">
                  <span className="text-xs font-serif font-semibold text-roman-text-main">Filtros Compostos</span>
                  <button
                    onClick={() => setInboxFilter({ status: [], priority: [], region: [], type: [] })}
                    className="text-[11px] text-roman-primary hover:underline font-medium"
                  >
                    Limpar todos
                  </button>
                </div>
                                {renderFilterSection('Status', 'status', [
                  TICKET_STATUS.NEW, TICKET_STATUS.WAITING_TECH_OPINION, TICKET_STATUS.WAITING_SOLUTION_APPROVAL,
                  TICKET_STATUS.WAITING_BUDGET, TICKET_STATUS.WAITING_BUDGET_APPROVAL,
                  TICKET_STATUS.WAITING_CONTRACT_APPROVAL, TICKET_STATUS.WAITING_PRELIM_ACTIONS,
                  TICKET_STATUS.IN_PROGRESS, TICKET_STATUS.WAITING_MAINTENANCE_APPROVAL, TICKET_STATUS.WAITING_PAYMENT, TICKET_STATUS.CLOSED,
                ], inboxFilter, setInboxFilter)}
                {renderFilterSection('Prioridade', 'priority', ['Urgente', 'Alta', 'Normal', 'Trivial'], inboxFilter, setInboxFilter)}
                {renderFilterSection('Região', 'region', [
                  'Dionísio Torres', 'Aldeota', 'Parquelândia', 'Sul', 'Benfica', 'Universidade',
                ], inboxFilter, setInboxFilter)}
                {renderFilterSection('Tipo', 'type', ['Corretiva', 'Preventiva', 'Melhoria'], inboxFilter, setInboxFilter)}
              </div>
            )}
            <Search size={18} className="text-roman-text-sub" />
          </div>
        </header>

        {/* Ticket Content Area */}
        <div className="flex-1 flex overflow-hidden">

          {/* Conversation Thread */}
          <div className="flex-1 flex flex-col bg-roman-bg overflow-y-auto">

            {/* Ticket Header */}
            <div className="bg-roman-surface p-6 border-b border-roman-border">
              <div className="flex items-start justify-between mb-4">
                <h1 className="text-3xl font-serif font-medium text-roman-text-main">{activeTicket.subject}</h1>
                <div className="relative">
                  <button
                    onClick={() => setShowActionsMenu(v => !v)}
                    className={`text-roman-text-sub hover:text-roman-text-main ${showActionsMenu ? 'text-roman-primary' : ''}`}
                    title="Ações da OS"
                    aria-label="Ações da OS"
                    aria-expanded={showActionsMenu}
                  >
                    <MoreHorizontal size={20} />
                  </button>
                  {showActionsMenu && (
                    <div ref={actionsMenuRef} className="absolute right-0 top-7 w-56 bg-roman-surface border border-roman-border shadow-xl rounded-sm z-20 overflow-hidden">
                      <button onClick={handleCopyLink} className="w-full text-left px-3 py-2 text-sm hover:bg-roman-bg transition-colors">
                        Copiar link de acompanhamento
                      </button>
                      <button onClick={handleOpenTracking} className="w-full text-left px-3 py-2 text-sm hover:bg-roman-bg transition-colors">
                        Abrir visão do solicitante
                      </button>
                      <button onClick={handleDuplicateTicket} className="w-full text-left px-3 py-2 text-sm hover:bg-roman-bg transition-colors">
                        Duplicar OS
                      </button>
                      {(activeTicket.status === TICKET_STATUS.CLOSED || activeTicket.status === TICKET_STATUS.CANCELED) ? (
                        <button onClick={handleReopenTicket} className="w-full text-left px-3 py-2 text-sm hover:bg-roman-bg transition-colors text-emerald-700">
                          Reabrir OS
                        </button>
                      ) : (
                        <button onClick={handleCancelTicket} className="w-full text-left px-3 py-2 text-sm hover:bg-red-50 transition-colors text-red-700">
                          Cancelar OS
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-4 text-roman-text-sub font-serif italic text-sm">
                <StatusBadge status={activeTicket.status} />
                <span>via Formulário do Sistema</span>
                <span>{formatDistanceToNow(activeTicket.time, { addSuffix: true, locale: ptBR })}</span>
                <button onClick={() => openAttachment(`Fotos: ${activeTicket.subject}`, 'image')} className="ml-auto text-roman-primary hover:underline flex items-center gap-1 not-italic font-medium text-xs">
                  <ImageIcon size={14} /> Ver Fotos Anexadas
                </button>
              </div>
            </div>

            {/* Messages — ordenados cronologicamente (mais antigo em cima) */}
            <div className="p-6 space-y-6 flex-1">
              {[...activeTicket.history]
                .sort((a, b) => a.time.getTime() - b.time.getTime())
                .map((item, index) => {
                  if (item.type === 'system') {
                    return (
                      <div key={index} className="flex gap-4 justify-center">
                        <div className="bg-roman-border-light/50 border border-roman-border rounded-full px-4 py-1 text-xs text-roman-text-sub font-serif italic flex items-center gap-2">
                          <Clock size={12} /> {item.text}
                        </div>
                      </div>
                    );
                  }

                  if (item.type === 'field_change') {
                    return (
                      <div key={index} className="flex gap-4 justify-center">
                        <div className="bg-roman-bg border border-roman-border rounded-sm px-3 py-1 text-[11px] text-roman-text-sub font-mono flex items-center gap-2">
                          <span className="font-semibold">{item.sender}</span> alterou
                          <span className="font-medium bg-roman-surface px-1 rounded border border-roman-border">{item.field}</span>
                          de <span className="line-through opacity-70">{item.from}</span>
                          para <span className="font-medium text-roman-text-main">{item.to}</span>
                          <span className="text-[10px] opacity-50 ml-1">{formatDistanceToNow(item.time, { addSuffix: true, locale: ptBR })}</span>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={index} className="flex gap-4">
                      <div className="w-10 h-10 rounded-sm bg-roman-border-light text-roman-text-main border border-roman-border flex items-center justify-center font-serif text-lg shrink-0">
                        {item.sender?.charAt(0) || 'U'}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-baseline gap-2 mb-1">
                          <span className="font-semibold text-[14px]">{item.sender}</span>
                          <span className="text-roman-text-sub text-xs font-serif italic">
                            {formatDistanceToNow(item.time, { addSuffix: true, locale: ptBR })}
                          </span>
                        </div>
                        <div className="bg-roman-surface border border-roman-border rounded-sm p-5 text-[14px] leading-relaxed shadow-sm">
                          {item.text}
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>

            {/* Reply Box */}
            <div className="p-6 pt-0 mt-auto">
              <div className={`border rounded-sm overflow-hidden shadow-sm transition-colors ${replyMode === 'internal' ? 'border-roman-parchment-border bg-roman-parchment' : 'border-roman-border bg-roman-surface'}`}>
                {/* Tabs */}
                <div className="flex border-b border-roman-border bg-roman-bg/50">
                  <button
                    onClick={() => setReplyMode('internal')}
                    className={`px-4 py-2 font-serif text-base tracking-wide flex items-center gap-2 ${replyMode === 'internal' ? 'bg-roman-parchment text-roman-text-main border-t-2 border-t-stone-800' : 'text-roman-text-sub hover:bg-roman-surface/50'}`}
                  >
                    <Lock size={14} /> {internalTabLabel}
                  </button>
                  <button
                    onClick={() => setReplyMode('public')}
                    className={`px-4 py-2 font-serif text-base tracking-wide ${replyMode === 'public' ? 'bg-roman-surface text-roman-text-main border-t-2 border-t-roman-primary' : 'text-roman-text-sub hover:bg-roman-surface/50'}`}
                  >
                    Mensagem ao Solicitante
                  </button>
                </div>

                {/* Formatting Toolbar */}
                <div className={`flex items-center gap-2 p-2 border-b border-roman-border/50 text-roman-text-sub ${isClosed ? 'opacity-50 pointer-events-none' : ''}`}>
                  <button onClick={() => applyFormatting('bold')} className="p-1 hover:bg-black/5 rounded" disabled={isClosed}><Bold size={16} /></button>
                  <button onClick={() => applyFormatting('italic')} className="p-1 hover:bg-black/5 rounded" disabled={isClosed}><Italic size={16} /></button>
                  <button onClick={() => applyFormatting('list')} className="p-1 hover:bg-black/5 rounded" disabled={isClosed}><List size={16} /></button>
                  <div className="w-px h-4 bg-roman-border mx-1"></div>
                  <button
                    onClick={() => replyFileRef.current?.click()}
                    className={`p-1 hover:bg-black/5 rounded relative ${replyFiles.length > 0 ? 'text-roman-primary' : ''}`}
                    title="Anexar arquivos"
                    disabled={isClosed}
                  >
                    <Paperclip size={16} />
                    {replyFiles.length > 0 && (
                      <span className="absolute -top-1 -right-1 w-2 h-2 bg-roman-primary rounded-full"></span>
                    )}
                  </button>
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    ref={replyFileRef}
                    onChange={handleReplyFileChange}
                    disabled={isClosed}
                  />
                </div>

                {/* Textarea */}
                <textarea
                  ref={replyTextRef}
                  className="w-full h-24 p-4 outline-none resize-none bg-transparent font-sans disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder={isClosed ? 'Esta OS está encerrada e não aceita novos comentários.' : (replyMode === 'internal' ? internalPlaceholder : 'Mensagem para o solicitante...')}
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  disabled={isClosed}
                />

                {/* File Preview */}
                {replyFiles.length > 0 && (
                  <div className="px-4 pb-2 flex flex-wrap gap-2">
                    {replyFiles.map((file, i) => (
                      <div key={i} className="flex items-center gap-1 text-xs bg-roman-surface border border-roman-border px-2 py-1 rounded-sm text-roman-text-main">
                        <FileText size={12} />
                        <span className="max-w-[150px] truncate">{file.name}</span>
                        <button onClick={() => setReplyFiles(prev => prev.filter((_, idx) => idx !== i))} className="ml-1 hover:text-red-500" disabled={isClosed}><X size={12} /></button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Footer */}
                <div className="p-3 border-t border-roman-border/50 flex justify-between items-center bg-black/5">
                  <div className="text-xs text-roman-text-sub font-serif italic">
                    {replyMode === 'internal' ? internalActionText : 'Ação: Notificar solicitante por e-mail'}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setReplyText('');
                        setReplyFiles([]);
                        if (replyFileRef.current) replyFileRef.current.value = '';
                      }}
                      className="px-4 py-1.5 text-roman-text-sub hover:bg-black/5 rounded font-medium transition-colors disabled:opacity-50"
                      disabled={isClosed}
                    >
                      Cancelar
                    </button>
                    <div className="flex rounded-sm overflow-hidden shadow-sm">
                      <button
                        onClick={handleSend}
                        className="bg-roman-sidebar hover:bg-stone-900 text-white px-4 py-1.5 font-medium transition-colors tracking-wide flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={isClosed}
                      >
                        <CheckCircle size={16} />
                        {replyMode === 'internal' ? internalButtonText : 'Enviar Mensagem'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Context Panel (Right Sidebar) */}
          <aside id="context-drawer" className={`fixed md:static inset-y-0 right-0 z-40 w-[86vw] max-w-80 md:w-80 bg-roman-surface border-l border-roman-border flex flex-col transition-transform duration-200 ${showMobileContext ? 'translate-x-0' : 'translate-x-full md:translate-x-0'}`}>
            <div className="h-12 border-b border-roman-border flex items-center justify-between px-4 font-serif text-sm tracking-widest uppercase font-semibold text-roman-text-main">
              <span>Dados da OS</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMobileContext(false);
                }}
                className="md:hidden text-roman-text-sub hover:text-roman-text-main"
                aria-label="Fechar painel de dados"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-4 space-y-5 overflow-y-auto">
              <PropertyField label="Status Atual" value={activeTicket.status} highlight />

              {/* PUBLIC LINK BUTTON */}
              <div className="flex gap-2">
                <button
                  onClick={handleCopyLink}
                  className="flex-1 flex items-center justify-center px-3 py-2 bg-roman-bg border border-roman-border rounded-sm hover:border-roman-primary/50 transition-colors group gap-2 text-roman-text-main font-medium text-[13px]"
                  title="Copiar link seguro para o solicitante"
                >
                  <Copy size={14} className="text-roman-text-sub group-hover:text-roman-primary" />
                  Copiar Link
                </button>
                <button
                  onClick={handleOpenTracking}
                  className="px-3 py-2 bg-roman-bg border border-roman-border rounded-sm hover:border-roman-primary/50 transition-colors group text-roman-text-sub hover:text-roman-primary"
                  title="Visualizar como solicitante"
                >
                  <ExternalLink size={14} />
                </button>
              </div>

              <PropertyField label="Tipo de Manutenção" value={activeTicket.type} />
              <PropertyField label="Região" value={activeTicket.region} />
              <PropertyField label="Sede" value={activeTicket.sede} />
              <PropertyField label="Setor" value={activeTicket.sector} />

              <div className="pt-4 border-t border-roman-border">
                <div className="mb-4">
                  <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Responsável (Técnico)</label>
                  <select
                    value={techTeam}
                    onChange={handleTechTeamChange}
                    className="w-full border border-roman-primary/50 rounded-sm px-3 py-2 bg-roman-primary/5 text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={isClosed}
                  >
                    <option value="">Selecione a Equipe...</option>
                    <option value="Construtora">Construtora</option>
                    <option value="Informática">Informática</option>
                    <option value="Infra - Compras">Infra - Compras</option>
                    <option value="Infra - Cordenação">Infra - Cordenação</option>
                    <option value="Infra - Sede">Infra - Sede</option>
                    <option value="JY">JY</option>
                    <option value="Marketing">Marketing</option>
                    <option value="Metalúrgica">Metalúrgica</option>
                    <option value="Não especificado">Não especificado</option>
                    <option value="Redes">Redes</option>
                    <option value="Refrigeração">Refrigeração</option>
                    <option value="Terceirizada">Terceirizada</option>
                  </select>
                </div>

                {techTeam === 'Terceirizada' && (
                  <div className="mb-4 animate-in fade-in slide-in-from-top-2 duration-300">
                    <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">E-mail do Fornecedor</label>
                    <input
                      type="email"
                      value={customEmail}
                      onChange={e => setCustomEmail(e.target.value)}
                      placeholder="fornecedor@email.com"
                      className="w-full border border-roman-primary/50 rounded-sm px-3 py-2 bg-roman-primary/5 text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={isClosed}
                    />
                  </div>
                )}
              </div>

              {/* BUDGETS SECTION */}
              {(activeTicket.status.includes('Orçamento') || activeTicket.status.includes('Cotação')) && (
                <div className="pt-4 border-t border-roman-border">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub font-bold">Gestão de Orçamentos</h4>
                    <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-sm font-medium">Rodada 1</span>
                  </div>
                  <button
                    onClick={() => setShowQuotesModal(true)}
                    className="w-full bg-roman-bg border border-roman-border hover:border-roman-primary text-roman-text-main py-3 rounded-sm font-medium transition-colors text-xs flex items-center justify-center gap-2 group"
                  >
                    <DollarSign size={16} className="text-roman-text-sub group-hover:text-roman-primary" />
                    Gerenciar Cotações ({quotes.filter(q => q.vendor && q.value).length}/3)
                  </button>
                </div>
              )}

              {/* EXECUTION CONTROL — só aparece quando há ações relevantes */}
              {(activeTicket.status === TICKET_STATUS.WAITING_PRELIM_ACTIONS || activeTicket.status === TICKET_STATUS.IN_PROGRESS || activeTicket.status === TICKET_STATUS.WAITING_PAYMENT) && (
                <div className="pt-4 border-t border-roman-border">
                  <h4 className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub font-bold mb-3">Controle de Execução</h4>
                  <div className="space-y-2">
                    {activeTicket.status === TICKET_STATUS.WAITING_PRELIM_ACTIONS && (
                      <button onClick={() => { setPrelimsChecked({}); setShowPrelimModal(true); }} className="w-full bg-roman-bg border border-roman-border hover:border-roman-primary text-roman-text-main py-2 rounded-sm font-medium transition-colors text-xs flex items-center justify-center gap-2">
                        <List size={14} /> Ações Preliminares (Compras)
                      </button>
                    )}

                    {(activeTicket.status === TICKET_STATUS.WAITING_PRELIM_ACTIONS || activeTicket.status === TICKET_STATUS.IN_PROGRESS) && (
                      <button
                        onClick={handleStartExecution}
                        className="w-full bg-roman-bg border border-roman-border hover:border-roman-primary text-roman-text-main py-2 rounded-sm font-medium transition-colors text-xs flex items-center justify-center gap-2"
                      >
                        <Play size={14} /> Iniciar Execução da Obra
                      </button>
                    )}

                    {activeTicket.status === TICKET_STATUS.IN_PROGRESS && (
                      <button
                        onClick={handleSendForValidation}
                        className="w-full bg-roman-sidebar hover:bg-stone-900 text-white py-2 rounded-sm font-medium transition-colors text-xs flex items-center justify-center gap-2"
                      >
                        <CheckSquare size={14} /> Enviar para Validação (Solicitante)
                      </button>
                    )}

                    {activeTicket.status === TICKET_STATUS.WAITING_PAYMENT && (
                      <button
                        onClick={handleCloseTicket}
                        className="w-full bg-green-700 hover:bg-green-800 text-white py-2 rounded-sm font-medium transition-colors text-xs flex items-center justify-center gap-2 mt-4"
                      >
                        <CheckCircle size={14} /> Encerrar OS (Paga)
                      </button>
                    )}
                  </div>
                </div>
              )}

            </div>
          </aside>
        </div>
      </div>

      {/* Quotes Modal */}
      {showQuotesModal && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowQuotesModal(false);
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Gestão de orçamentos"
        >
          <div className="bg-roman-surface border border-roman-border rounded-sm shadow-xl w-full max-w-2xl overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-roman-border bg-roman-bg">
              <h3 className="font-serif text-lg text-roman-text-main font-medium">Gestão de Orçamentos</h3>
              <button onClick={() => setShowQuotesModal(false)} className="text-roman-text-sub hover:text-roman-text-main"><X size={20} /></button>
            </div>
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <p className="text-sm text-roman-text-sub">Preencha os dados dos 3 orçamentos obrigatórios para enviar para aprovação da diretoria.</p>
                <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-sm font-medium">Rodada 1</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                {[0, 1, 2].map(i => (
                  <div key={i} className="border border-roman-border rounded-sm p-4 bg-roman-bg flex flex-col">
                    <div className="flex justify-between items-center mb-4 pb-2 border-b border-roman-border/50">
                      <span className="text-sm font-medium text-roman-text-main">Cotação {i + 1}</span>
                      <label className="text-xs text-roman-primary hover:underline flex items-center gap-1 cursor-pointer">
                        <Paperclip size={12} /> {quoteAttachments[i] ? 'Trocar PDF' : 'Anexar PDF'}
                        <input
                          type="file"
                          accept=".pdf"
                          className="hidden"
                          onChange={(e) => handleQuoteAttachmentChange(i, e.target.files?.[0] ?? null)}
                        />
                      </label>
                    </div>
                    <div className="space-y-3 flex-1">
                      <div>
                        <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1">Fornecedor</label>
                        <input
                          type="text"
                          placeholder="Nome da Empresa"
                          value={quotes[i].vendor}
                          onChange={e => handleQuoteChange(i, 'vendor', e.target.value)}
                          className="w-full text-sm p-2 border border-roman-border rounded-sm bg-roman-surface outline-none focus:border-roman-primary"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1">Valor Total</label>
                        <input
                          type="text"
                          placeholder="R$ 0,00"
                          value={quotes[i].value}
                          onChange={e => handleQuoteChange(i, 'value', e.target.value)}
                          className="w-full text-sm p-2 border border-roman-border rounded-sm bg-roman-surface outline-none focus:border-roman-primary"
                        />
                      </div>
                      {quoteAttachments[i] && (
                        <div className="text-[11px] text-roman-text-sub truncate">
                          PDF: {quoteAttachments[i]!.name}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-roman-border">
                <button onClick={() => setShowQuotesModal(false)} className="px-4 py-2 border border-roman-border text-roman-text-main hover:bg-roman-bg rounded-sm font-medium transition-colors text-sm">
                  Fechar
                </button>
                <button
                  onClick={() => {
                    handleSendToDirector();
                    if (quotes.filter(q => q.vendor.trim() !== '' && q.value.trim() !== '').length >= 3) {
                      setShowQuotesModal(false);
                    }
                  }}
                  disabled={isSending}
                  className="px-6 py-2 bg-roman-sidebar hover:bg-stone-900 text-white rounded-sm font-medium transition-colors text-sm flex items-center gap-2 disabled:opacity-70"
                >
                  {isSending ? <Loader2 size={16} className="animate-spin" /> : <Shield size={16} />}
                  {isSending ? 'Enviando...' : 'Enviar para Diretoria'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Ações Preliminares Modal */}
      {showPrelimModal && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowPrelimModal(false);
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Ações preliminares"
        >
          <div className="bg-roman-surface border border-roman-border rounded-sm shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-roman-border bg-roman-bg">
              <h3 className="font-serif text-lg text-roman-text-main font-medium">Ações Preliminares</h3>
              <button onClick={() => setShowPrelimModal(false)} className="text-roman-text-sub hover:text-roman-text-main"><X size={20} /></button>
            </div>
            <div className="p-6">
              <p className="text-sm text-roman-text-sub mb-4 font-serif italic">Confirme cada item antes de liberar a execução do serviço.</p>
              <div className="space-y-2 mb-6">
                {[
                  { id: 'materiais', label: 'Materiais solicitados ao almoxarifado' },
                  { id: 'equipe', label: 'Disponibilidade da equipe confirmada' },
                  { id: 'cronograma', label: 'Cronograma de execução definido' },
                  { id: 'acesso', label: 'Acesso ao local liberado com o solicitante' },
                ].map(item => (
                  <button
                    key={item.id}
                    onClick={() => setPrelimsChecked(prev => ({ ...prev, [item.id]: !prev[item.id] }))}
                    className={`w-full flex items-center gap-3 p-3 border rounded-sm text-left transition-colors ${
                      prelimChecked[item.id]
                        ? 'border-roman-primary bg-roman-primary/5 text-roman-primary'
                        : 'border-roman-border text-roman-text-main hover:border-roman-primary/50'
                    }`}
                  >
                    <div className={`w-4 h-4 border rounded-sm flex items-center justify-center flex-shrink-0 ${prelimChecked[item.id] ? 'bg-roman-primary border-roman-primary' : 'border-roman-border'}`}>
                      {prelimChecked[item.id] && <CheckSquare size={10} className="text-white" />}
                    </div>
                    <span className="text-sm font-medium">{item.label}</span>
                  </button>
                ))}
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={() => setShowPrelimModal(false)} className="px-4 py-2 border border-roman-border text-roman-text-main hover:bg-roman-bg rounded-sm font-medium transition-colors text-sm">
                  Cancelar
                </button>
                <button
                  disabled={!['materiais', 'equipe', 'cronograma', 'acesso'].every(id => prelimChecked[id])}
                  onClick={() => {
                    const item: HistoryItem = {
                      id: crypto.randomUUID(),
                      type: 'system',
                      sender: 'Rafael (Gestor)',
                      time: new Date(),
                      text: 'Ações preliminares concluídas. Materiais solicitados, equipe escalada e cronograma definido.',
                    };
                    updateTicket(activeTicket.id, {
                      status: TICKET_STATUS.IN_PROGRESS,
                      history: [...activeTicket.history, item],
                    });
                    setShowPrelimModal(false);
                  }}
                  className="px-6 py-2 bg-roman-sidebar hover:bg-stone-900 text-white rounded-sm font-medium transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Concluir e Iniciar Execução
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

