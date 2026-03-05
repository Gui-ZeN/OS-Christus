import React, { useState, useMemo } from 'react';
import { CheckCircle, Loader2, FileText, Image as ImageIcon, Shield, X } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useApp } from '../context/AppContext';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { TICKET_STATUS } from '../constants/ticketStatus';
import type { TicketStatus } from '../types';

const APPROVAL_STATUS: Record<string, TicketStatus> = {
  new_os: TICKET_STATUS.WAITING_TECH_OPINION,
  solutions: TICKET_STATUS.WAITING_BUDGET,
  budgets: TICKET_STATUS.WAITING_CONTRACT_APPROVAL,
  contracts: TICKET_STATUS.WAITING_PRELIM_ACTIONS,
};

const QUOTES_MAP: Record<string, { id: number; vendor: string; value: string; recommended: boolean }[]> = {
  'OS-0046': [
    { id: 1, vendor: 'Decor Interiores', value: 'R$ 12.400,00', recommended: true },
    { id: 2, vendor: 'Ambientes & Cia', value: 'R$ 14.200,00', recommended: false },
    { id: 3, vendor: 'Reforma Fácil LTDA', value: 'R$ 15.800,00', recommended: false },
  ],
};

const CONTRACT_MAP: Record<string, { value: string; vendor: string; viewingBy?: string }> = {
  'OS-0045': { value: 'R$ 8.500,00', vendor: 'PowerTech Geradores', viewingBy: 'Diretor Pedro' },
};

export function ApprovalsView() {
  const { openAttachment, updateTicket, tickets } = useApp();
  const [activeTab, setActiveTab] = useState<'new_os' | 'solutions' | 'budgets' | 'contracts'>('new_os');
  const [processingId, setProcessingId] = useState<string | null>(null);
  
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectTargetId, setRejectTargetId] = useState<string | null>(null);
  
  const [attachContractModalId, setAttachContractModalId] = useState<string | null>(null);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const handleApprove = (id: string, tab: 'new_os' | 'solutions' | 'budgets' | 'contracts') => {
    setProcessingId(id);
    setTimeout(() => {
      setProcessingId(null);
      updateTicket(id, { status: APPROVAL_STATUS[tab] });

      // Z2: Automation - Email to Vendor on Budget Approval
      if (tab === 'budgets') {
        const quotes = QUOTES_MAP[id] ?? [];
        const winner = quotes.find(q => q.recommended)?.vendor || 'Fornecedor Vencedor';
        setToast(`Automação: E-mail de aprovação enviado para ${winner}.`);
        setTimeout(() => setToast(null), 4000);
      }
    }, 1500);
  };

  const openRejectModal = (id: string) => {
    setRejectTargetId(id);
    setRejectModalOpen(true);
  };

  const handleReject = (reason: string) => {
    if (!rejectTargetId) return;
    setProcessingId(rejectTargetId);
    setRejectModalOpen(false);

    setTimeout(() => {
      setProcessingId(null);
      const targetTicket = tickets.find(t => t.id === rejectTargetId);
      const reasonText = reason.trim() || 'Motivo não informado.';
      const historyItem = {
        id: crypto.randomUUID(),
        type: 'system' as const,
        sender: 'Diretoria',
        time: new Date(),
        text: `OS cancelada pela Diretoria. Motivo: ${reasonText}`,
      };
      updateTicket(rejectTargetId, {
        status: TICKET_STATUS.CANCELED,
        history: targetTicket ? [...targetTicket.history, historyItem] : undefined,
      });
      setRejectTargetId(null);
    }, 1500);
  };

  const handleAttachContract = () => {
    if (!attachContractModalId) return;
    setProcessingId(attachContractModalId);
    setAttachContractModalId(null);
    setTimeout(() => {
      setProcessingId(null);
      updateTicket(attachContractModalId, { status: TICKET_STATUS.WAITING_PRELIM_ACTIONS });
      setAttachedFile(null);
    }, 1500);
  };

  const newOSList = useMemo(() =>
    tickets
      .filter(t => t.status === TICKET_STATUS.NEW)
      .map(t => ({
        id: t.id,
        subject: t.subject,
        requester: t.requester,
        date: t.time,
        description: t.history.find(h => h.type === 'customer')?.text ?? 'Sem descrição.',
      })),
  [tickets]);

  const solutions = useMemo(() =>
    tickets
      .filter(t => t.status === TICKET_STATUS.WAITING_SOLUTION_APPROVAL)
      .map(t => ({
        id: t.id,
        subject: t.subject,
        requester: t.requester,
        date: t.time,
        technicalOpinion: [...t.history].reverse().find(h => h.type === 'tech')?.text ?? 'Parecer não disponível.',
      })),
  [tickets]);

  const budgets = useMemo(() =>
    tickets
      .filter(t => t.status === TICKET_STATUS.WAITING_BUDGET_APPROVAL)
      .map(t => ({
        id: t.id,
        subject: t.subject,
        requester: t.requester,
        date: t.time,
        viewingBy: t.viewingBy?.name ?? null,
        quotes: QUOTES_MAP[t.id] ?? [],
      })),
  [tickets]);

  const contracts = useMemo(() =>
    tickets
      .filter(t => t.status === TICKET_STATUS.WAITING_CONTRACT_APPROVAL)
      .map(t => ({
        id: t.id,
        subject: t.subject,
        requester: t.requester,
        date: t.time,
        value: CONTRACT_MAP[t.id]?.value ?? 'A confirmar',
        vendor: CONTRACT_MAP[t.id]?.vendor ?? 'A confirmar',
        viewingBy: CONTRACT_MAP[t.id]?.viewingBy ?? t.viewingBy?.name ?? null,
      })),
  [tickets]);

  return (
    <div className="flex-1 overflow-y-auto bg-roman-bg p-8 relative">
      {/* Toast Notification */}
      {toast && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 px-6 py-3 rounded-sm shadow-lg flex items-center gap-3 z-[100] animate-in slide-in-from-top-4 fade-in bg-green-800 text-white">
          <CheckCircle size={18} />
          <span className="font-medium text-sm">{toast}</span>
        </div>
      )}
      <div className="max-w-5xl mx-auto">
        <header className="mb-8 border-b border-roman-border pb-4 flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-serif font-medium text-roman-text-main mb-2">Painel da Diretoria</h1>
            <p className="text-roman-text-sub font-serif italic">Aprovações rápidas de orçamentos e assinaturas de contratos.</p>
          </div>
          <div className="flex bg-roman-surface border border-roman-border rounded-sm p-1 shadow-sm overflow-x-auto hide-scrollbar">
            <button 
              onClick={() => setActiveTab('new_os')}
              className={`px-4 py-2 text-sm font-medium rounded-sm transition-colors whitespace-nowrap ${activeTab === 'new_os' ? 'bg-roman-primary/10 text-roman-primary' : 'text-roman-text-sub hover:text-roman-text-main'}`}
            >
              Novas OS ({newOSList.length})
            </button>
            <button 
              onClick={() => setActiveTab('solutions')}
              className={`px-4 py-2 text-sm font-medium rounded-sm transition-colors whitespace-nowrap ${activeTab === 'solutions' ? 'bg-roman-primary/10 text-roman-primary' : 'text-roman-text-sub hover:text-roman-text-main'}`}
            >
              Soluções ({solutions.length})
            </button>
            <button 
              onClick={() => setActiveTab('budgets')}
              className={`px-4 py-2 text-sm font-medium rounded-sm transition-colors whitespace-nowrap ${activeTab === 'budgets' ? 'bg-roman-primary/10 text-roman-primary' : 'text-roman-text-sub hover:text-roman-text-main'}`}
            >
              Orçamentos ({budgets.length})
            </button>
            <button 
              onClick={() => setActiveTab('contracts')}
              className={`px-4 py-2 text-sm font-medium rounded-sm transition-colors whitespace-nowrap ${activeTab === 'contracts' ? 'bg-roman-primary/10 text-roman-primary' : 'text-roman-text-sub hover:text-roman-text-main'}`}
            >
              Contratos ({contracts.length})
            </button>
          </div>
        </header>

        <div className="space-y-6">
          {activeTab === 'new_os' && newOSList.map((os) => {
            return (
              <div key={os.id} className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm hover:border-roman-primary/30 transition-colors relative overflow-hidden">
                {processingId === os.id && (
                  <div className="absolute inset-0 bg-roman-surface/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center rounded-sm">
                    <Loader2 size={32} className="text-roman-primary animate-spin mb-4" />
                    <span className="font-serif text-roman-text-main font-medium">Processando decisão...</span>
                  </div>
                )}
                <div className="flex items-center justify-between mb-4 border-b border-roman-border pb-4">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <span className="text-roman-primary font-serif italic text-sm">{os.id}</span>
                      <span className="text-xs text-roman-text-sub font-medium px-2 py-0.5 bg-roman-bg border border-roman-border rounded-sm">Aguardando Triagem (Diretoria)</span>
                    </div>
                    <h3 className="text-xl font-serif text-roman-text-main">{os.subject}</h3>
                    <p className="text-sm text-roman-text-sub">Solicitante: {os.requester} • Enviado: {formatDistanceToNow(os.date, { addSuffix: true, locale: ptBR })}</p>
                  </div>
                </div>
                <div className="bg-roman-bg border border-roman-border rounded-sm p-4 mb-6">
                  <h4 className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-2 font-bold flex items-center gap-2"><FileText size={14}/> Descrição do Problema</h4>
                  <p className="text-sm text-roman-text-main leading-relaxed">{os.description}</p>
                  <button onClick={() => openAttachment(`Fotos: ${os.subject}`, 'image')} className="mt-3 flex items-center gap-2 text-roman-primary hover:underline text-xs font-medium">
                    <ImageIcon size={14} /> Ver Fotos Anexadas
                  </button>
                </div>
                <div className="flex justify-end gap-3">
                  <button onClick={() => openRejectModal(os.id)} className="px-6 py-2 border border-red-200 text-red-700 hover:bg-red-50 rounded-sm font-medium transition-colors text-sm">
                    Reprovar (Cancelar OS)
                  </button>
                  <button onClick={() => handleApprove(os.id, 'new_os')} className="px-6 py-2 bg-roman-sidebar hover:bg-stone-900 text-white rounded-sm font-medium transition-colors text-sm flex items-center gap-2">
                    <CheckCircle size={16} /> Aprovar (Enviar para Rafael)
                  </button>
                </div>
              </div>
            );
          })}

          {activeTab === 'solutions' && solutions.map((s) => {
            return (
              <div key={s.id} className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm hover:border-roman-primary/30 transition-colors relative overflow-hidden">
                {processingId === s.id && (
                  <div className="absolute inset-0 bg-roman-surface/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center rounded-sm">
                    <Loader2 size={32} className="text-roman-primary animate-spin mb-4" />
                    <span className="font-serif text-roman-text-main font-medium">Processando decisão...</span>
                  </div>
                )}
                <div className="flex items-center justify-between mb-4 border-b border-roman-border pb-4">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <span className="text-roman-primary font-serif italic text-sm">{s.id}</span>
                      <span className="text-xs text-roman-text-sub font-medium px-2 py-0.5 bg-roman-bg border border-roman-border rounded-sm">Aguardando Aprovação da Solução</span>
                    </div>
                    <h3 className="text-xl font-serif text-roman-text-main">{s.subject}</h3>
                    <p className="text-sm text-roman-text-sub">Solicitante: {s.requester} • Parecer emitido: {formatDistanceToNow(s.date, { addSuffix: true, locale: ptBR })}</p>
                  </div>
                </div>
                <div className="bg-roman-bg border border-roman-border rounded-sm p-4 mb-6">
                  <h4 className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-2 font-bold flex items-center gap-2"><FileText size={14}/> Parecer Técnico</h4>
                  <p className="text-sm text-roman-text-main leading-relaxed">{s.technicalOpinion}</p>
                </div>
                <div className="flex justify-end gap-3">
                  <button onClick={() => openRejectModal(s.id)} className="px-6 py-2 border border-red-200 text-red-700 hover:bg-red-50 rounded-sm font-medium transition-colors text-sm">
                    Reprovar Solução (Arquivar)
                  </button>
                  <button onClick={() => handleApprove(s.id, 'solutions')} className="px-6 py-2 bg-roman-sidebar hover:bg-stone-900 text-white rounded-sm font-medium transition-colors text-sm flex items-center gap-2">
                    <CheckCircle size={16} /> Aprovar (Ir para Cotação)
                  </button>
                </div>
              </div>
            );
          })}

          {activeTab === 'budgets' && budgets.map((b) => {
            return (
            <div key={b.id} className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm hover:border-roman-primary/30 transition-colors relative overflow-hidden">
              {processingId === b.id && (
                <div className="absolute inset-0 bg-roman-surface/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center rounded-sm">
                  <Loader2 size={32} className="text-roman-primary animate-spin mb-4" />
                  <span className="font-serif text-roman-text-main font-medium">Processando decisão...</span>
                </div>
              )}
              <div className="flex items-center justify-between mb-4 border-b border-roman-border pb-4">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <span className="text-roman-primary font-serif italic text-sm">{b.id}</span>
                    <span className="text-xs text-roman-text-sub font-medium px-2 py-0.5 bg-roman-bg border border-roman-border rounded-sm">Aguardando Aprovação</span>
                    {b.viewingBy && (
                      <span className="text-xs font-medium px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-sm flex items-center gap-1.5 shadow-sm">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                        Em análise por {b.viewingBy}
                      </span>
                    )}
                  </div>
                  <h3 className="text-xl font-serif text-roman-text-main">{b.subject}</h3>
                  <p className="text-sm text-roman-text-sub">Solicitante: {b.requester} • Enviado: {formatDistanceToNow(b.date, { addSuffix: true, locale: ptBR })}</p>
                </div>
                <button onClick={() => openRejectModal(b.id)} className="px-4 py-2 border border-red-200 text-red-700 hover:bg-red-50 rounded-sm font-medium transition-colors text-sm flex items-center gap-2">
                  Reprovar Todas (Nova Cotação)
                </button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {b.quotes.map((q) => (
                  <div key={q.id} className={`border rounded-sm p-4 flex flex-col ${q.recommended ? 'border-roman-primary bg-roman-primary/5' : 'border-roman-border bg-roman-bg'}`}>
                    {q.recommended && <div className="text-[10px] font-serif uppercase tracking-widest text-roman-primary mb-2 font-bold flex items-center gap-1"><CheckCircle size={12}/> Recomendado pelo Gestor</div>}
                    <div className="text-sm text-roman-text-sub mb-1">{q.vendor}</div>
                    <div className="text-2xl font-serif text-roman-text-main mb-4">{q.value}</div>
                    
                    <div className="mt-auto flex flex-col gap-2">
                      <button onClick={() => openAttachment(`Orçamento: ${q.vendor}`, 'pdf')} className="flex items-center justify-center gap-2 text-roman-text-sub hover:text-roman-text-main text-xs font-medium border border-roman-border bg-roman-surface py-1.5 rounded-sm transition-colors">
                        <FileText size={14} /> Ver PDF
                      </button>
                      <button onClick={() => handleApprove(b.id, 'budgets')} className="w-full py-2 bg-roman-sidebar hover:bg-stone-900 text-white rounded-sm font-medium transition-colors text-sm">
                        Aprovar Esta Opção
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )})}

          {activeTab === 'contracts' && contracts.map((c) => {
            return (
            <div key={c.id} className="bg-roman-parchment border border-roman-parchment-border rounded-sm p-6 flex flex-col md:flex-row gap-6 items-start md:items-center shadow-sm relative overflow-hidden">
              {processingId === c.id && (
                <div className="absolute inset-0 bg-roman-parchment/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center rounded-sm">
                  <Loader2 size={32} className="text-roman-primary animate-spin mb-4" />
                  <span className="font-serif text-roman-text-main font-medium">Processando assinatura...</span>
                </div>
              )}
              {c.viewingBy && (
                <div className="absolute top-0 left-0 w-1 h-full bg-amber-400"></div>
              )}
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-stone-800 font-serif italic text-sm">{c.id}</span>
                  <span className="text-xs text-stone-600 font-medium px-2 py-0.5 bg-white/50 border border-stone-300 rounded-sm">Aguardando Assinatura</span>
                  {c.viewingBy && (
                    <span className="text-xs font-medium px-2 py-0.5 bg-amber-100 text-amber-800 border border-amber-300 rounded-sm flex items-center gap-1.5 shadow-sm">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                      Sendo revisado por {c.viewingBy}
                    </span>
                  )}
                  <span className="text-xs text-stone-500 ml-auto">{formatDistanceToNow(c.date, { addSuffix: true, locale: ptBR })}</span>
                </div>
                <h3 className="text-xl font-serif text-stone-900 mb-1">{c.subject}</h3>
                <p className="text-sm text-stone-600 mb-4">Solicitante: {c.requester} • Contratada: {c.vendor}</p>
                
                <button onClick={() => openAttachment(`Minuta: ${c.vendor}`, 'pdf')} className="flex items-center gap-2 text-stone-800 hover:underline text-sm font-medium">
                  <FileText size={16} /> Ler Minuta do Contrato (PDF)
                </button>
              </div>
              
              <div className="w-full md:w-auto flex flex-col items-end gap-4 border-t md:border-t-0 md:border-l border-stone-300 pt-4 md:pt-0 md:pl-6">
                <div className="text-right">
                  <div className="text-[10px] font-serif uppercase tracking-widest text-stone-500 mb-1">Valor do Contrato</div>
                  <div className="text-2xl font-serif text-stone-900">{c.value}</div>
                </div>
                <div className="flex gap-2 w-full md:w-auto">
                  <button onClick={() => openAttachment(`Minuta: ${c.vendor}`, 'pdf')} className="flex-1 md:flex-none px-4 py-2 border border-stone-300 text-stone-700 hover:bg-white/50 rounded-sm font-medium transition-colors text-sm">
                    Revisar
                  </button>
                  <button onClick={() => setAttachContractModalId(c.id)} className="flex-1 md:flex-none px-6 py-2 bg-roman-primary hover:bg-roman-primary-hover text-white rounded-sm font-medium transition-colors text-sm flex items-center justify-center gap-2">
                    <Shield size={16} /> Assinar Contrato
                  </button>
                </div>
              </div>
            </div>
          )})}

          {activeTab === 'contracts' && contracts.length === 0 && (
            <div className="text-center py-12 border border-dashed border-roman-border rounded-sm">
              <Shield size={32} className="mx-auto text-roman-border mb-4" />
              <p className="text-roman-text-sub font-serif italic">Nenhum contrato pendente de assinatura no momento.</p>
            </div>
          )}
        </div>
      </div>

      {/* Reject Modal */}
      <ConfirmModal
        isOpen={rejectModalOpen}
        onClose={() => setRejectModalOpen(false)}
        onConfirm={handleReject}
        title="Reprovar Solicitação"
        description="Por favor, informe o motivo da reprovação para que o gestor possa buscar novas opções adequadas."
        confirmText="Confirmar Reprovação"
        isDestructive={true}
        requireReason={true}
      />

      {/* Attach Contract Modal */}
      {attachContractModalId && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-roman-surface border border-roman-border rounded-sm shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-roman-border bg-roman-bg">
              <h3 className="font-serif text-lg text-roman-text-main font-medium">Anexar Contrato Assinado</h3>
              <button onClick={() => setAttachContractModalId(null)} className="text-roman-text-sub hover:text-roman-text-main"><X size={20} /></button>
            </div>
            <div className="p-6">
              <p className="text-sm text-roman-text-sub mb-4">Faça o upload do contrato devidamente assinado para prosseguir com a OS.</p>
              
              <div className="border-2 border-dashed border-roman-border rounded-sm p-8 text-center bg-roman-bg mb-6 relative hover:bg-roman-border-light transition-colors cursor-pointer">
                <input 
                  type="file" 
                  accept=".pdf" 
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      setAttachedFile(e.target.files[0]);
                    }
                  }}
                />
                <FileText size={32} className="mx-auto text-roman-primary mb-3" />
                {attachedFile ? (
                  <div className="text-roman-text-main font-medium text-sm">{attachedFile.name}</div>
                ) : (
                  <>
                    <div className="text-roman-text-main font-medium text-sm mb-1">Clique para selecionar ou arraste o arquivo</div>
                    <div className="text-xs text-roman-text-sub">Apenas arquivos PDF</div>
                  </>
                )}
              </div>

              <div className="flex justify-end gap-3">
                <button onClick={() => setAttachContractModalId(null)} className="px-4 py-2 border border-roman-border text-roman-text-main hover:bg-roman-bg rounded-sm font-medium transition-colors text-sm">
                  Cancelar
                </button>
                <button 
                  onClick={handleAttachContract}
                  disabled={!attachedFile}
                  className="px-6 py-2 bg-roman-primary hover:bg-roman-primary-hover text-white rounded-sm font-medium transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Confirmar e Enviar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
