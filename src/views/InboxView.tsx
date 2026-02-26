import React, { useState, useRef, useEffect } from 'react';
import { CheckCircle, Loader2, FileText, Shield, List, Play, CheckSquare, MessageSquare, Send, Paperclip, Search, Filter, Clock, AlertCircle, Building, Wrench, User, Calendar, Tag, Image as ImageIcon, ChevronDown, Plus, MoreHorizontal, Lock, Bold, Italic, ExternalLink, Copy, X, DollarSign } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { MOCK_TICKETS } from '../data/mockTickets';
import { TicketListItem } from '../components/ui/TicketListItem';
import { PropertyField } from '../components/ui/PropertyField';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useApp } from '../context/AppContext';
import { InboxFilter } from '../types';

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
    setTrackingTicketId, 
    activeTicketId, 
    setActiveTicketId,
    inboxFilter,
    setInboxFilter
  } = useApp();

  const [replyMode, setReplyMode] = useState<'public' | 'internal'>('internal');
  const [techTeam, setTechTeam] = useState('');
  const [customEmail, setCustomEmail] = useState('');
  
  // Z5: Simulate History State (Local to component for demo)
  const [localHistory, setLocalHistory] = useState<any[]>([]);

  useEffect(() => {
    // Reset local history when active ticket changes
    setLocalHistory([]);
    // Initialize tech team from ticket if available (mock logic)
    setTechTeam(''); 
  }, [activeTicketId]);

  const handleTechTeamChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newValue = e.target.value;
    const oldValue = techTeam || 'Não atribuído';
    setTechTeam(newValue);

    // Z5: Log field change
    const newHistoryItem = {
      id: Math.random().toString(36).substr(2, 9),
      type: 'field_change',
      sender: 'Rafael (Gestor)',
      time: new Date(),
      field: 'Equipe Técnica',
      from: oldValue,
      to: newValue
    };
    setLocalHistory(prev => [newHistoryItem, ...prev]);
  };

  const [isSending, setIsSending] = useState(false);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [showQuotesModal, setShowQuotesModal] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const replyFileRef = useRef<HTMLInputElement>(null);
  const [replyFiles, setReplyFiles] = useState<File[]>([]);
  
  const [quotes, setQuotes] = useState([
    { vendor: '', value: '' },
    { vendor: '', value: '' },
    { vendor: '', value: '' }
  ]);

  const filteredTickets = MOCK_TICKETS.filter(t => {
    if (inboxFilter.status.length > 0 && !inboxFilter.status.includes(t.status)) return false;
    if (inboxFilter.priority.length > 0 && t.priority && !inboxFilter.priority.includes(t.priority)) return false;
    if (inboxFilter.region.length > 0 && !inboxFilter.region.includes(t.region)) return false;
    if (inboxFilter.type.length > 0 && !inboxFilter.type.includes(t.type)) return false;
    return true;
  }).sort((a, b) => {
    // Z2: OS Corretiva + Urgente sobe ao topo
    const isAUrgentCorrective = a.type === 'Corretiva' && a.priority === 'Urgente';
    const isBUrgentCorrective = b.type === 'Corretiva' && b.priority === 'Urgente';
    
    if (isAUrgentCorrective && !isBUrgentCorrective) return -1;
    if (!isAUrgentCorrective && isBUrgentCorrective) return 1;
    
    return b.time.getTime() - a.time.getTime();
  });

  const activeTicket = MOCK_TICKETS.find(t => t.id === activeTicketId) || MOCK_TICKETS[0];
  const isClosed = activeTicket.status === 'Encerrada';

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (filterMenuRef.current && !filterMenuRef.current.contains(event.target as Node)) {
        setShowFilterMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleReplyFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setReplyFiles(Array.from(e.target.files));
    }
  };

  let internalTabLabel = "Nota Interna";
  let internalPlaceholder = "Adicione uma nota interna...";
  let internalButtonText = "Salvar Nota";
  let internalActionText = "Ação: Registrar nota no histórico";

  if (activeTicket.status === 'Nova OS' || activeTicket.status.includes('Aprovada na Triagem')) {
    internalTabLabel = "Solicitar Parecer Técnico";
    internalPlaceholder = "Descreva a solicitação para a equipe técnica...";
    internalButtonText = "Avançar: Aguardando Parecer";
    internalActionText = `Ação: Disparar e-mail para ${techTeam === 'Terceirizada' && customEmail ? customEmail : (techTeam || 'Equipe Técnica')}`;
  } else if (activeTicket.status.includes('Cotação')) {
    internalTabLabel = "Anotação de Cotação";
    internalPlaceholder = "Registre detalhes das negociações com fornecedores...";
    internalButtonText = "Salvar Anotação";
    internalActionText = "Ação: Registrar no histórico interno";
  } else if (activeTicket.status.includes('Validação') || activeTicket.status.includes('Execução')) {
    internalTabLabel = "Diário de Obra";
    internalPlaceholder = "Registre o andamento da execução...";
    internalButtonText = "Salvar Registro";
    internalActionText = "Ação: Registrar no histórico interno";
  }

  const handleQuoteChange = (index: number, field: 'vendor' | 'value', value: string) => {
    const newQuotes = [...quotes];
    newQuotes[index][field] = value;
    setQuotes(newQuotes);
  };

  const handleSendToDirector = () => {
    const filledQuotes = quotes.filter(q => q.vendor.trim() !== '' && q.value.trim() !== '');
    
    if (filledQuotes.length < 3) {
      setToast('Erro: Preencha os 3 orçamentos antes de enviar.');
      setTimeout(() => setToast(null), 3000);
      return;
    }

    setIsSending(true);
    setTimeout(() => {
      setIsSending(false);
      setToast('Orçamentos enviados para a Diretoria com sucesso!');
      setTimeout(() => setToast(null), 3000);
    }, 1500);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/tracking/${activeTicket.id}`);
    setToast('Link copiado para a área de transferência!');
    setTimeout(() => setToast(null), 3000);
  };

  const handleOpenTracking = () => {
    setTrackingTicketId(activeTicket.id);
    navigateTo('tracking');
  };

  // Z7: active chips (all filter dimensions except empty)
  const activeChips: { dim: keyof typeof inboxFilter; value: string }[] = (
    ['status', 'priority', 'region', 'type'] as (keyof typeof inboxFilter)[]
  ).flatMap(dim => inboxFilter[dim].map(value => ({ dim, value })));

  const removeChip = (dim: keyof typeof inboxFilter, value: string) => {
    setInboxFilter({ ...inboxFilter, [dim]: inboxFilter[dim].filter(v => v !== value) });
  };

  return (
    <div className="flex-1 flex overflow-hidden relative">
      {/* Toast Notification */}
      {toast && (
        <div className={`absolute top-6 left-1/2 -translate-x-1/2 px-6 py-3 rounded-sm shadow-lg flex items-center gap-3 z-[100] animate-in slide-in-from-top-4 fade-in ${toast.includes('Erro') ? 'bg-red-800 text-white' : 'bg-green-800 text-white'}`}>
          {toast.includes('Erro') ? <AlertCircle size={18} /> : <CheckCircle size={18} />}
          <span className="font-medium text-sm">{toast}</span>
        </div>
      )}

      {/* Ticket List Pane (Views) */}
      <div className="w-80 bg-roman-surface border-r border-roman-border flex flex-col z-10 shadow-[1px_0_5px_rgba(0,0,0,0.02)]">
        {/* View Header */}
        <div className="h-14 border-b border-roman-border flex items-center justify-between px-4 hover:bg-roman-bg cursor-pointer">
          <div className="flex items-center gap-2">
            <h2 className="font-serif text-[16px] font-semibold tracking-wide">Minhas Filas (Rafael)</h2>
            <ChevronDown size={16} className="text-roman-text-sub" />
          </div>
          <span className="text-roman-text-sub font-serif italic text-sm">14</span>
        </div>
        
        {/* Toolbar */}
        <div className="p-2 border-b border-roman-border flex gap-2 bg-roman-bg/50 overflow-x-auto [&::-webkit-scrollbar]:hidden">
          <button onClick={() => setInboxFilter({ ...inboxFilter, status: ['Nova OS'] })} className={`border rounded px-3 py-1.5 text-center transition-colors font-medium whitespace-nowrap ${inboxFilter.status.includes('Nova OS') && inboxFilter.status.length === 1 ? 'border-roman-primary/50 bg-roman-primary/10 text-roman-primary' : 'border-roman-border hover:bg-roman-border-light text-roman-text-sub'}`}>
            Novas OS ({MOCK_TICKETS.filter(t => t.status === 'Nova OS').length})
          </button>
          <button onClick={() => setInboxFilter({ ...inboxFilter, status: ['Aguardando Orçamento'] })} className={`border rounded px-3 py-1.5 text-center transition-colors font-medium whitespace-nowrap ${inboxFilter.status.includes('Aguardando Orçamento') && inboxFilter.status.length === 1 ? 'border-roman-primary/50 bg-roman-primary/10 text-roman-primary' : 'border-roman-border hover:bg-roman-border-light text-roman-text-sub'}`}>
            Aguard. Orçamento ({MOCK_TICKETS.filter(t => t.status === 'Aguardando Orçamento').length})
          </button>
          <button onClick={() => setInboxFilter({ ...inboxFilter, status: ['Em andamento'] })} className={`border rounded px-3 py-1.5 text-center transition-colors font-medium whitespace-nowrap ${inboxFilter.status.includes('Em andamento') && inboxFilter.status.length === 1 ? 'border-roman-primary/50 bg-roman-primary/10 text-roman-primary' : 'border-roman-border hover:bg-roman-border-light text-roman-text-sub'}`}>
            Em Execução ({MOCK_TICKETS.filter(t => t.status === 'Em andamento').length})
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
                onClick={() => setActiveTicketId(ticket.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* Main Ticket Workspace */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Navigation / Tabs */}
        <header className="h-12 bg-roman-surface border-b border-roman-border flex items-center px-2">
          <div className="flex h-full">
            <div className="h-full px-4 border-r border-roman-border flex items-center gap-2 bg-roman-bg border-t-2 border-t-roman-primary font-medium">
              <span className="w-2 h-2 rounded-full bg-roman-primary"></span>
              <span className="font-serif italic text-roman-text-sub mr-1">#{activeTicket.id}</span> {activeTicket.subject.substring(0, 20)}...
            </div>
            <div className="h-full px-4 border-r border-roman-border flex items-center gap-2 hover:bg-roman-bg cursor-pointer text-roman-text-sub">
              <Plus size={16} />
              <span className="font-serif">Nova OS</span>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-3 px-4 relative">
            <div className="flex items-center gap-2 mr-4 text-xs text-roman-text-sub">
              <User size={14} />
              <span>Visualizando como: <strong>Rafael (Gestor)</strong></span>
            </div>
            <button
              onClick={() => setShowFilterMenu(!showFilterMenu)}
              className={`transition-colors ${showFilterMenu || Object.values(inboxFilter).some(arr => (arr as string[]).length > 0) ? 'text-roman-primary' : 'text-roman-text-sub hover:text-roman-text-main'}`}
              title="Filtros compostos"
              aria-label="Filtros compostos"
            >
              <Filter size={18} />
            </button>
            {showFilterMenu && (
              <div ref={filterMenuRef} className="absolute top-8 right-10 w-72 bg-roman-surface border border-roman-border shadow-xl rounded-sm z-20 max-h-[500px] overflow-y-auto">
                {/* Header */}
                <div className="px-4 py-3 border-b border-roman-border flex justify-between items-center bg-roman-bg sticky top-0">
                  <span className="text-xs font-serif font-semibold text-roman-text-main">Filtros Compostos</span>
                  <button
                    onClick={() => setInboxFilter({ status: [], priority: [], region: [], type: [] })}
                    className="text-[11px] text-roman-primary hover:underline font-medium"
                  >
                    Limpar todos
                  </button>
                </div>

                {/* Status */}
                {renderFilterSection('Status', 'status', [
                  'Nova OS', 'Aguardando Parecer Técnico', 'Aguardando Aprovação da Solução',
                  'Aguardando Orçamento', 'Aguardando Aprovação do Orçamento',
                  'Aguardando aprovação do contrato', 'Aguardando Ações Preliminares',
                  'Em andamento', 'Aguardando aprovação da manutenção', 'Aguardando pagamento', 'Encerrada'
                ], inboxFilter, setInboxFilter)}

                {/* Priority */}
                {renderFilterSection('Prioridade', 'priority', ['Urgente', 'Alta', 'Normal', 'Trivial'], inboxFilter, setInboxFilter)}

                {/* Region */}
                {renderFilterSection('Região', 'region', [
                  'Dionísio Torres', 'Aldeota', 'Parquelândia', 'Sul', 'Benfica', 'Universidade'
                ], inboxFilter, setInboxFilter)}

                {/* Type */}
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
                <button className="text-roman-text-sub hover:text-roman-text-main"><MoreHorizontal size={20} /></button>
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

            {/* Messages */}
            <div className="p-6 space-y-6 flex-1">
              {[...activeTicket.history, ...localHistory].sort((a, b) => b.time.getTime() - a.time.getTime()).map((item, index) => {
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

            {/* Reply Box (Ação do Rafael) */}
            <div className="p-6 pt-0 mt-auto">
              <div className={`border rounded-sm overflow-hidden shadow-sm transition-colors ${replyMode === 'internal' ? 'border-roman-parchment-border bg-roman-parchment' : 'border-roman-border bg-roman-surface'}`}>
                {/* Reply Tabs */}
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
                  <button className="p-1 hover:bg-black/5 rounded" disabled={isClosed}><Bold size={16} /></button>
                  <button className="p-1 hover:bg-black/5 rounded" disabled={isClosed}><Italic size={16} /></button>
                  <button className="p-1 hover:bg-black/5 rounded" disabled={isClosed}><List size={16} /></button>
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
                  className="w-full h-24 p-4 outline-none resize-none bg-transparent font-sans disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder={isClosed ? "Esta OS está encerrada e não aceita novos comentários." : (replyMode === 'internal' ? internalPlaceholder : "Mensagem para o solicitante...")}
                  disabled={isClosed}
                ></textarea>

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

                {/* Footer Actions */}
                <div className="p-3 border-t border-roman-border/50 flex justify-between items-center bg-black/5">
                  <div className="text-xs text-roman-text-sub font-serif italic">
                    {replyMode === 'internal' ? internalActionText : "Ação: Notificar solicitante por e-mail"}
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => {
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
                        className="bg-roman-sidebar hover:bg-stone-900 text-white px-4 py-1.5 font-medium transition-colors tracking-wide flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={isClosed}
                      >
                        <CheckCircle size={16} />
                        {replyMode === 'internal' ? internalButtonText : "Enviar Mensagem"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* Context Panel (Right Sidebar) */}
          <aside className="w-80 bg-roman-surface border-l border-roman-border flex flex-col">
            <div className="h-12 border-b border-roman-border flex items-center px-4 font-serif text-sm tracking-widest uppercase font-semibold text-roman-text-main">
              Dados da OS
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
                      onChange={(e) => setCustomEmail(e.target.value)}
                      placeholder="fornecedor@email.com" 
                      className="w-full border border-roman-primary/50 rounded-sm px-3 py-2 bg-roman-primary/5 text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary disabled:opacity-50 disabled:cursor-not-allowed" 
                      disabled={isClosed}
                    />
                  </div>
                )}
              </div>

              {/* BUDGETS SECTION (3 QUOTES) */}
              {activeTicket.status.includes('Cotação') && (
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

              {/* EXECUTION CONTROL */}
              <div className="pt-4 border-t border-roman-border">
                <h4 className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub font-bold mb-3">Controle de Execução</h4>
                <div className="space-y-2">
                  {activeTicket.status.includes('Aguardando Ações Preliminares') && (
                    <button className="w-full bg-roman-bg border border-roman-border hover:border-roman-primary text-roman-text-main py-2 rounded-sm font-medium transition-colors text-xs flex items-center justify-center gap-2">
                      <List size={14} /> Ações Preliminares (Compras)
                    </button>
                  )}
                  
                  {(activeTicket.status.includes('Aguardando Ações Preliminares') || activeTicket.status.includes('Em andamento')) && (
                    <button className="w-full bg-roman-bg border border-roman-border hover:border-roman-primary text-roman-text-main py-2 rounded-sm font-medium transition-colors text-xs flex items-center justify-center gap-2">
                      <Play size={14} /> Iniciar Execução da Obra
                    </button>
                  )}

                  {activeTicket.status.includes('Em andamento') && (
                     <button className="w-full bg-roman-sidebar hover:bg-stone-900 text-white py-2 rounded-sm font-medium transition-colors text-xs flex items-center justify-center gap-2">
                      <CheckSquare size={14} /> Enviar para Validação (Solicitante)
                    </button>
                  )}
                 
                  {activeTicket.status.includes('pagamento') && (
                    <button className="w-full bg-green-700 hover:bg-green-800 text-white py-2 rounded-sm font-medium transition-colors text-xs flex items-center justify-center gap-2 mt-4">
                      <CheckCircle size={14} /> Encerrar OS (Paga)
                    </button>
                  )}
                </div>
              </div>

            </div>
          </aside>

        </div>
      </div>
      {/* Quotes Modal */}
      {showQuotesModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
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
                {[0, 1, 2].map((i) => (
                  <div key={i} className="border border-roman-border rounded-sm p-4 bg-roman-bg flex flex-col">
                    <div className="flex justify-between items-center mb-4 pb-2 border-b border-roman-border/50">
                      <span className="text-sm font-medium text-roman-text-main">Cotação {i + 1}</span>
                      <button className="text-xs text-roman-primary hover:underline flex items-center gap-1">
                        <Paperclip size={12} /> Anexar PDF
                      </button>
                    </div>
                    <div className="space-y-3 flex-1">
                      <div>
                        <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1">Fornecedor</label>
                        <input 
                          type="text" 
                          placeholder="Nome da Empresa" 
                          value={quotes[i].vendor}
                          onChange={(e) => handleQuoteChange(i, 'vendor', e.target.value)}
                          className="w-full text-sm p-2 border border-roman-border rounded-sm bg-roman-surface outline-none focus:border-roman-primary" 
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1">Valor Total</label>
                        <input 
                          type="text" 
                          placeholder="R$ 0,00" 
                          value={quotes[i].value}
                          onChange={(e) => handleQuoteChange(i, 'value', e.target.value)}
                          className="w-full text-sm p-2 border border-roman-border rounded-sm bg-roman-surface outline-none focus:border-roman-primary" 
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-roman-border">
                <button onClick={() => setShowQuotesModal(false)} className="px-4 py-2 border border-roman-border text-roman-text-main hover:bg-roman-bg rounded-sm font-medium transition-colors text-sm">
                  Salvar Rascunho
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
    </div>
  );
}
