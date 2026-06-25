import { useState } from 'react';
import type { ProposalHeaderDraft, QuoteDraft } from './types';
import { INITIAL_MIN_QUOTE_SLOTS, createEmptyQuoteDraft, createProposalHeaderDraft } from './quotes';

/**
 * Estado do editor de Cotações. 1º bite da extração do "cérebro" do modal de
 * Cotações para fora do InboxView (o god-component): por enquanto só o ESTADO.
 * Os handlers e os derivados (useMemo) entram nos próximos bites, e depois um
 * Context elimina o prop-drilling dos componentes em `inbox/`.
 *
 * É um move behavior-identical: os mesmos `useState`, na mesma ordem, chamados
 * incondicionalmente — só que agrupados aqui em vez de espalhados pelo InboxView.
 */
export function useQuoteEditor() {
  const [showQuotesModal, setShowQuotesModal] = useState(false);
  const [quoteAttachments, setQuoteAttachments] = useState<Array<File | null>>(
    Array.from({ length: INITIAL_MIN_QUOTE_SLOTS }, () => null)
  );
  const [pendingCustomUnitByItem, setPendingCustomUnitByItem] = useState<Record<string, string>>({});
  const [additionalQuoteUnits, setAdditionalQuoteUnits] = useState<string[]>([]);
  const [quotes, setQuotes] = useState<QuoteDraft[]>(
    Array.from({ length: INITIAL_MIN_QUOTE_SLOTS }, () => createEmptyQuoteDraft())
  );
  const [quoteRoundType, setQuoteRoundType] = useState<'initial' | 'additive'>('initial');
  const [quoteInitialRoundIndex, setQuoteInitialRoundIndex] = useState(1);
  const [quoteAdditiveIndex, setQuoteAdditiveIndex] = useState(1);
  const [showQuoteDirectorInterests, setShowQuoteDirectorInterests] = useState(false);
  const [showQuoteContextPanel, setShowQuoteContextPanel] = useState(false);
  const [showQuoteHistoryPanel, setShowQuoteHistoryPanel] = useState(false);
  const [showQuoteComparisonPanel, setShowQuoteComparisonPanel] = useState(false);
  const [showAdditiveReference, setShowAdditiveReference] = useState(true);
  const [quoteEditorFocus, setQuoteEditorFocus] = useState<number | 'all'>(0);
  const [expandedQuoteItems, setExpandedQuoteItems] = useState<Record<string, boolean>>({});
  const [proposalHeader, setProposalHeader] = useState<ProposalHeaderDraft>(createProposalHeaderDraft());

  return {
    showQuotesModal, setShowQuotesModal,
    quoteAttachments, setQuoteAttachments,
    pendingCustomUnitByItem, setPendingCustomUnitByItem,
    additionalQuoteUnits, setAdditionalQuoteUnits,
    quotes, setQuotes,
    quoteRoundType, setQuoteRoundType,
    quoteInitialRoundIndex, setQuoteInitialRoundIndex,
    quoteAdditiveIndex, setQuoteAdditiveIndex,
    showQuoteDirectorInterests, setShowQuoteDirectorInterests,
    showQuoteContextPanel, setShowQuoteContextPanel,
    showQuoteHistoryPanel, setShowQuoteHistoryPanel,
    showQuoteComparisonPanel, setShowQuoteComparisonPanel,
    showAdditiveReference, setShowAdditiveReference,
    quoteEditorFocus, setQuoteEditorFocus,
    expandedQuoteItems, setExpandedQuoteItems,
    proposalHeader, setProposalHeader,
  };
}
