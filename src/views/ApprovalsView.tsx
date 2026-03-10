import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle, Download, FileText, Image as ImageIcon, Loader2, Shield, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { EmptyState } from '../components/ui/EmptyState';
import { TICKET_STATUS } from '../constants/ticketStatus';
import type { ContractRecord, Quote, TicketStatus } from '../types';
import { fetchProcurementData, saveContract, saveQuotes } from '../services/procurementApi';
import { buildBudgetHistorySummary, formatBudgetHistoryValue } from '../utils/budgetHistory';
import { buildProcurementClassification } from '../utils/procurementClassification';
import { formatDateTimeSafe } from '../utils/date';

const APPROVAL_STATUS: Record<'solutions' | 'budgets' | 'contracts', TicketStatus> = {
  solutions: TICKET_STATUS.WAITING_BUDGET,
  budgets: TICKET_STATUS.WAITING_CONTRACT_APPROVAL,
  contracts: TICKET_STATUS.WAITING_PRELIM_ACTIONS,
};
const REVIEW_LOCK_WINDOW_MS = 20 * 60 * 1000;

function normalizeCsvCell(value: unknown) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function triggerCsvDownload(filename: string, rows: string[][]) {
  const csvContent = rows.map(row => row.map(normalizeCsvCell).join(';')).join('\n');
  const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function ApprovalsView() {
  const { openAttachment, updateTicket, tickets, currentUser } = useApp();
  const canAccess = currentUser?.role === 'Admin' || currentUser?.role === 'Diretor';
  const canApprove = canAccess;
  const [activeTab, setActiveTab] = useState<'solutions' | 'budgets' | 'contracts'>('solutions');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectTargetId, setRejectTargetId] = useState<string | null>(null);
  const [attachContractModalId, setAttachContractModalId] = useState<string | null>(null);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [quotesByTicket, setQuotesByTicket] = useState<Record<string, Quote[]>>({});
  const [contractsByTicket, setContractsByTicket] = useState<Record<string, ContractRecord>>({});

  const currentReviewerName = currentUser?.name || currentUser?.email || 'Diretoria';

  if (!canAccess) {
    return (
      <div className="flex-1 overflow-y-auto bg-roman-bg p-8">
        <div className="max-w-4xl mx-auto min-h-[60vh]">
          <EmptyState
            icon={Shield}
            title="Acesso restrito"
            description="Apenas Diretor e Admin podem acessar o painel de aprovações."
          />
        </div>
      </div>
    );
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchProcurementData();
        if (!cancelled) {
          setQuotesByTicket(data.quotesByTicket);
          setContractsByTicket(data.contractsByTicket);
        }
      } catch {
        if (!cancelled) {
          setQuotesByTicket({});
          setContractsByTicket({});
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setAttachContractModalId(null);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!attachContractModalId) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [attachContractModalId]);

  const handleApprove = (id: string, tab: 'solutions' | 'budgets', selectedQuote?: Quote) => {
    if (!canApprove) return;
    if (tab === 'budgets' && !claimBudgetReview(id)) return;
    setProcessingId(id);
    setTimeout(async () => {
      if (tab === 'budgets') {
        const currentQuotes = quotesByTicket[id] || [];
        const targetTicket = tickets.find(ticket => ticket.id === id);
        const nextQuotes = currentQuotes.map(quote => ({
          ...quote,
          recommended: quote.id === selectedQuote?.id,
          status: quote.id === selectedQuote?.id ? 'approved' : 'rejected',
        }));
        const approvedQuote = nextQuotes.find(quote => quote.id === selectedQuote?.id);
        try {
          await saveQuotes(id, nextQuotes, targetTicket ? buildProcurementClassification(targetTicket) : undefined);
          if (approvedQuote) {
            await saveContract(
              id,
              {
                id: 'contract-1',
                vendor: approvedQuote.vendor,
                value: approvedQuote.value,
                status: 'pending_signature',
                viewingBy: null,
                signedFileName: null,
                items: approvedQuote.items || [],
              },
              targetTicket ? buildProcurementClassification(targetTicket) : undefined
            );
          }
        } catch {
          // Mantém o fluxo local mesmo se a API não estiver disponível no ambiente atual.
        }
        setQuotesByTicket(prev => ({ ...prev, [id]: nextQuotes }));
        if (approvedQuote) {
          setContractsByTicket(prev => ({
            ...prev,
            [id]: {
              id: 'contract-1',
              vendor: approvedQuote.vendor,
              value: approvedQuote.value,
              status: 'pending_signature',
              viewingBy: null,
              signedFileName: null,
              items: approvedQuote.items || [],
            },
          }));
        }
        const winner = selectedQuote?.vendor || 'Fornecedor vencedor';
        setToast(`Automação: aprovação enviada para ${winner}.`);
        setTimeout(() => setToast(null), 4000);
      }

      setProcessingId(null);
      const targetTicket = tickets.find(ticket => ticket.id === id);
      const historyItem = {
        id: crypto.randomUUID(),
        type: 'system' as const,
        sender: 'Diretoria',
        time: new Date(),
        text:
          tab === 'budgets'
            ? `Orçamento aprovado. ${selectedQuote?.vendor || 'Fornecedor vencedor'} definido para seguir com o contrato.`
            : 'Solução técnica aprovada. OS liberada para a etapa de orçamentação.',
      };
      updateTicket(id, {
        status: APPROVAL_STATUS[tab],
        viewingBy: tab === 'budgets' ? null : undefined,
        history: targetTicket ? [...targetTicket.history, historyItem] : undefined,
      });
    }, 1500);
  };

  const openRejectModal = (id: string) => {
    if (!canApprove) return;
    setRejectTargetId(id);
    setRejectModalOpen(true);
  };

  const handleReject = (reason: string) => {
    if (!canApprove) return;
    if (!rejectTargetId) return;
    setProcessingId(rejectTargetId);
    setRejectModalOpen(false);

    setTimeout(() => {
      setProcessingId(null);
      const targetTicket = tickets.find(ticket => ticket.id === rejectTargetId);
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
        viewingBy: activeTab === 'budgets' ? null : undefined,
        history: targetTicket ? [...targetTicket.history, historyItem] : undefined,
      });
      setRejectTargetId(null);
    }, 1500);
  };

  const handleAttachContract = () => {
    if (!canApprove) return;
    if (!attachContractModalId) return;
    setProcessingId(attachContractModalId);
    const currentContract = contractsByTicket[attachContractModalId];
    const targetTicket = tickets.find(ticket => ticket.id === attachContractModalId);

    setTimeout(async () => {
      const nextContract: ContractRecord = {
        id: currentContract?.id || 'contract-1',
        vendor: currentContract?.vendor || 'A confirmar',
        value: currentContract?.value || 'A confirmar',
        status: 'signed',
        viewingBy: null,
        signedFileName: attachedFile?.name || currentContract?.signedFileName || null,
      };
      try {
        await saveContract(
          attachContractModalId,
          nextContract,
          targetTicket ? buildProcurementClassification(targetTicket) : undefined
        );
      } catch {
        // Mantém o fluxo local mesmo se a API não estiver disponível no ambiente atual.
      }
      setContractsByTicket(prev => ({ ...prev, [attachContractModalId]: nextContract }));
      setProcessingId(null);
      const historyItem = {
        id: crypto.randomUUID(),
        type: 'system' as const,
        sender: 'Diretoria',
        time: new Date(),
        text: `Contrato assinado e anexado${nextContract.signedFileName ? `: ${nextContract.signedFileName}` : '.'}`,
      };
      updateTicket(attachContractModalId, {
        status: APPROVAL_STATUS.contracts,
        history: targetTicket ? [...targetTicket.history, historyItem] : undefined,
      });
      setAttachContractModalId(null);
      setAttachedFile(null);
    }, 1500);
  };

  const isReviewActive = (review: { name: string; at: Date } | null | undefined) => {
    if (!review?.at) return false;
    return new Date(review.at).getTime() + REVIEW_LOCK_WINDOW_MS > Date.now();
  };

  const claimBudgetReview = (id: string) => {
    const targetTicket = tickets.find(ticket => ticket.id === id);
    const review = targetTicket?.viewingBy;
    if (review && isReviewActive(review) && review.name !== currentReviewerName) {
      setToast(`${review.name} já está revisando este orçamento.`);
      window.setTimeout(() => setToast(null), 3000);
      return false;
    }

    if (!review || review.name !== currentReviewerName || !isReviewActive(review)) {
      updateTicket(id, {
        viewingBy: {
          name: currentReviewerName,
          at: new Date(),
        },
      });
    }

    return true;
  };

  const handleExportBudgetComparison = (budget: (typeof budgets)[number]) => {
    const rows: string[][] = [
      ['OS', budget.id],
      ['Assunto', budget.subject],
      ['Solicitante', budget.requester],
      ['Data', budget.date.toLocaleDateString('pt-BR')],
      ['Macroserviço', budget.macroServiceName ?? ''],
      ['Serviço', budget.serviceCatalogName ?? ''],
      [],
      ['Base histórica'],
      ['OS comparáveis', String(budget.historySummary.comparableTicketCount)],
      ['Cotações consideradas', String(budget.historySummary.comparableQuoteCount)],
      ['Média histórica', budget.historySummary.averageQuoteValue != null ? formatBudgetHistoryValue(budget.historySummary.averageQuoteValue) : '-'],
      ['Faixa histórica', `${formatBudgetHistoryValue(budget.historySummary.minQuoteValue)} a ${formatBudgetHistoryValue(budget.historySummary.maxQuoteValue)}`],
      ['Fornecedor preferencial', budget.historySummary.preferredVendor?.vendor ?? '-'],
      ['Referência preferencial', budget.historySummary.preferredVendor?.rationale.join(' | ') ?? '-'],
      [],
      ['Comparativo de cotações'],
      ['Cotação', 'Fornecedor', 'Valor', 'Recomendada', 'Status', 'Itens'],
      ...budget.quotes.map((quote, index) => [
        `Cotação ${index + 1}`,
        quote.vendor,
        quote.value,
        quote.recommended ? 'Sim' : 'Não',
        quote.status || 'pending',
        String(quote.items?.length || 0),
      ]),
      [],
      ['Itens das cotações'],
      ['Cotação', 'Fornecedor', 'Item', 'Material', 'Unidade', 'Quantidade', 'Valor unitário', 'Valor total'],
      ...budget.quotes.flatMap((quote, index) =>
        (quote.items && quote.items.length > 0
          ? quote.items
          : [{ id: 'sem-itens', description: '', materialName: '', unit: '', quantity: null, unitPrice: '', totalPrice: '' }]
        ).map(item => [
          `Cotação ${index + 1}`,
          quote.vendor,
          item.description || 'Sem descrição',
          item.materialName || '',
          item.unit || '',
          item.quantity != null ? String(item.quantity) : '',
          item.unitPrice || '',
          item.totalPrice || '',
        ])
      ),
      [],
      ['Histórico por item/material'],
      ['Item', 'Amostras', 'Unidade', 'Média unitária', 'Faixa', 'Último fornecedor'],
      ...budget.historySummary.itemReferences.map(item => [
        item.label,
        String(item.sampleCount),
        item.unit || '',
        item.averageUnitPriceLabel || '-',
        `${item.minUnitPriceLabel || '-'} a ${item.maxUnitPriceLabel || '-'}`,
        item.latestVendor || '-',
      ]),
      [],
      ['OS similares'],
      ['OS', 'Assunto', 'Fornecedor', 'Valor', 'Sede', 'Região', 'Match'],
      ...budget.historySummary.similarCases.map(item => [
        item.ticketId,
        item.subject,
        item.vendor,
        item.valueLabel,
        item.sede,
        item.region,
        item.sharedTerms.join(', '),
      ]),
    ];

    triggerCsvDownload(`comparativo-${String(budget.id).toLowerCase()}.csv`, rows);
    setToast(`Comparativo ${budget.id} exportado em CSV.`);
    window.setTimeout(() => setToast(null), 3000);
  };

  const solutions = useMemo(
    () =>
      tickets
        .filter(ticket => ticket.status === TICKET_STATUS.WAITING_SOLUTION_APPROVAL)
        .map(ticket => ({
          id: ticket.id,
          subject: ticket.subject,
          requester: ticket.requester,
          date: ticket.time,
          technicalOpinion: [...ticket.history].reverse().find(item => item.type === 'tech')?.text ?? 'Parecer não disponível.',
        })),
    [tickets]
  );

  const budgets = useMemo(
    () =>
      tickets
        .filter(ticket => ticket.status === TICKET_STATUS.WAITING_BUDGET_APPROVAL)
        .map(ticket => ({
          id: ticket.id,
          subject: ticket.subject,
          requester: ticket.requester,
          date: ticket.time,
          macroServiceName: ticket.macroServiceName ?? null,
          serviceCatalogName: ticket.serviceCatalogName ?? null,
          viewingBy: ticket.viewingBy ?? null,
          quotes: quotesByTicket[ticket.id] ?? [],
          historySummary: buildBudgetHistorySummary(ticket, tickets, quotesByTicket),
        })),
    [quotesByTicket, tickets]
  );

  const contracts = useMemo(
    () =>
      tickets
        .filter(ticket => ticket.status === TICKET_STATUS.WAITING_CONTRACT_APPROVAL)
        .map(ticket => ({
          id: ticket.id,
          subject: ticket.subject,
          requester: ticket.requester,
          date: ticket.time,
          macroServiceName: ticket.macroServiceName ?? null,
          serviceCatalogName: ticket.serviceCatalogName ?? null,
          value: contractsByTicket[ticket.id]?.value ?? 'A confirmar',
          vendor: contractsByTicket[ticket.id]?.vendor ?? 'A confirmar',
          items: contractsByTicket[ticket.id]?.items ?? [],
        })),
    [contractsByTicket, tickets]
  );

  const approvalSummary = useMemo(
    () => [
      {
        label: 'Soluções',
        value: solutions.length,
        hint: 'Pareceres aguardando decisão',
        active: activeTab === 'solutions',
      },
      {
        label: 'Orçamentos',
        value: budgets.length,
        hint: 'Rodadas prontas para escolha',
        active: activeTab === 'budgets',
      },
      {
        label: 'Contratos',
        value: contracts.length,
        hint: 'Assinaturas pendentes',
        active: activeTab === 'contracts',
      },
    ],
    [activeTab, budgets.length, contracts.length, solutions.length]
  );

  return (
    <div className="flex-1 overflow-y-auto bg-roman-bg p-8 relative">
      {toast && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 px-6 py-3 rounded-sm shadow-lg flex items-center gap-3 z-[100] animate-in slide-in-from-top-4 fade-in bg-green-800 text-white">
          <CheckCircle size={18} />
          <span className="font-medium text-sm">{toast}</span>
        </div>
      )}
      <div className="max-w-5xl mx-auto">
        <header className="mb-6 border-b border-roman-border pb-4 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-serif font-medium text-roman-text-main mb-2">Painel da Diretoria</h1>
            <p className="text-roman-text-sub font-serif italic">Aprovações rápidas de orçamentos e assinaturas de contratos.</p>
          </div>
          <div className="flex bg-roman-surface border border-roman-border rounded-full p-1 shadow-sm overflow-x-auto hide-scrollbar">
            <button onClick={() => setActiveTab('solutions')} className={`px-4 py-2 text-sm font-medium rounded-sm transition-colors whitespace-nowrap ${activeTab === 'solutions' ? 'bg-roman-primary/10 text-roman-primary' : 'text-roman-text-sub hover:text-roman-text-main'}`}>
              Soluções ({solutions.length})
            </button>
            <button onClick={() => setActiveTab('budgets')} className={`px-4 py-2 text-sm font-medium rounded-sm transition-colors whitespace-nowrap ${activeTab === 'budgets' ? 'bg-roman-primary/10 text-roman-primary' : 'text-roman-text-sub hover:text-roman-text-main'}`}>
              Orçamentos ({budgets.length})
            </button>
            <button onClick={() => setActiveTab('contracts')} className={`px-4 py-2 text-sm font-medium rounded-sm transition-colors whitespace-nowrap ${activeTab === 'contracts' ? 'bg-roman-primary/10 text-roman-primary' : 'text-roman-text-sub hover:text-roman-text-main'}`}>
              Contratos ({contracts.length})
            </button>
          </div>
        </header>

        <div className="mb-6 grid gap-3 md:grid-cols-3">
          {approvalSummary.map(item => (
            <button
              key={item.label}
              type="button"
              onClick={() => setActiveTab(item.label.toLowerCase() === 'soluções' ? 'solutions' : item.label.toLowerCase() === 'orçamentos' ? 'budgets' : 'contracts')}
              className={`rounded-sm border p-4 text-left transition-colors ${
                item.active
                  ? 'border-roman-primary/30 bg-roman-primary/5'
                  : 'border-roman-border bg-roman-surface hover:border-roman-primary/20'
              }`}
            >
              <div className="text-[10px] font-serif uppercase tracking-[0.22em] text-roman-text-sub">{item.label}</div>
              <div className="mt-2 text-2xl font-semibold text-roman-text-main">{item.value}</div>
              <div className="mt-1 text-sm text-roman-text-sub">{item.hint}</div>
            </button>
          ))}
        </div>

        <div className="space-y-6">
          {activeTab === 'solutions' && solutions.map(solution => (
            <div key={solution.id} className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm hover:border-roman-primary/30 transition-colors relative overflow-hidden">
              {processingId === solution.id && (
                <div className="absolute inset-0 bg-roman-surface/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center rounded-sm">
                  <Loader2 size={32} className="text-roman-primary animate-spin mb-4" />
                  <span className="font-serif text-roman-text-main font-medium">Processando decisão...</span>
                </div>
              )}
              <div className="flex items-center justify-between mb-4 border-b border-roman-border pb-4">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <span className="text-roman-primary font-serif italic text-sm">{solution.id}</span>
                    <span className="text-xs text-roman-text-sub font-medium px-2 py-0.5 bg-roman-bg border border-roman-border rounded-sm">Aguardando Aprovação da Solução</span>
                  </div>
                  <h3 className="text-xl font-serif text-roman-text-main">{solution.subject}</h3>
                  <p className="text-sm text-roman-text-sub">Solicitante: {solution.requester} · Parecer emitido: {formatDateTimeSafe(solution.date)}</p>
                </div>
              </div>
              <div className="bg-roman-bg border border-roman-border rounded-sm p-4 mb-6">
                <h4 className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-2 font-bold flex items-center gap-2"><FileText size={14} /> Parecer Técnico</h4>
                <p className="text-sm text-roman-text-main leading-relaxed">{solution.technicalOpinion}</p>
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={() => openRejectModal(solution.id)} disabled={processingId === solution.id} className="px-6 py-2 border border-red-200 text-red-700 hover:bg-red-50 rounded-sm font-medium transition-colors text-sm disabled:cursor-not-allowed disabled:opacity-50">
                  Reprovar Solução (Arquivar)
                </button>
                <button onClick={() => handleApprove(solution.id, 'solutions')} disabled={processingId === solution.id} className="px-6 py-2 bg-roman-sidebar hover:bg-stone-900 text-white rounded-sm font-medium transition-colors text-sm flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-60">
                  {processingId === solution.id ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                  {processingId === solution.id ? 'Processando...' : 'Aprovar (Ir para Cotação)'}
                </button>
              </div>
            </div>
          ))}

          {activeTab === 'budgets' && budgets.map(budget => (
            <div key={budget.id} className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm hover:border-roman-primary/30 transition-colors relative overflow-hidden">
              {processingId === budget.id && (
                <div className="absolute inset-0 bg-roman-surface/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center rounded-sm">
                  <Loader2 size={32} className="text-roman-primary animate-spin mb-4" />
                  <span className="font-serif text-roman-text-main font-medium">Processando decisão...</span>
                </div>
              )}
              <div className="flex items-center justify-between mb-4 border-b border-roman-border pb-4">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <span className="text-roman-primary font-serif italic text-sm">{budget.id}</span>
                    <span className="text-xs text-roman-text-sub font-medium px-2 py-0.5 bg-roman-bg border border-roman-border rounded-sm">Aguardando Aprovação</span>
                    {budget.viewingBy && isReviewActive(budget.viewingBy) && (
                      <span className="text-xs font-medium px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-sm flex items-center gap-1.5 shadow-sm">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                        Sendo revisado por {budget.viewingBy.name}
                      </span>
                    )}
                  </div>
                  <h3 className="text-xl font-serif text-roman-text-main">{budget.subject}</h3>
                  <p className="text-sm text-roman-text-sub">Solicitante: {budget.requester} • Enviado: {formatDateTimeSafe(budget.date)}</p>
                  {(budget.macroServiceName || budget.serviceCatalogName) && (
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                      {budget.macroServiceName && (
                        <span className="rounded-sm border border-roman-primary/20 bg-roman-primary/5 px-2 py-1 text-roman-primary">
                          {budget.macroServiceName}
                        </span>
                      )}
                      {budget.serviceCatalogName && (
                        <span className="rounded-sm border border-roman-border bg-roman-surface px-2 py-1 text-roman-text-sub">
                          {budget.serviceCatalogName}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => claimBudgetReview(budget.id)}
                    disabled={!!(budget.viewingBy && isReviewActive(budget.viewingBy) && budget.viewingBy.name !== currentReviewerName)}
                    className="px-4 py-2 border border-amber-200 text-amber-800 hover:bg-amber-50 rounded-sm font-medium transition-colors text-sm disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {budget.viewingBy && isReviewActive(budget.viewingBy) && budget.viewingBy.name === currentReviewerName
                      ? 'Você está revisando'
                      : 'Assumir revisão'}
                  </button>
                  <button
                    onClick={() => {
                      if (!claimBudgetReview(budget.id)) return;
                      handleExportBudgetComparison(budget);
                    }}
                    className="px-4 py-2 border border-roman-border text-roman-text-main hover:bg-roman-bg rounded-sm font-medium transition-colors text-sm flex items-center gap-2"
                  >
                    <Download size={14} /> Exportar CSV
                  </button>
                  <button
                    onClick={() => {
                      if (!claimBudgetReview(budget.id)) return;
                      openRejectModal(budget.id);
                    }}
                    disabled={processingId === budget.id}
                    className="px-4 py-2 border border-red-200 text-red-700 hover:bg-red-50 rounded-sm font-medium transition-colors text-sm disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Reprovar Todas
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {budget.quotes.map(quote => (
                  <div key={quote.id} className={`border rounded-sm p-4 flex flex-col ${quote.recommended ? 'border-roman-primary bg-roman-primary/5' : 'border-roman-border bg-roman-bg'}`}>
                    {quote.recommended && <div className="text-[10px] font-serif uppercase tracking-widest text-roman-primary mb-2 font-bold flex items-center gap-1"><CheckCircle size={12} /> Recomendado pelo Gestor</div>}
                    {budget.historySummary.preferredVendor && quote.vendor.trim().toLowerCase() === budget.historySummary.preferredVendor.vendor.trim().toLowerCase() && (
                      <div className="text-[10px] font-serif uppercase tracking-widest text-emerald-700 mb-2 font-bold">
                        Histórico favorece este fornecedor
                      </div>
                    )}
                    <div className="text-sm text-roman-text-sub mb-1">{quote.vendor}</div>
                    <div className="text-2xl font-serif text-roman-text-main mb-4">{quote.value}</div>
                    {quote.items && quote.items.length > 0 && (
                      <div className="mb-4 rounded-sm border border-roman-border/70 bg-roman-surface px-3 py-2">
                        <div className="text-[10px] uppercase tracking-widest text-roman-text-sub mb-2">Composição</div>
                        <div className="space-y-1">
                          {quote.items.slice(0, 3).map(item => (
                            <div key={item.id} className="text-[11px] text-roman-text-sub flex items-start justify-between gap-3">
                              <span className="truncate">{item.description || item.materialName || 'Item sem descrição'}</span>
                              <span className="shrink-0 text-roman-text-main">{item.totalPrice || item.unitPrice || '-'}</span>
                            </div>
                          ))}
                        </div>
                        <div className="mt-2 text-[11px] text-roman-text-sub">
                          {quote.items.length} item(ns) no orçamento
                        </div>
                      </div>
                    )}
                    <div className="mt-auto flex flex-col gap-2">
                      <button onClick={() => openAttachment(`Orçamento: ${quote.vendor}`, 'pdf')} className="flex items-center justify-center gap-2 text-roman-text-sub hover:text-roman-text-main text-xs font-medium border border-roman-border bg-roman-surface py-1.5 rounded-sm transition-colors">
                        <FileText size={14} /> Ver PDF
                      </button>
                      <button
                        onClick={() => handleApprove(budget.id, 'budgets', quote)}
                        disabled={processingId === budget.id || !!(budget.viewingBy && isReviewActive(budget.viewingBy) && budget.viewingBy.name !== currentReviewerName)}
                        className="w-full py-2 bg-roman-sidebar hover:bg-stone-900 text-white rounded-sm font-medium transition-colors text-sm disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {processingId === budget.id ? 'Processando...' : 'Aprovar esta opção'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-sm border border-roman-border bg-roman-bg p-4">
                <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-roman-text-sub">Base histórica</div>
                    <div className="text-sm text-roman-text-main">
                      {budget.historySummary.comparableTicketCount > 0
                        ? `${budget.historySummary.comparableTicketCount} OS comparáveis nos últimos 24 meses`
                        : 'Sem OS comparáveis suficientes nos últimos 24 meses'}
                    </div>
                  </div>
                  <div className="text-xs text-roman-text-sub">
                    Termos: {budget.historySummary.basisTerms.length > 0 ? budget.historySummary.basisTerms.join(', ') : 'não definidos'}
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
                  <div className="rounded-sm border border-roman-border bg-roman-surface p-3">
                    <div className="text-[10px] uppercase tracking-widest text-roman-text-sub">Media</div>
                    <div className="mt-1 text-base font-serif text-roman-text-main">{formatBudgetHistoryValue(budget.historySummary.averageQuoteValue)}</div>
                  </div>
                  <div className="rounded-sm border border-roman-border bg-roman-surface p-3">
                    <div className="text-[10px] uppercase tracking-widest text-roman-text-sub">Min / Max</div>
                    <div className="mt-1 text-sm font-medium text-roman-text-main">
                      {formatBudgetHistoryValue(budget.historySummary.minQuoteValue)} / {formatBudgetHistoryValue(budget.historySummary.maxQuoteValue)}
                    </div>
                  </div>
                  <div className="rounded-sm border border-roman-border bg-roman-surface p-3">
                    <div className="text-[10px] uppercase tracking-widest text-roman-text-sub">Último fornecedor</div>
                    <div className="mt-1 text-sm font-medium text-roman-text-main">{budget.historySummary.latestComparableVendor ?? '-'}</div>
                    <div className="text-[11px] text-roman-text-sub">{budget.historySummary.latestComparableValueLabel ?? '-'}</div>
                  </div>
                  <div className="rounded-sm border border-roman-border bg-roman-surface p-3">
                    <div className="text-[10px] uppercase tracking-widest text-roman-text-sub">Volume</div>
                    <div className="mt-1 text-base font-serif text-roman-text-main">{budget.historySummary.comparableQuoteCount}</div>
                    <div className="text-[11px] text-roman-text-sub">cotações consideradas</div>
                  </div>
                </div>

                {budget.historySummary.preferredVendor && (
                  <div className="mt-3 rounded-sm border border-emerald-200 bg-emerald-50/70 p-3">
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="text-[10px] uppercase tracking-widest text-emerald-700">Fornecedor preferencial</div>
                        <div className="mt-1 text-sm font-medium text-emerald-950">{budget.historySummary.preferredVendor.vendor}</div>
                        <div className="text-[11px] text-emerald-800">{budget.historySummary.preferredVendor.rationale.join(' · ')}</div>
                      </div>
                      <div className="text-[11px] text-emerald-900 md:text-right">
                        <div>Média: {budget.historySummary.preferredVendor.averageComparableValueLabel ?? '-'}</div>
                        <div>Último comparável: {budget.historySummary.preferredVendor.latestComparableValueLabel ?? '-'}</div>
                      </div>
                    </div>
                  </div>
                )}

                {budget.historySummary.similarCases.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {budget.historySummary.similarCases.slice(0, 2).map(item => (
                      <div key={item.ticketId} className="flex flex-col gap-1 rounded-sm border border-roman-border/70 bg-roman-surface px-3 py-2 md:flex-row md:items-center md:justify-between">
                        <div>
                          <div className="text-sm font-medium text-roman-text-main">{item.ticketId} · {item.subject}</div>
                          <div className="text-[11px] text-roman-text-sub">
                            {item.vendor} · {item.sede} / {item.region} · {formatDateTimeSafe(item.date)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-serif text-roman-text-main">{item.valueLabel}</div>
                          <div className="text-[11px] text-roman-text-sub">
                            Match: {item.sharedTerms.length > 0 ? item.sharedTerms.join(', ') : 'tipo/regiao'}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {budget.historySummary.itemReferences.length > 0 && (
                  <div className="mt-3 rounded-sm border border-roman-border bg-roman-surface p-3">
                    <div className="text-[10px] uppercase tracking-widest text-roman-text-sub">Histórico por item/material</div>
                    <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
                      {budget.historySummary.itemReferences.slice(0, 3).map(item => (
                        <div key={item.key} className="rounded-sm border border-roman-border/70 bg-roman-bg px-3 py-2">
                          <div className="text-sm font-medium text-roman-text-main">{item.label}</div>
                          <div className="text-[11px] text-roman-text-sub">
                            {item.sampleCount} referência(s) {item.unit ? `· ${item.unit}` : ''}
                          </div>
                          <div className="mt-1 text-[11px] text-roman-text-main">Média unitária: {item.averageUnitPriceLabel ?? '-'}</div>
                          <div className="text-[11px] text-roman-text-sub">
                            Faixa: {item.minUnitPriceLabel ?? '-'} / {item.maxUnitPriceLabel ?? '-'}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}

          {activeTab === 'contracts' && contracts.map(contract => (
            <div key={contract.id} className="bg-roman-parchment border border-roman-parchment-border rounded-sm p-6 flex flex-col md:flex-row gap-6 items-start md:items-center shadow-sm relative overflow-hidden">
              {processingId === contract.id && (
                <div className="absolute inset-0 bg-roman-parchment/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center rounded-sm">
                  <Loader2 size={32} className="text-roman-primary animate-spin mb-4" />
                  <span className="font-serif text-roman-text-main font-medium">Processando assinatura...</span>
                </div>
              )}
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-stone-800 font-serif italic text-sm">{contract.id}</span>
                  <span className="text-xs text-stone-600 font-medium px-2 py-0.5 bg-white/50 border border-stone-300 rounded-sm">Aguardando Assinatura</span>
                  <span className="text-xs text-stone-500 ml-auto">{formatDateTimeSafe(contract.date)}</span>
                </div>
                <h3 className="text-xl font-serif text-stone-900 mb-1">{contract.subject}</h3>
                <p className="text-sm text-stone-600 mb-4">Solicitante: {contract.requester} • Contratada: {contract.vendor}</p>
                {(contract.macroServiceName || contract.serviceCatalogName) && (
                  <div className="mb-4 flex flex-wrap gap-2 text-[11px]">
                    {contract.macroServiceName && (
                      <span className="rounded-sm border border-amber-300 bg-amber-50 px-2 py-1 text-amber-800">
                        {contract.macroServiceName}
                      </span>
                    )}
                    {contract.serviceCatalogName && (
                      <span className="rounded-sm border border-stone-300 bg-white/60 px-2 py-1 text-stone-700">
                        {contract.serviceCatalogName}
                      </span>
                    )}
                  </div>
                )}
                {contract.items && contract.items.length > 0 && (
                  <div className="mb-4 rounded-sm border border-stone-300 bg-white/60 px-3 py-3">
                    <div className="text-[10px] uppercase tracking-widest text-stone-500 mb-2">Escopo contratado</div>
                    <div className="space-y-1">
                      {contract.items.slice(0, 4).map(item => (
                        <div key={item.id} className="flex items-start justify-between gap-3 text-[11px] text-stone-700">
                          <span className="truncate">{item.description || item.materialName || 'Item sem descrição'}</span>
                          <span className="shrink-0">{item.totalPrice || item.unitPrice || '-'}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 text-[11px] text-stone-500">{contract.items.length} item(ns) vinculados ao contrato</div>
                  </div>
                )}
                <button onClick={() => openAttachment(`Minuta: ${contract.vendor}`, 'pdf')} className="flex items-center gap-2 text-stone-800 hover:underline text-sm font-medium">
                  <FileText size={16} /> Ler Minuta do Contrato (PDF)
                </button>
              </div>

              <div className="w-full md:w-auto flex flex-col items-end gap-4 border-t md:border-t-0 md:border-l border-stone-300 pt-4 md:pt-0 md:pl-6">
                <div className="text-right">
                  <div className="text-[10px] font-serif uppercase tracking-widest text-stone-500 mb-1">Valor do Contrato</div>
                  <div className="text-2xl font-serif text-stone-900">{contract.value}</div>
                </div>
                <div className="flex gap-2 w-full md:w-auto">
                  <button onClick={() => openAttachment(`Minuta: ${contract.vendor}`, 'pdf')} className="flex-1 md:flex-none px-4 py-2 border border-stone-300 text-stone-700 hover:bg-white/50 rounded-sm font-medium transition-colors text-sm">
                    Revisar
                  </button>
                  <button onClick={() => setAttachContractModalId(contract.id)} disabled={processingId === contract.id} className="flex-1 md:flex-none px-6 py-2 bg-roman-primary hover:bg-roman-primary-hover text-white rounded-sm font-medium transition-colors text-sm flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-60">
                    {processingId === contract.id ? <Loader2 size={16} className="animate-spin" /> : <Shield size={16} />}
                    {processingId === contract.id ? 'Processando...' : 'Assinar Contrato'}
                  </button>
                </div>
              </div>
            </div>
          ))}

          {activeTab === 'contracts' && contracts.length === 0 && (
            <div className="text-center py-12 border border-dashed border-roman-border rounded-sm">
              <Shield size={32} className="mx-auto text-roman-border mb-4" />
              <p className="text-roman-text-sub font-serif italic">Nenhum contrato pendente de assinatura no momento.</p>
            </div>
          )}
        </div>
      </div>

      <ConfirmModal
        isOpen={rejectModalOpen}
        onClose={() => setRejectModalOpen(false)}
        onConfirm={handleReject}
        title="Reprovar Solicitação"
        description="Informe o motivo da reprovação para o gestor buscar novas opções."
        confirmText="Confirmar Reprovação"
        isDestructive={true}
        requireReason={true}
      />

      {attachContractModalId && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in"
          onClick={event => {
            if (event.target === event.currentTarget) setAttachContractModalId(null);
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Anexar contrato assinado"
        >
          <div className="bg-roman-surface border border-roman-border rounded-sm shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-roman-border bg-roman-bg">
              <h3 className="font-serif text-lg text-roman-text-main font-medium">Anexar Contrato Assinado</h3>
              <button onClick={() => setAttachContractModalId(null)} className="text-roman-text-sub hover:text-roman-text-main"><X size={20} /></button>
            </div>
            <div className="p-6">
              <p className="text-sm text-roman-text-sub mb-4">Faça o upload do contrato assinado para prosseguir com a OS.</p>

              <div className="border-2 border-dashed border-roman-border rounded-sm p-8 text-center bg-roman-bg mb-6 relative hover:bg-roman-border-light transition-colors cursor-pointer">
                <input
                  type="file"
                  accept=".pdf"
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  onChange={event => {
                    if (event.target.files && event.target.files.length > 0) {
                      setAttachedFile(event.target.files[0]);
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
                <button onClick={handleAttachContract} disabled={!attachedFile || processingId === attachContractModalId} className="px-6 py-2 bg-roman-primary hover:bg-roman-primary-hover text-white rounded-sm font-medium transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed">
                  {processingId === attachContractModalId ? 'Enviando...' : 'Confirmar e Enviar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

