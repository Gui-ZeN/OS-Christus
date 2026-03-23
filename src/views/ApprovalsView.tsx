import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle, Download, FileText, Image as ImageIcon, Loader2, Shield, X } from 'lucide-react';
import { useRef } from 'react';
import { useApp } from '../context/AppContext';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { EmptyState } from '../components/ui/EmptyState';
import { TICKET_STATUS } from '../constants/ticketStatus';
import type { ContractRecord, Quote, QuoteProposalHeader, TicketStatus } from '../types';
import { fetchProcurementData, saveContract, saveQuotes } from '../services/procurementApi';
import { buildBudgetHistorySummary, formatBudgetHistoryValue } from '../utils/budgetHistory';
import { buildProcurementClassification } from '../utils/procurementClassification';
import { formatDateTimeSafe } from '../utils/date';

const REVIEW_ACTIVE_WINDOW_MS = 20 * 60 * 1000;

const QUOTE_SECTION_LABELS: Record<string, string> = {
  material: 'Material',
  'mao-de-obra': 'Mão de obra',
  'materiais-complementares': 'Materiais complementares',
  'servicos-complementares': 'Serviços complementares',
};

function normalizeQuoteSection(section?: string | null) {
  const normalized = String(section || '').trim();
  if (!normalized || normalized === 'material-mao-de-obra') return 'material';
  return normalized;
}

function getQuoteSectionLabel(section?: string | null) {
  if (!section) return 'Material';
  return QUOTE_SECTION_LABELS[section] || section;
}

function parseCurrencyInput(value: string | null | undefined) {
  const normalized = String(value || '')
    .replace(/[^\d,.-]/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrencyValue(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Math.max(0, value || 0));
}

function createEmptyProposalHeader(): QuoteProposalHeader {
  return {
    unitName: '',
    location: '',
    folderLink: '',
    contractedVendor: '',
    totalQuantity: '',
    totalEstimatedValue: '',
  };
}

function getProposalHeaderValue(header: QuoteProposalHeader | null | undefined, key: keyof QuoteProposalHeader) {
  return (header?.[key] || '').trim();
}

function buildQuoteComparisonSections(quotes: Quote[]) {
  const sectionKeys = new Set<string>();
  quotes.forEach(quote => {
    (quote.items || []).forEach(item => sectionKeys.add(normalizeQuoteSection(item.section)));
  });

  return Array.from(sectionKeys).map(sectionKey => {
    const rowMap = new Map<string, { key: string; description: string; unit: string; quantity: string; values: Array<{ costUnitPrice: string; chargedTotalPrice: string }> }>();

    quotes.forEach((quote, quoteIndex) => {
      (quote.items || [])
        .filter(item => normalizeQuoteSection(item.section) === sectionKey)
        .forEach(item => {
          const key = String(item.description || item.materialName || item.id).trim().toLowerCase();
          if (!rowMap.has(key)) {
            rowMap.set(key, {
              key,
              description: item.description || item.materialName || 'Item sem descrição',
              unit: item.unit || '',
              quantity: item.quantity != null ? String(item.quantity) : '',
              values: quotes.map(() => ({ costUnitPrice: '', chargedTotalPrice: '' })),
            });
          }
          const row = rowMap.get(key)!;
          row.values[quoteIndex] = {
            costUnitPrice: item.costUnitPrice || '',
            chargedTotalPrice: item.totalPrice || '',
          };
          if (!row.unit && item.unit) row.unit = item.unit;
          if (!row.quantity && item.quantity != null) row.quantity = String(item.quantity);
        });
    });

    return {
      key: sectionKey,
      label: getQuoteSectionLabel(sectionKey),
      rows: Array.from(rowMap.values()),
      subtotals: quotes.map(quote =>
        (quote.items || [])
          .filter(item => normalizeQuoteSection(item.section) === sectionKey)
          .reduce((sum, item) => sum + parseCurrencyInput(item.totalPrice), 0)
      ),
    };
  });
}

function getQuoteGrandTotals(quotes: Quote[]) {
  return quotes.map(quote =>
    (quote.items || []).reduce((sum, item) => sum + parseCurrencyInput(item.totalPrice), 0)
  );
}

function isReviewStateActive(viewingBy?: { name: string; at: Date } | null) {
  if (!viewingBy?.name || !viewingBy?.at) return false;
  const reviewedAt = viewingBy.at instanceof Date ? viewingBy.at.getTime() : new Date(viewingBy.at).getTime();
  if (!Number.isFinite(reviewedAt)) return false;
  return reviewedAt + REVIEW_ACTIVE_WINDOW_MS > Date.now();
}

function resolveAttachmentLabel(fileName?: string | null, fileUrl?: string | null) {
  const explicit = String(fileName || '').trim();
  if (explicit) return explicit;
  const rawUrl = String(fileUrl || '').trim();
  if (!rawUrl) return 'Não informado';
  try {
    const parsed = new URL(rawUrl);
    const segments = parsed.pathname.split('/').filter(Boolean);
    const last = segments[segments.length - 1] || '';
    return decodeURIComponent(last) || 'Arquivo anexado';
  } catch {
    return 'Arquivo anexado';
  }
}

const APPROVAL_STATUS: Record<'solutions' | 'budgets' | 'contracts', TicketStatus> = {
  solutions: TICKET_STATUS.WAITING_BUDGET,
  budgets: TICKET_STATUS.WAITING_CONTRACT_UPLOAD,
  contracts: TICKET_STATUS.WAITING_PRELIM_ACTIONS,
};

function isQuoteFilled(quote: Quote) {
  return (
    String(quote.vendor || '').trim().length > 0 &&
    (
      String(quote.value || '').trim().length > 0 ||
      String(quote.totalValue || '').trim().length > 0 ||
      Array.isArray(quote.items) && quote.items.length > 0
    )
  );
}

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

function getQuoteRoundCategory(quote: Quote) {
  return quote.category === 'additive' ? 'additive' : 'initial';
}

function getQuoteRoundIndex(quote: Quote) {
  return Number(quote.additiveIndex || 1);
}

function filterQuotesByRound(quotes: Quote[], category: 'initial' | 'additive', additiveIndex: number | null = null) {
  return (Array.isArray(quotes) ? quotes : []).filter(quote => {
    if (getQuoteRoundCategory(quote) !== category) return false;
    if (category === 'additive') {
      return getQuoteRoundIndex(quote) === Number(additiveIndex || 1);
    }
    return true;
  });
}

function resolvePendingRound(quotes: Quote[]) {
  const list = Array.isArray(quotes) ? quotes : [];
  const initialPending = filterQuotesByRound(list, 'initial').filter(quote => (quote.status || 'pending') === 'pending');
  if (initialPending.length > 0) {
    return { category: 'initial' as const, additiveIndex: null, quotes: initialPending };
  }

  const additiveIndices = Array.from(
    new Set(
      list
        .filter(quote => getQuoteRoundCategory(quote) === 'additive')
        .map(quote => getQuoteRoundIndex(quote))
        .filter(value => Number.isFinite(value) && value > 0)
    )
  ).sort((a, b) => b - a);

  for (const additiveIndex of additiveIndices) {
    const roundQuotes = filterQuotesByRound(list, 'additive', additiveIndex);
    if (roundQuotes.some(quote => (quote.status || 'pending') === 'pending')) {
      return { category: 'additive' as const, additiveIndex, quotes: roundQuotes };
    }
  }

  return null;
}

export function ApprovalsView() {
  const { activeTicketId, setActiveTicketId, currentView, openAttachment, updateTicket, tickets, currentUser, refreshTickets } = useApp();
  const canAccess = currentUser?.role === 'Admin' || currentUser?.role === 'Diretor';
  const canApprove = canAccess;
  const [activeTab, setActiveTab] = useState<'solutions' | 'budgets' | 'contracts'>('solutions');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectTargetId, setRejectTargetId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [quotesByTicket, setQuotesByTicket] = useState<Record<string, Quote[]>>({});
  const [contractsByTicket, setContractsByTicket] = useState<Record<string, ContractRecord>>({});
  const reviewingTicketIdRef = useRef<string | null>(null);
  const approvalQueryAppliedRef = useRef(false);
  const activeTicketSyncRef = useRef<string | null>(null);

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
    if (currentView !== 'approvals') return undefined;

    const runSilentRefresh = async () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      await refreshTickets({ silent: true });
    };

    void runSilentRefresh();
    const interval = window.setInterval(() => {
      void runSilentRefresh();
    }, 10000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void runSilentRefresh();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [currentView, refreshTickets]);

  const handleApprove = (id: string, tab: 'solutions' | 'budgets', selectedQuote?: Quote) => {
    if (!canApprove) return;
    setProcessingId(id);
    setTimeout(async () => {
      let budgetApprovalContext: {
        isAdditive: boolean;
        winner: string;
        shouldMoveStatus: boolean;
      } | null = null;

      if (tab === 'budgets') {
        const currentQuotes = quotesByTicket[id] || [];
        const targetTicket = tickets.find(ticket => ticket.id === id);
        const selectedCategory = selectedQuote?.category === 'additive' ? 'additive' : 'initial';
        const selectedAdditiveIndex = selectedCategory === 'additive' ? Number(selectedQuote?.additiveIndex || 1) : null;
        const nextQuotes = currentQuotes.map(quote => {
          const quoteCategory = quote.category === 'additive' ? 'additive' : 'initial';
          const quoteAdditiveIndex = quoteCategory === 'additive' ? Number(quote.additiveIndex || 1) : null;
          const isSameRound =
            quoteCategory === selectedCategory &&
            (quoteCategory === 'initial' || quoteAdditiveIndex === selectedAdditiveIndex);

          if (!isSameRound) return quote;
          return {
            ...quote,
            recommended: quote.id === selectedQuote?.id,
            status: quote.id === selectedQuote?.id ? 'approved' : 'rejected',
          };
        });
        const approvedQuote = nextQuotes.find(quote => quote.id === selectedQuote?.id) || null;
        const isAdditive = selectedCategory === 'additive';
        const approvedQuoteValue = parseCurrencyInput(approvedQuote?.totalValue || approvedQuote?.value || '0');
        const currentContract = contractsByTicket[id];
        const currentInitialValue = parseCurrencyInput(currentContract?.initialPlannedValue || currentContract?.value || '0');
        const currentRealizedValue = parseCurrencyInput(currentContract?.realizedValue || currentContract?.value || '0');
        const nextInitialValue = isAdditive ? currentInitialValue : approvedQuoteValue;
        const nextRealizedValue = isAdditive
          ? currentRealizedValue + approvedQuoteValue
          : approvedQuoteValue;
        const nextContractValue = nextRealizedValue > 0 ? formatCurrencyValue(nextRealizedValue) : approvedQuote?.value || currentContract?.value || 'A confirmar';

        try {
          await saveQuotes(id, nextQuotes, targetTicket ? buildProcurementClassification(targetTicket) : undefined);
          if (approvedQuote) {
            await saveContract(
              id,
              {
                id: currentContract?.id || 'contract-1',
                vendor: approvedQuote.vendor,
                value: nextContractValue,
                initialPlannedValue: nextInitialValue > 0 ? formatCurrencyValue(nextInitialValue) : null,
                realizedValue: nextRealizedValue > 0 ? formatCurrencyValue(nextRealizedValue) : null,
                status: 'pending_upload',
                viewingBy: null,
                signedFileName: currentContract?.signedFileName || null,
                signedFileUrl: currentContract?.signedFileUrl || null,
                signedFilePath: currentContract?.signedFilePath || null,
                signedFileContentType: currentContract?.signedFileContentType || null,
                signedFileSize: currentContract?.signedFileSize ?? null,
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
              id: currentContract?.id || 'contract-1',
              vendor: approvedQuote.vendor,
              value: nextContractValue,
              initialPlannedValue: nextInitialValue > 0 ? formatCurrencyValue(nextInitialValue) : null,
              realizedValue: nextRealizedValue > 0 ? formatCurrencyValue(nextRealizedValue) : null,
              status: 'pending_upload',
              viewingBy: null,
              signedFileName: currentContract?.signedFileName || null,
              signedFileUrl: currentContract?.signedFileUrl || null,
              signedFilePath: currentContract?.signedFilePath || null,
              signedFileContentType: currentContract?.signedFileContentType || null,
              signedFileSize: currentContract?.signedFileSize ?? null,
              items: approvedQuote.items || [],
            },
          }));
        }
        const winner = selectedQuote?.vendor || 'Fornecedor vencedor';
        budgetApprovalContext = {
          isAdditive,
          winner,
          shouldMoveStatus: targetTicket?.status === TICKET_STATUS.WAITING_BUDGET_APPROVAL,
        };
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
            ? budgetApprovalContext?.isAdditive
              ? `Aditivo aprovado. ${budgetApprovalContext?.winner || selectedQuote?.vendor || 'Fornecedor vencedor'} definido para atualização do valor realizado.`
              : `Orçamento aprovado. ${budgetApprovalContext?.winner || selectedQuote?.vendor || 'Fornecedor vencedor'} definido; aguardando anexo do contrato pelo gestor.`
            : 'Solução técnica aprovada. OS liberada para a etapa de orçamentação.',
      };
      updateTicket(id, {
        status:
          tab === 'budgets'
            ? budgetApprovalContext?.shouldMoveStatus
              ? APPROVAL_STATUS[tab]
              : targetTicket?.status || APPROVAL_STATUS[tab]
            : APPROVAL_STATUS[tab],
        viewingBy: null,
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
        viewingBy: null,
        history: targetTicket ? [...targetTicket.history, historyItem] : undefined,
      });
      setRejectTargetId(null);
    }, 1500);
  };

  const handleApproveContract = (id: string) => {
    if (!canApprove) return;
    const currentContract = contractsByTicket[id];
    const targetTicket = tickets.find(ticket => ticket.id === id);
    const hasSignedAttachment = Boolean(currentContract?.signedFileName || currentContract?.signedFileUrl);
    if (!hasSignedAttachment) {
      setToast('Gestor ainda não anexou o contrato. Aprovação indisponível.');
      setTimeout(() => setToast(null), 3000);
      return;
    }

    setProcessingId(id);
    setTimeout(async () => {
      const nextContract: ContractRecord = {
        ...currentContract,
        status: 'approved',
        viewingBy: null,
      };
      try {
        await saveContract(
          id,
          nextContract,
          targetTicket ? buildProcurementClassification(targetTicket) : undefined
        );
      } catch {
        // Mantém o fluxo local mesmo se a API não estiver disponível no ambiente atual.
      }
      setContractsByTicket(prev => ({ ...prev, [id]: nextContract }));
      setProcessingId(null);
      const historyItem = {
        id: crypto.randomUUID(),
        type: 'system' as const,
        sender: 'Diretoria',
        time: new Date(),
        text: `Contrato aprovado pela Diretoria${nextContract.signedFileName ? ` (${nextContract.signedFileName})` : '.'}`,
      };
      updateTicket(id, {
        status: APPROVAL_STATUS.contracts,
        history: targetTicket ? [...targetTicket.history, historyItem] : undefined,
      });
    }, 1200);
  };

  const handleExportBudgetComparison = (budget: (typeof budgets)[number]) => {
    const quoteGrandTotals = getQuoteGrandTotals(budget.quotes);
    const rows: string[][] = [
      ['OS', budget.id],
      ['Assunto', budget.subject],
      ['Solicitante', budget.requester],
      ['Data', budget.date.toLocaleDateString('pt-BR')],
      ['Macroserviço', budget.macroServiceName ?? ''],
      ['Serviço', budget.serviceCatalogName ?? ''],
      ['Unidade', getProposalHeaderValue(budget.proposalHeader, 'unitName')],
      ['Local', getProposalHeaderValue(budget.proposalHeader, 'location')],
      ['Pasta / Link', getProposalHeaderValue(budget.proposalHeader, 'folderLink')],
      ['Contratado / referência', getProposalHeaderValue(budget.proposalHeader, 'contractedVendor')],
      ['Quantidade total', getProposalHeaderValue(budget.proposalHeader, 'totalQuantity')],
      ['Valor total previsto', getProposalHeaderValue(budget.proposalHeader, 'totalEstimatedValue')],
      [],
      ['Base histórica'],
      ['OS comparáveis', String(budget.historySummary.comparableTicketCount)],
      ['Cotações consideradas', String(budget.historySummary.comparableQuoteCount)],
      ['Média histórica', budget.historySummary.averageQuoteValue != null ? formatBudgetHistoryValue(budget.historySummary.averageQuoteValue) : '-'],
      ['Faixa histórica', `${formatBudgetHistoryValue(budget.historySummary.minQuoteValue)} a ${formatBudgetHistoryValue(budget.historySummary.maxQuoteValue)}`],
      ['Fornecedor preferencial', budget.historySummary.preferredVendor?.vendor ?? '-'],
      ['Referência preferencial', budget.historySummary.preferredVendor?.rationale.join(' | ') ?? '-'],
      ['Rodada em aprovação', budget.roundCategory === 'additive' ? `Aditivo ${budget.roundAdditiveIndex}` : 'Orçamento inicial'],
      ...(budget.roundCategory === 'additive' ? [['Motivo do aditivo', budget.additiveReason || '-']] : []),
      [],
      ['Comparativo de cotações'],
      ['Cotação', 'Fornecedor', 'Material', 'Mão de obra', 'Valor', 'Status', 'Itens'],
      ...budget.quotes.map((quote, index) => [
        `Cotação ${index + 1}`,
        quote.vendor,
        quote.materialValue || '',
        quote.laborValue || '',
        quote.totalValue || quote.value,
        quote.status || 'pending',
        String(quote.items?.length || 0),
      ]),
      [],
      ['Totais gerais por fornecedor'],
      ['Cotação', 'Fornecedor', 'Total geral'],
      ...budget.quotes.map((quote, index) => [
        `Cotação ${index + 1}`,
        quote.vendor,
        quoteGrandTotals[index] > 0 ? quoteGrandTotals[index].toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : (quote.value || '-'),
      ]),
      [],
      ['Itens das cotações'],
      ['Cotação', 'Fornecedor', 'Seção', 'Item', 'Material', 'Unidade', 'Quantidade', 'Custo unitário', 'Valor total'],
      ...budget.quotes.flatMap((quote, index) =>
        (quote.items && quote.items.length > 0
          ? quote.items
          : [{ id: 'sem-itens', description: '', materialName: '', unit: '', quantity: null, totalPrice: '', costUnitPrice: '', section: 'material' }]
        ).map(item => [
          `Cotação ${index + 1}`,
          quote.vendor,
          getQuoteSectionLabel(item.section),
          item.description || 'Sem descrição',
          item.materialName || '',
          item.unit || '',
          item.quantity != null ? String(item.quantity) : '',
          item.costUnitPrice || '',
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
          viewingBy: ticket.viewingBy || null,
          technicalOpinion: [...ticket.history].reverse().find(item => item.type === 'tech')?.text ?? 'Parecer não disponível.',
        })),
    [tickets]
  );

  const budgets = useMemo(
    () =>
      tickets
        .map(ticket => {
          if (ticket.status === TICKET_STATUS.WAITING_CONTRACT_APPROVAL) return null;
          const allQuotes = quotesByTicket[ticket.id] ?? [];
          const pendingRound = resolvePendingRound(allQuotes);
          const shouldInclude =
            ticket.status === TICKET_STATUS.WAITING_BUDGET_APPROVAL ||
            Boolean(pendingRound);
          if (!shouldInclude) return null;

          const currentRound = pendingRound
            ? pendingRound
            : {
                category: 'initial' as const,
                additiveIndex: null,
                quotes: filterQuotesByRound(allQuotes, 'initial'),
              };

          const roundQuotes = currentRound.quotes.filter(isQuoteFilled);
          if (roundQuotes.length === 0) return null;

          return {
            id: ticket.id,
            subject: ticket.subject,
            requester: ticket.requester,
            date: ticket.time,
            viewingBy: ticket.viewingBy || null,
            macroServiceName: ticket.macroServiceName ?? null,
            serviceCatalogName: ticket.serviceCatalogName ?? null,
            quotes: roundQuotes,
            roundCategory: currentRound.category,
            roundAdditiveIndex: currentRound.additiveIndex,
            additiveReason:
              currentRound.category === 'additive'
                ? String(roundQuotes.find(quote => quote.additiveReason)?.additiveReason || '').trim()
                : '',
            proposalHeader: roundQuotes.find(quote => quote.proposalHeader)?.proposalHeader ?? createEmptyProposalHeader(),
            historySummary: buildBudgetHistorySummary(ticket, tickets, quotesByTicket),
          };
        })
        .filter((value): value is {
          id: string;
          subject: string;
          requester: string;
          date: Date;
          viewingBy: { name: string; at: Date } | null;
          macroServiceName: string | null;
          serviceCatalogName: string | null;
          quotes: Quote[];
          roundCategory: 'initial' | 'additive';
          roundAdditiveIndex: number | null;
          additiveReason: string;
          proposalHeader: QuoteProposalHeader;
          historySummary: ReturnType<typeof buildBudgetHistorySummary>;
        } => Boolean(value)),
    [quotesByTicket, tickets]
  );

  useEffect(() => {
    const reviewerName = currentUser?.name?.trim();
    if (!reviewerName) return;

    const clearPreviousReview = () => {
      const previousTicketId = reviewingTicketIdRef.current;
      if (!previousTicketId) return;
      const previousTicket = tickets.find(ticket => ticket.id === previousTicketId);
      if (previousTicket?.viewingBy?.name === reviewerName) {
        updateTicket(previousTicketId, { viewingBy: null });
      }
      reviewingTicketIdRef.current = null;
    };

    if (currentView !== 'approvals' || !activeTicketId || (activeTab !== 'solutions' && activeTab !== 'budgets')) {
      clearPreviousReview();
      return;
    }

    const previousTicketId = reviewingTicketIdRef.current;
    if (previousTicketId && previousTicketId !== activeTicketId) {
      clearPreviousReview();
    }

    const currentTicket = tickets.find(ticket => ticket.id === activeTicketId);
    if (!currentTicket) return;
    if (currentTicket.viewingBy?.name === reviewerName && isReviewStateActive(currentTicket.viewingBy)) {
      reviewingTicketIdRef.current = activeTicketId;
      return;
    }
    if (
      currentTicket.viewingBy?.name &&
      currentTicket.viewingBy.name !== reviewerName &&
      isReviewStateActive(currentTicket.viewingBy)
    ) {
      return;
    }

    const ticketVisibleInActiveTab =
      activeTab === 'solutions'
        ? solutions.some(item => item.id === activeTicketId)
        : budgets.some(item => item.id === activeTicketId);
    if (!ticketVisibleInActiveTab) return;

    updateTicket(activeTicketId, {
      viewingBy: {
        name: reviewerName,
        at: new Date(),
      },
    });
    reviewingTicketIdRef.current = activeTicketId;
  }, [activeTab, activeTicketId, budgets, currentUser?.name, currentView, solutions, tickets, updateTicket]);

  useEffect(() => {
    const reviewerName = currentUser?.name?.trim();
    if (!reviewerName) return undefined;
    if (currentView !== 'approvals' || !activeTicketId || (activeTab !== 'solutions' && activeTab !== 'budgets')) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      const currentTicket = tickets.find(ticket => ticket.id === activeTicketId);
      if (!currentTicket) return;
      if (
        currentTicket.viewingBy?.name &&
        currentTicket.viewingBy.name !== reviewerName &&
        isReviewStateActive(currentTicket.viewingBy)
      ) {
        return;
      }
      updateTicket(activeTicketId, {
        viewingBy: {
          name: reviewerName,
          at: new Date(),
        },
      });
    }, 45000);

    return () => window.clearInterval(interval);
  }, [activeTab, activeTicketId, currentUser?.name, currentView, tickets, updateTicket]);

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
          signedFileName: contractsByTicket[ticket.id]?.signedFileName ?? null,
          signedFileUrl: contractsByTicket[ticket.id]?.signedFileUrl ?? null,
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
        hint: 'Contratos aguardando aprovação',
        active: activeTab === 'contracts',
      },
    ],
    [activeTab, budgets.length, contracts.length, solutions.length]
  );

  const activeTicketTab = useMemo(() => {
    if (!activeTicketId) return null;
    if (contracts.some(item => item.id === activeTicketId)) return 'contracts' as const;
    if (solutions.some(item => item.id === activeTicketId)) return 'solutions' as const;
    if (budgets.some(item => item.id === activeTicketId)) return 'budgets' as const;
    return null;
  }, [activeTicketId, budgets, contracts, solutions]);

  useEffect(() => {
    if (typeof window === 'undefined' || currentView !== 'approvals') return;
    if (approvalQueryAppliedRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const requestedTab = params.get('approvalTab');
    const requestedTicketId = params.get('ticketId');

    if (requestedTab === 'solutions' || requestedTab === 'budgets' || requestedTab === 'contracts') {
      setActiveTab(requestedTab);
    }

    if (requestedTicketId && requestedTicketId !== activeTicketId) {
      setActiveTicketId(requestedTicketId);
    }

    if (requestedTab === 'budgets' && requestedTicketId) {
      const targetBudget = budgets.find(item => item.id === requestedTicketId);
      if (!targetBudget) return;
      window.setTimeout(() => {
        document.getElementById(`approval-budget-${requestedTicketId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 120);
    }
    params.delete('approvalTab');
    params.delete('ticketId');
    const query = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
    approvalQueryAppliedRef.current = true;
  }, [activeTicketId, budgets, currentView, setActiveTicketId]);

  useEffect(() => {
    if (currentView !== 'approvals' || !activeTicketId || !activeTicketTab) return;
    if (activeTicketSyncRef.current === activeTicketId) return;
    setActiveTab(activeTicketTab);
    const targetId =
      activeTicketTab === 'solutions'
        ? `approval-solution-${activeTicketId}`
        : activeTicketTab === 'budgets'
          ? `approval-budget-${activeTicketId}`
          : `approval-contract-${activeTicketId}`;
    window.setTimeout(() => {
      document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
    activeTicketSyncRef.current = activeTicketId;
  }, [activeTicketId, activeTicketTab, currentView]);

  return (
    <div className="flex-1 overflow-y-auto bg-roman-bg p-4 md:p-5 xl:p-8 relative">
      {toast && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 px-6 py-3 rounded-sm shadow-lg flex items-center gap-3 z-[100] animate-in slide-in-from-top-4 fade-in bg-green-800 text-white">
          <CheckCircle size={18} />
          <span className="font-medium text-sm">{toast}</span>
        </div>
      )}
      <div className="max-w-6xl mx-auto">
        <header className="mb-5 rounded-2xl border border-roman-border bg-roman-surface px-5 py-5 shadow-sm md:px-6">
          <div>
            <h1 className="text-[2rem] font-serif font-medium text-roman-text-main mb-1.5">Painel da Diretoria</h1>
            <p className="text-sm text-roman-text-sub font-serif italic">Soluções, orçamentos e contratos organizados em um fluxo único de decisão.</p>
          </div>
          <div className="mt-4 flex bg-roman-bg border border-roman-border rounded-full p-1 shadow-sm overflow-x-auto hide-scrollbar md:mt-5">
            <button onClick={() => setActiveTab('solutions')} className={`px-4 py-2 text-sm font-medium rounded-full transition-colors whitespace-nowrap ${activeTab === 'solutions' ? 'bg-roman-primary/10 text-roman-primary' : 'text-roman-text-sub hover:text-roman-text-main'}`}>
              Soluções ({solutions.length})
            </button>
            <button onClick={() => setActiveTab('budgets')} className={`px-4 py-2 text-sm font-medium rounded-full transition-colors whitespace-nowrap ${activeTab === 'budgets' ? 'bg-roman-primary/10 text-roman-primary' : 'text-roman-text-sub hover:text-roman-text-main'}`}>
              Orçamentos ({budgets.length})
            </button>
            <button onClick={() => setActiveTab('contracts')} className={`px-4 py-2 text-sm font-medium rounded-full transition-colors whitespace-nowrap ${activeTab === 'contracts' ? 'bg-roman-primary/10 text-roman-primary' : 'text-roman-text-sub hover:text-roman-text-main'}`}>
              Contratos ({contracts.length})
            </button>
          </div>
        </header>

        <div className="mb-5 grid gap-3 md:grid-cols-3">
          {approvalSummary.map(item => (
            <button
              key={item.label}
              type="button"
              onClick={() => setActiveTab(item.label.toLowerCase() === 'soluções' ? 'solutions' : item.label.toLowerCase() === 'orçamentos' ? 'budgets' : 'contracts')}
              className={`rounded-2xl border p-4 text-left transition-colors shadow-sm ${
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

        <div className="space-y-5">
          {activeTab === 'solutions' && solutions.map(solution => (
            <div
              key={solution.id}
              id={`approval-solution-${solution.id}`}
              className={`bg-roman-surface border rounded-2xl p-4 md:p-5 shadow-sm transition-colors relative overflow-hidden ${
                solution.id === activeTicketId
                  ? 'border-roman-primary/60 ring-1 ring-roman-primary/20 bg-roman-primary/5'
                  : 'border-roman-border hover:border-roman-primary/30'
              }`}
            >
              {processingId === solution.id && (
                <div className="absolute inset-0 bg-roman-surface/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center rounded-2xl">
                  <Loader2 size={32} className="text-roman-primary animate-spin mb-4" />
                  <span className="font-serif text-roman-text-main font-medium">Processando decisão...</span>
                </div>
              )}
              <div className="flex items-center justify-between mb-4 border-b border-roman-border pb-3">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <span className="text-roman-primary font-serif italic text-sm">{solution.id}</span>
                    <span className="text-xs text-roman-text-sub font-medium px-2 py-0.5 bg-roman-bg border border-roman-border rounded-sm">Aguardando Aprovação da Solução</span>
                    {solution.viewingBy &&
                      isReviewStateActive(solution.viewingBy) &&
                      solution.viewingBy.name !== (currentUser?.name || '').trim() && (
                      <span className="text-xs text-roman-primary font-medium px-2 py-0.5 bg-roman-primary/10 border border-roman-primary/30 rounded-sm">
                        Sendo revisado por {solution.viewingBy.name}
                      </span>
                    )}
                  </div>
                  <h3 className="text-lg md:text-xl font-serif text-roman-text-main">{solution.subject}</h3>
                  <p className="text-sm text-roman-text-sub">Solicitante: {solution.requester} · Parecer emitido: {formatDateTimeSafe(solution.date)}</p>
                </div>
              </div>
              <div className="bg-roman-bg border border-roman-border rounded-xl p-3.5 mb-5">
                <h4 className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-2 font-bold flex items-center gap-2"><FileText size={14} /> Parecer Técnico</h4>
                <p className="text-sm text-roman-text-main leading-relaxed">{solution.technicalOpinion}</p>
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={() => openRejectModal(solution.id)} disabled={processingId === solution.id} className="px-5 py-2 border border-red-200 text-red-700 hover:bg-red-50 rounded-xl font-medium transition-colors text-sm disabled:cursor-not-allowed disabled:opacity-50">
                  Reprovar Solução (Arquivar)
                </button>
                <button onClick={() => handleApprove(solution.id, 'solutions')} disabled={processingId === solution.id} className="px-5 py-2 bg-roman-sidebar hover:bg-stone-900 text-white rounded-xl font-medium transition-colors text-sm flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-60">
                  {processingId === solution.id ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                  {processingId === solution.id ? 'Processando...' : 'Aprovar (Ir para Cotação)'}
                </button>
              </div>
            </div>
          ))}

          {activeTab === 'budgets' && budgets.map(budget => (
            <div
              key={budget.id}
              id={`approval-budget-${budget.id}`}
              className={`bg-roman-surface border rounded-2xl p-4 md:p-5 shadow-sm transition-colors relative overflow-hidden ${
                budget.id === activeTicketId ? 'border-roman-primary/50 ring-1 ring-roman-primary/20' : 'border-roman-border hover:border-roman-primary/30'
              }`}
            >
              {(() => {
                const quoteGrandTotals = getQuoteGrandTotals(budget.quotes);
                return (
                  <>
              {processingId === budget.id && (
                <div className="absolute inset-0 bg-roman-surface/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center rounded-2xl">
                  <Loader2 size={32} className="text-roman-primary animate-spin mb-4" />
                  <span className="font-serif text-roman-text-main font-medium">Processando decisão...</span>
                </div>
              )}
              <div className="flex items-center justify-between mb-4 border-b border-roman-border pb-3">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <span className="text-roman-primary font-serif italic text-sm">{budget.id}</span>
                    <span className="text-xs text-roman-text-sub font-medium px-2 py-0.5 bg-roman-bg border border-roman-border rounded-sm">Aguardando Aprovação</span>
                    <span className="text-xs text-roman-text-sub font-medium px-2 py-0.5 bg-roman-bg border border-roman-border rounded-sm">
                      {budget.roundCategory === 'additive' ? `Aditivo ${budget.roundAdditiveIndex}` : 'Orçamento inicial'}
                    </span>
                    {budget.viewingBy &&
                      isReviewStateActive(budget.viewingBy) &&
                      budget.viewingBy.name !== (currentUser?.name || '').trim() && (
                      <span className="text-xs text-roman-primary font-medium px-2 py-0.5 bg-roman-primary/10 border border-roman-primary/30 rounded-sm">
                        Sendo revisado por {budget.viewingBy.name}
                      </span>
                    )}
                  </div>
                  <h3 className="text-lg md:text-xl font-serif text-roman-text-main">{budget.subject}</h3>
                  <p className="text-sm text-roman-text-sub">Solicitante: {budget.requester} • Enviado: {formatDateTimeSafe(budget.date)}</p>
                  {budget.roundCategory === 'additive' && (
                    <div className="mt-2 rounded-sm border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      <span className="font-medium">Motivo do aditivo:</span> {budget.additiveReason || 'Não informado'}
                    </div>
                  )}
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
                    onClick={() => handleExportBudgetComparison(budget)}
                    className="px-4 py-2 border border-roman-border text-roman-text-main hover:bg-roman-bg rounded-sm font-medium transition-colors text-sm flex items-center gap-2"
                  >
                    <Download size={14} /> Exportar CSV
                  </button>
                  <button
                    onClick={() => openRejectModal(budget.id)}
                    disabled={processingId === budget.id}
                    className="px-4 py-2 border border-red-200 text-red-700 hover:bg-red-50 rounded-sm font-medium transition-colors text-sm disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Reprovar Todas
                  </button>
                </div>
              </div>

              <div className="mb-4 rounded-2xl border border-roman-border bg-roman-bg p-4">
                <div className="text-[10px] uppercase tracking-[0.24em] text-roman-text-sub">Cabeçalho da proposta</div>
                <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {[
                    ['Unidade', getProposalHeaderValue(budget.proposalHeader, 'unitName')],
                    ['Local', getProposalHeaderValue(budget.proposalHeader, 'location')],
                    ['Pasta / Link', getProposalHeaderValue(budget.proposalHeader, 'folderLink')],
                    ['Contratado / referência', getProposalHeaderValue(budget.proposalHeader, 'contractedVendor')],
                    ['Quantidade total', getProposalHeaderValue(budget.proposalHeader, 'totalQuantity')],
                    ['Valor total previsto', getProposalHeaderValue(budget.proposalHeader, 'totalEstimatedValue')],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl border border-roman-border/80 bg-roman-surface px-3 py-3">
                      <div className="text-[10px] uppercase tracking-[0.22em] text-roman-text-sub">{label}</div>
                      <div className="mt-1 text-sm text-roman-text-main break-words">{value || '-'}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                {budget.quotes.map((quote, index) => (
                  <div key={`approval-quote-total-${quote.id}`} className="rounded-2xl border border-roman-border bg-roman-bg px-4 py-3">
                    <div className="text-[10px] uppercase tracking-[0.22em] text-roman-text-sub">Cotação {index + 1}</div>
                    <div className="mt-1 text-sm font-medium text-roman-text-main break-words">
                      {quote.vendor || 'Fornecedor não informado'}
                    </div>
                    <div className="mt-2 text-[11px] text-roman-text-sub">Total geral da proposta</div>
                    <div className="mt-1 text-lg font-serif text-roman-text-main">
                      {quoteGrandTotals[index] > 0
                        ? quoteGrandTotals[index].toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                        : quote.value || '-'}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mb-4 rounded-2xl border border-roman-border bg-roman-bg p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.24em] text-roman-text-sub">Comparativo consolidado</div>
                    <div className="mt-1 text-sm text-roman-text-sub">Leitura lado a lado dos itens e subtotais por fornecedor.</div>
                  </div>
                </div>
                <div className="mt-4 space-y-4">
                  {buildQuoteComparisonSections(budget.quotes).map(section => (
                    <div key={section.key} className="rounded-2xl border border-roman-border/80 bg-roman-surface">
                      <div className="border-b border-roman-border/70 px-4 py-3">
                        <div className="text-sm font-medium text-roman-text-main">{section.label}</div>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                          <thead className="bg-roman-bg/70 text-roman-text-sub">
                            <tr>
                              <th className="px-3 py-2 text-left font-medium">Descrição</th>
                              <th className="px-3 py-2 text-left font-medium">Qtd.</th>
                              <th className="px-3 py-2 text-left font-medium">Und.</th>
                              {budget.quotes.map((quote, index) => (
                                <th key={quote.id} className="px-3 py-2 text-left font-medium min-w-[12rem]">
                                  <div className="text-roman-text-main">Cotação {index + 1}</div>
                                  <div className="text-[11px] text-roman-text-sub">{quote.vendor || 'Fornecedor não informado'}</div>
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {section.rows.map(row => (
                              <tr key={row.key} className="border-t border-roman-border/60 align-top">
                                <td className="px-3 py-3 text-roman-text-main">{row.description}</td>
                                <td className="px-3 py-3 text-roman-text-sub">{row.quantity || '-'}</td>
                                <td className="px-3 py-3 text-roman-text-sub">{row.unit || '-'}</td>
                                {row.values.map((value, index) => (
                                  <td key={`${row.key}-${index}`} className="px-3 py-3">
                                    {!value.costUnitPrice && !value.chargedTotalPrice ? (
                                      <div className="rounded-lg border border-dashed border-roman-border/80 bg-roman-bg px-3 py-2 text-center text-[11px] text-roman-text-sub">
                                        Não cotado nesta proposta
                                      </div>
                                    ) : (
                                      <div className="space-y-1 text-[12px]">
                                        <div className="flex items-center justify-between gap-3">
                                          <span className="text-roman-text-sub">Custo</span>
                                          <span className="text-roman-text-main">{value.costUnitPrice || '-'}</span>
                                        </div>
                                        <div className="flex items-center justify-between gap-3 font-medium">
                                          <span className="text-roman-text-sub">Valor cobrado</span>
                                          <span className="text-roman-text-main">{value.chargedTotalPrice || '-'}</span>
                                        </div>
                                      </div>
                                    )}
                                  </td>
                                ))}
                              </tr>
                            ))}
                            <tr className="border-t border-roman-border bg-roman-bg/60">
                              <td className="px-3 py-3 font-medium text-roman-text-main" colSpan={3}>Subtotal da seção</td>
                              {section.subtotals.map((subtotal, index) => (
                                <td key={`${section.key}-subtotal-${index}`} className="px-3 py-3 font-medium text-roman-text-main">
                                  {subtotal > 0 ? subtotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '-'}
                                </td>
                              ))}
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                  <div className="rounded-2xl border border-roman-primary/20 bg-roman-primary/5 overflow-hidden">
                    <table className="min-w-full text-sm">
                      <tbody>
                        <tr>
                          <td className="px-3 py-3 font-medium text-roman-text-main">Total geral por fornecedor</td>
                          {budget.quotes.map((quote, index) => (
                            <td key={`approval-grand-total-${quote.id}`} className="px-3 py-3 font-semibold text-roman-text-main min-w-[12rem]">
                              {quoteGrandTotals[index] > 0
                                ? quoteGrandTotals[index].toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                                : quote.value || '-'}
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {budget.quotes.map(quote => (
                  <div key={quote.id} className="border rounded-sm p-4 flex flex-col border-roman-border bg-roman-bg">
                    {budget.historySummary.preferredVendor && quote.vendor.trim().toLowerCase() === budget.historySummary.preferredVendor.vendor.trim().toLowerCase() && (
                      <div className="text-[10px] font-serif uppercase tracking-widest text-emerald-700 mb-2 font-bold">
                        Histórico favorece este fornecedor
                      </div>
                    )}
                    <div className="text-sm text-roman-text-sub mb-1">{quote.vendor}</div>
                    <div className="text-2xl font-serif text-roman-text-main mb-2">{quote.totalValue || quote.value}</div>
                    <div className="mb-4 text-[11px] text-roman-text-sub space-y-1">
                      <div>Material: {quote.materialValue || '-'}</div>
                      <div>Mão de obra: {quote.laborValue || '-'}</div>
                    </div>
                    {quote.items && quote.items.length > 0 && (
                      <div className="mb-4 rounded-sm border border-roman-border/70 bg-roman-surface px-3 py-2">
                        <div className="text-[10px] uppercase tracking-widest text-roman-text-sub mb-2">Composição</div>
                        <div className="space-y-1">
                          {quote.items.slice(0, 3).map(item => (
                            <div key={item.id} className="text-[11px] text-roman-text-sub flex items-start justify-between gap-3">
                              <span className="truncate">{item.description || item.materialName || 'Item sem descrição'}</span>
                              <span className="shrink-0 text-roman-text-main">{item.totalPrice || '-'}</span>
                            </div>
                          ))}
                        </div>
                        <div className="mt-2 text-[11px] text-roman-text-sub">
                          {quote.items.length} item(ns) no orçamento
                        </div>
                      </div>
                    )}
                    <div className="mt-auto flex flex-col gap-2">
                      <button
                        onClick={() => openAttachment(`Orçamento: ${quote.vendor}`, 'pdf', { url: quote.attachmentUrl || null })}
                        disabled={!quote.attachmentUrl}
                        className="flex items-center justify-center gap-2 text-roman-text-sub hover:text-roman-text-main text-xs font-medium border border-roman-border bg-roman-surface py-1.5 rounded-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <FileText size={14} /> {quote.attachmentUrl ? 'Ver PDF' : 'PDF indisponível'}
                      </button>
                      <button
                        onClick={() => handleApprove(budget.id, 'budgets', quote)}
                        disabled={processingId === budget.id}
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
                  <div className="text-xs text-roman-text-sub md:max-w-[48%]">
                    <div className="mb-1">Termos:</div>
                    {budget.historySummary.basisTerms.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {budget.historySummary.basisTerms.map(term => (
                          <span
                            key={`${budget.id}-basis-term-${term}`}
                            className="rounded-sm border border-roman-border bg-roman-surface px-2 py-0.5 text-[11px] text-roman-text-main"
                          >
                            {term}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div>não definidos</div>
                    )}
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
                  </>
                );
              })()}
            </div>
          ))}

          {activeTab === 'contracts' && contracts.map(contract => (
            <div
              key={contract.id}
              id={`approval-contract-${contract.id}`}
              className={`bg-roman-parchment border rounded-2xl p-4 md:p-5 flex flex-col md:flex-row gap-5 items-start md:items-center shadow-sm relative overflow-hidden ${
                contract.id === activeTicketId
                  ? 'border-roman-primary/60 ring-1 ring-roman-primary/20 bg-roman-primary/5'
                  : 'border-roman-parchment-border'
              }`}
            >
              {processingId === contract.id && (
                <div className="absolute inset-0 bg-roman-parchment/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center rounded-2xl">
                  <Loader2 size={32} className="text-roman-primary animate-spin mb-4" />
                  <span className="font-serif text-roman-text-main font-medium">Processando aprovação...</span>
                </div>
              )}
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-stone-800 font-serif italic text-sm">{contract.id}</span>
                  <span className="text-xs text-stone-600 font-medium px-2 py-0.5 bg-white/50 border border-stone-300 rounded-sm">Aguardando Aprovação do Contrato</span>
                  <span className="text-xs text-stone-500 ml-auto">{formatDateTimeSafe(contract.date)}</span>
                </div>
                <h3 className="text-lg md:text-xl font-serif text-stone-900 mb-1">{contract.subject}</h3>
                <p className="text-sm text-stone-600 mb-4">Solicitante: {contract.requester} • Contratada: {contract.vendor}</p>
                <div className="mb-3 text-xs text-stone-600">
                  Arquivo anexado pelo gestor:{' '}
                  <span className="font-medium text-stone-800">
                    {resolveAttachmentLabel(contract.signedFileName, contract.signedFileUrl)}
                  </span>
                </div>
                {!(contract.signedFileName || contract.signedFileUrl) && (
                  <div className="mb-3 rounded-sm border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    Contrato sem anexo válido. Peça ao gestor para reenviar pela Inbox em “Anexar Contrato e Enviar para Diretoria”.
                  </div>
                )}
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
                          <span className="shrink-0">{item.totalPrice || '-'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <button
                  onClick={() => openAttachment(`Contrato: ${contract.vendor}`, 'pdf', { url: contract.signedFileUrl || null })}
                  disabled={!contract.signedFileUrl}
                  className="flex items-center gap-2 text-stone-800 hover:underline text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 disabled:no-underline"
                >
                  <FileText size={16} /> Ver contrato anexado (PDF)
                </button>
              </div>

              <div className="w-full md:w-auto flex flex-col items-end gap-4 border-t md:border-t-0 md:border-l border-stone-300 pt-4 md:pt-0 md:pl-6">
                <div className="text-right">
                  <div className="text-[10px] font-serif uppercase tracking-widest text-stone-500 mb-1">Valor do Contrato</div>
                  <div className="text-2xl font-serif text-stone-900">{contract.value}</div>
                </div>
                <div className="flex gap-2 w-full md:w-auto">
                  <button
                    onClick={() => openAttachment(`Contrato: ${contract.vendor}`, 'pdf', { url: contract.signedFileUrl || null })}
                    disabled={!contract.signedFileUrl}
                    className="flex-1 md:flex-none px-4 py-2 border border-stone-300 text-stone-700 hover:bg-white/50 rounded-sm font-medium transition-colors text-sm disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Revisar
                  </button>
                  <button
                    onClick={() => handleApproveContract(contract.id)}
                    disabled={processingId === contract.id || !(contract.signedFileName || contract.signedFileUrl)}
                    className="flex-1 md:flex-none px-6 py-2 bg-roman-primary hover:bg-roman-primary-hover text-white rounded-sm font-medium transition-colors text-sm flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {processingId === contract.id ? <Loader2 size={16} className="animate-spin" /> : <Shield size={16} />}
                    {processingId === contract.id ? 'Processando...' : 'Aprovar Contrato'}
                  </button>
                </div>
              </div>
            </div>
          ))}

          {activeTab === 'contracts' && contracts.length === 0 && (
            <div className="text-center py-12 border border-dashed border-roman-border rounded-2xl bg-roman-surface/70">
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

    </div>
  );
}

