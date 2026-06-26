import { useEffect, useMemo, useState } from 'react';
import { formatCurrency as formatCurrencyInput, normalizeCurrencyInput, parseCurrency as parseCurrencyInput, sanitizeCurrencyTypingInput } from '../../utils/currency';
import type { CatalogMaterial } from '../../services/catalogApi';
import type { QuoteItem, Ticket } from '../../types';
import type { ProposalHeaderDraft, QuoteDraft } from './types';
import { CUSTOM_QUOTE_UNIT_VALUE, DEFAULT_QUOTE_UNIT_OPTIONS, INITIAL_MIN_QUOTE_SLOTS, buildQuoteComparison, buildQuoteItemUnitKey, createEmptyQuoteDraft, createEmptyQuoteItem, createProposalHeaderDraft, normalizeQuoteSection, normalizeUnitAbbreviation, summarizeQuoteDraft } from './quotes';

interface UseQuoteEditorArgs {
  activeTicket: Ticket;
  catalogMaterials: CatalogMaterial[];
  suggestedQuoteMaterials: CatalogMaterial[];
  getRoundMinQuoteSlots: (roundType: 'initial' | 'additive') => number;
  getRoundMaxQuoteSlots: (roundType: 'initial' | 'additive') => number;
}

/**
 * Estado do editor de Cotações. 1º bite da extração do "cérebro" do modal de
 * Cotações para fora do InboxView (o god-component): por enquanto só o ESTADO.
 * Os handlers e os derivados (useMemo) entram nos próximos bites, e depois um
 * Context elimina o prop-drilling dos componentes em `inbox/`.
 *
 * É um move behavior-identical: os mesmos `useState`, na mesma ordem, chamados
 * incondicionalmente — só que agrupados aqui em vez de espalhados pelo InboxView.
 */
export function useQuoteEditor({ activeTicket, catalogMaterials, suggestedQuoteMaterials, getRoundMinQuoteSlots, getRoundMaxQuoteSlots }: UseQuoteEditorArgs) {
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


  const handleQuoteChange = (index: number, field: 'vendor' | 'value', value: string) => {
  // Imutável: [...quotes] é cópia rasa e mutar newQuotes[index][field] alteraria
  // o objeto de estado original (render obsoleto). Usa .map como o blur faz.
  setQuotes(current =>
    current.map((quote, quoteIndex) =>
      quoteIndex === index
        ? { ...quote, [field]: field === 'value' ? sanitizeCurrencyTypingInput(value) : value }
        : quote
    )
  );
};

  const handleQuoteCurrencyBlur = (index: number, field: 'value') => {
    setQuotes(current =>
      current.map((quote, quoteIndex) =>
        quoteIndex === index
          ? {
              ...quote,
              [field]: normalizeCurrencyInput(quote[field]),
            }
          : quote
      )
    );
  };

  const handleProposalHeaderChange = (field: keyof ProposalHeaderDraft, value: string) => {
    setProposalHeader(current => ({
      ...current,
      [field]: field === 'totalEstimatedValue' ? sanitizeCurrencyTypingInput(value) : value,
    }));
  };

  const handleProposalCurrencyBlur = (field: keyof ProposalHeaderDraft) => {
    setProposalHeader(current => ({
      ...current,
      [field]: field === 'totalEstimatedValue' ? normalizeCurrencyInput(String(current[field] || '')) : current[field],
    }));
  };

  const recalculateQuoteValue = (draft: QuoteDraft) => {
    const computedTotal = draft.items.reduce((sum, item) => {
      const quantity = item.quantity ?? 0;
      const costUnitPrice = item.costUnitPrice ? parseCurrencyInput(item.costUnitPrice) : 0;
      if (quantity > 0 && costUnitPrice > 0) return sum + quantity * costUnitPrice;
      const totalPrice = item.totalPrice ? parseCurrencyInput(item.totalPrice) : 0;
      return sum + totalPrice;
    }, 0);
    const breakdown = summarizeQuoteDraft(draft);

    return {
      ...draft,
      value: computedTotal > 0 ? formatCurrencyInput(computedTotal) : draft.value,
      laborValue: breakdown.laborValue,
      materialValue: breakdown.materialValue,
      totalValue: breakdown.totalValue,
    };
  };

  const handleQuoteItemChange = (quoteIndex: number, itemId: string, field: keyof QuoteItem, value: string | number | null) => {
    setQuotes(current =>
      current.map((quote, index) => {
        if (index !== quoteIndex) return quote;
        const items = quote.items.map(item => {
          if (item.id !== itemId) return item;
          const nextItem: QuoteItem = { ...item, [field]: value as never };
          if (field === 'materialId') {
            const material = catalogMaterials.find(entry => entry.id === value);
            nextItem.materialId = material?.id || null;
            nextItem.materialName = material?.name || null;
            nextItem.unit = normalizeUnitAbbreviation(material?.unit || item.unit) || null;
            if (!nextItem.description) {
              nextItem.description = material?.name || '';
            }
          }
          if (field === 'materialName') {
            nextItem.materialId = null;
            nextItem.materialName = value ? String(value) : null;
          }
          if (field === 'unit') {
            nextItem.unit = normalizeUnitAbbreviation(typeof value === 'string' ? value : null) || null;
          }
          if (field === 'section') {
            nextItem.section = normalizeQuoteSection(typeof value === 'string' ? value : null);
          }
          if (field === 'costUnitPrice' || field === 'totalPrice') {
            nextItem[field] = typeof value === 'string' ? sanitizeCurrencyTypingInput(value) : null;
          }
          if (field === 'quantity' || field === 'costUnitPrice') {
            const quantity = nextItem.quantity ?? 0;
            const costUnitPrice = nextItem.costUnitPrice ? parseCurrencyInput(nextItem.costUnitPrice) : 0;
            if (quantity > 0 && costUnitPrice > 0) {
              nextItem.totalPrice = formatCurrencyInput(quantity * costUnitPrice);
            } else {
              nextItem.totalPrice = null;
            }
          }
          return nextItem;
        });
        return recalculateQuoteValue({ ...quote, items });
      })
    );
  };

  const handleQuoteItemCurrencyBlur = (quoteIndex: number, itemId: string, field: 'costUnitPrice') => {
    setQuotes(current =>
      current.map((quote, index) => {
        if (index !== quoteIndex) return quote;
        const items = quote.items.map(item => {
          if (item.id !== itemId) return item;
          const nextItem: QuoteItem = { ...item };
          nextItem[field] = normalizeCurrencyInput(String(nextItem[field] || ''));
          const quantity = nextItem.quantity ?? 0;
          const costUnitPrice = nextItem.costUnitPrice ? parseCurrencyInput(nextItem.costUnitPrice) : 0;
          if (quantity > 0 && costUnitPrice > 0) {
            nextItem.totalPrice = formatCurrencyInput(quantity * costUnitPrice);
          } else {
            nextItem.totalPrice = null;
          }
          return nextItem;
        });
        return recalculateQuoteValue({ ...quote, items });
      })
    );
  };

  const buildQuoteEditorItemKey = (quoteIndex: number, itemId: string) => `${quoteIndex}:${itemId}`;

  const isQuoteItemExpanded = (quoteIndex: number, itemId: string) =>
    expandedQuoteItems[buildQuoteEditorItemKey(quoteIndex, itemId)] ?? false;

  const toggleQuoteItemExpanded = (quoteIndex: number, itemId: string) => {
    const key = buildQuoteEditorItemKey(quoteIndex, itemId);
    setExpandedQuoteItems(current => ({ ...current, [key]: !current[key] }));
  };

  const setAllQuoteItemsExpanded = (quoteIndex: number, expanded: boolean) => {
    setExpandedQuoteItems(current => {
      const next = { ...current };
      const quote = quotes[quoteIndex];
      if (!quote) return next;
      quote.items.forEach(item => {
        next[buildQuoteEditorItemKey(quoteIndex, item.id)] = expanded;
      });
      return next;
    });
  };

  const handleQuoteItemUnitSelect = (quoteIndex: number, itemId: string, selectedValue: string) => {
    const itemKey = buildQuoteItemUnitKey(quoteIndex, itemId);
    if (selectedValue === CUSTOM_QUOTE_UNIT_VALUE) {
      setPendingCustomUnitByItem(current => ({ ...current, [itemKey]: '' }));
      return;
    }
    setPendingCustomUnitByItem(current => {
      if (!(itemKey in current)) return current;
      const next = { ...current };
      delete next[itemKey];
      return next;
    });
    handleQuoteItemChange(quoteIndex, itemId, 'unit', selectedValue || null);
  };

  const handleQuoteItemCustomUnitSave = (quoteIndex: number, itemId: string) => {
    const itemKey = buildQuoteItemUnitKey(quoteIndex, itemId);
    const normalized = normalizeUnitAbbreviation(pendingCustomUnitByItem[itemKey]);
    if (!normalized) return;

    setAdditionalQuoteUnits(current => (current.includes(normalized) ? current : [...current, normalized]));
    handleQuoteItemChange(quoteIndex, itemId, 'unit', normalized);
    setPendingCustomUnitByItem(current => {
      const next = { ...current };
      delete next[itemKey];
      return next;
    });
  };

  const handleAddQuoteItem = (quoteIndex: number) => {
    const newItem = createEmptyQuoteItem(activeTicket.serviceCatalogName || '', suggestedQuoteMaterials[0]?.unit || '');
    setQuotes(current =>
      current.map((quote, index) =>
        index === quoteIndex ? { ...quote, items: [...quote.items, newItem] } : quote
      )
    );
    setExpandedQuoteItems(current => ({ ...current, [buildQuoteEditorItemKey(quoteIndex, newItem.id)]: true }));
  };

  const handleAddMultipleQuoteItems = (quoteIndex: number, count: number) => {
    const safeCount = Math.max(1, Math.min(20, Number(count || 1)));
    const newItems = Array.from({ length: safeCount }, () =>
      createEmptyQuoteItem(activeTicket.serviceCatalogName || '', suggestedQuoteMaterials[0]?.unit || '')
    );

    setQuotes(current =>
      current.map((quote, index) =>
        index === quoteIndex ? { ...quote, items: [...quote.items, ...newItems] } : quote
      )
    );

    setExpandedQuoteItems(current => {
      const next = { ...current };
      newItems.forEach((item, itemIndex) => {
        next[buildQuoteEditorItemKey(quoteIndex, item.id)] = itemIndex === 0;
      });
      return next;
    });
  };

  const handleRemoveQuoteItem = (quoteIndex: number, itemId: string) => {
    const itemKey = buildQuoteItemUnitKey(quoteIndex, itemId);
    const editorKey = buildQuoteEditorItemKey(quoteIndex, itemId);
    setPendingCustomUnitByItem(current => {
      if (!(itemKey in current)) return current;
      const next = { ...current };
      delete next[itemKey];
      return next;
    });
    setExpandedQuoteItems(current => {
      if (!(editorKey in current)) return current;
      const next = { ...current };
      delete next[editorKey];
      return next;
    });
    setQuotes(current =>
      current.map((quote, index) => {
        if (index !== quoteIndex) return quote;
        const remaining = quote.items.filter(item => item.id !== itemId);
        return recalculateQuoteValue({
          ...quote,
          items: remaining.length > 0 ? remaining : [createEmptyQuoteItem()],
        });
      })
    );
  };

  const handleQuoteAttachmentChange = (index: number, file: File | null) => {
    setQuoteAttachments(prev => prev.map((item, i) => (i === index ? file : item)));
  };

  const handleAddQuoteSlot = () => {
    if (quotes.length >= getRoundMaxQuoteSlots(quoteRoundType)) return;
    setQuotes(current => [...current, createEmptyQuoteDraft()]);
    setQuoteAttachments(current => [...current, null]);
  };

  const handleRemoveQuoteSlot = (index: number) => {
    if (quotes.length <= getRoundMinQuoteSlots(quoteRoundType)) return;
    setQuotes(current => current.filter((_, quoteIndex) => quoteIndex !== index));
    setQuoteAttachments(current => current.filter((_, quoteIndex) => quoteIndex !== index));
    setPendingCustomUnitByItem({});
  };


  const quoteUnitOptions = useMemo(() => {
    const options = new Set<string>(DEFAULT_QUOTE_UNIT_OPTIONS);
    additionalQuoteUnits.forEach(unit => {
      const normalized = normalizeUnitAbbreviation(unit);
      if (normalized) options.add(normalized);
    });
    quotes.forEach(quote => {
      quote.items.forEach(item => {
        const normalized = normalizeUnitAbbreviation(item.unit);
        if (normalized) options.add(normalized);
      });
    });
    return Array.from(options);
  }, [additionalQuoteUnits, quotes]);

  // Comparativo + totais: fonte única em `buildQuoteComparison` (mesma usada pela
  // ApprovalsView), computado de uma vez (antes eram 2 memos separados).
  const { sections: quoteComparisonSections, grandTotals: quoteGrandTotals } = useMemo(
    () => buildQuoteComparison(quotes),
    [quotes]
  );

  const visibleQuoteEditors = useMemo(
    () =>
      quotes
        .map((quote, index) => ({ quote, index }))
        .filter(entry => quoteEditorFocus === 'all' || entry.index === quoteEditorFocus),
    [quoteEditorFocus, quotes]
  );

  useEffect(() => {
    if (quoteEditorFocus === 'all') return;
    if (quoteEditorFocus >= quotes.length) {
      setQuoteEditorFocus(0);
    }
  }, [quoteEditorFocus, quotes.length]);

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
    handleQuoteChange, handleQuoteCurrencyBlur, handleProposalHeaderChange, handleProposalCurrencyBlur,
    handleQuoteItemChange, handleQuoteItemCurrencyBlur, handleQuoteItemUnitSelect, handleQuoteItemCustomUnitSave,
    handleAddQuoteItem, handleAddMultipleQuoteItems, handleRemoveQuoteItem, handleQuoteAttachmentChange,
    handleAddQuoteSlot, handleRemoveQuoteSlot,
    quoteUnitOptions, quoteComparisonSections, quoteGrandTotals, visibleQuoteEditors,
  };
}

/** Valor exposto pelo QuoteEditorContext (= retorno do hook). */
export type QuoteEditorValue = ReturnType<typeof useQuoteEditor>;
