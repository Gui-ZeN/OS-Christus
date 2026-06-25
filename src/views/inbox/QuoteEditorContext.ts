import { createContext, useContext } from 'react';
import type { QuoteEditorValue } from './useQuoteEditor';

/**
 * Context do editor de Cotações: carrega o retorno do `useQuoteEditor` (estado +
 * handlers + derivados) pra subárvore do modal, matando o prop-drilling — os
 * componentes (QuoteItemsSection, QuoteItemRow, ...) consomem o que precisam via
 * `useQuoteEditorContext()` em vez de receber 14-15 props cada.
 */
const QuoteEditorContext = createContext<QuoteEditorValue | null>(null);

export const QuoteEditorProvider = QuoteEditorContext.Provider;

export function useQuoteEditorContext(): QuoteEditorValue {
  const ctx = useContext(QuoteEditorContext);
  if (!ctx) {
    throw new Error('useQuoteEditorContext deve ser usado dentro de <QuoteEditorProvider>.');
  }
  return ctx;
}
