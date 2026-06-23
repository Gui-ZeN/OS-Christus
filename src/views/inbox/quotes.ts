/**
 * Helpers e constantes compartilhados da edição de Cotações (InboxView →
 * componentes em `inbox/`). Fonte única pra evitar drift — especialmente da
 * taxonomia de seções, que precisa bater entre o editor e o comparativo.
 */

/** Sentinela do <option> "+ Outra..." no seletor de unidade do item. */
export const CUSTOM_QUOTE_UNIT_VALUE = '__custom_unit__';

/** Opções de seção de um item de cotação (taxonomia fixa do negócio). */
export const QUOTE_SECTION_OPTIONS = [
  { value: 'material', label: 'Material' },
  { value: 'mao-de-obra', label: 'Mão de obra' },
  { value: 'materiais-complementares', label: 'Materiais complementares' },
  { value: 'servicos-complementares', label: 'Serviços complementares' },
] as const;

/** Normaliza a seção do item (legado `material-mao-de-obra` vira `material`). */
export function normalizeQuoteSection(section?: string | null) {
  const normalized = String(section || '').trim();
  if (!normalized || normalized === 'material-mao-de-obra') return 'material';
  return normalized;
}
