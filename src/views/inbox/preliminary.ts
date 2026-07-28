// Checklist de ações preliminares: constante, tipos e as regras puras que decidem
// se a OS pode iniciar a execução — compartilhados entre o InboxView e o
// PreliminaryActionsModal extraído.

import type { PreliminaryActions } from '../../types';
import { formatInputDate, formatShortDate } from '../../utils/date';

export const PRELIMINARY_ITEMS = [
  { id: 'materialRequested', label: 'Compra de material solicitada' },
  { id: 'teamConfirmed', label: 'Equipe responsável confirmada' },
  { id: 'sitePrepared', label: 'Local organizado para manutenção' },
  { id: 'scheduleDefined', label: 'Cronograma de atividades definido' },
  { id: 'stakeholderAligned', label: 'Alinhamento com direção/supervisão concluído' },
  { id: 'accessReleased', label: 'Acesso ao local liberado pela unidade' },
] as const;

export type PreliminaryChecklistKey = (typeof PRELIMINARY_ITEMS)[number]['id'];

export interface PreliminaryFormState {
  materialRequested: boolean;
  materialEta: string;
  teamConfirmed: boolean;
  sitePrepared: boolean;
  scheduleDefined: boolean;
  stakeholderAligned: boolean;
  accessReleased: boolean;
  plannedStartAt: string;
  blockerNotes: string;
}

export function createPreliminaryFormState(preliminaryActions?: PreliminaryActions): PreliminaryFormState {
  return {
    materialRequested: preliminaryActions?.materialRequested ?? false,
    materialEta: formatInputDate(preliminaryActions?.materialEta),
    teamConfirmed: preliminaryActions?.teamConfirmed ?? false,
    sitePrepared: preliminaryActions?.sitePrepared ?? false,
    scheduleDefined: preliminaryActions?.scheduleDefined ?? false,
    stakeholderAligned: preliminaryActions?.stakeholderAligned ?? false,
    accessReleased: preliminaryActions?.accessReleased ?? false,
    plannedStartAt: formatInputDate(preliminaryActions?.plannedStartAt),
    blockerNotes: preliminaryActions?.blockerNotes ?? '',
  };
}

export function arePreliminaryActionsReady(form: PreliminaryFormState) {
  return PRELIMINARY_ITEMS.every(item => form[item.id]);
}

export function buildPreliminarySummary(preliminaryActions?: PreliminaryActions) {
  if (!preliminaryActions) return 'Nenhuma ação preliminar registrada.';

  const completed = PRELIMINARY_ITEMS.filter(item => preliminaryActions[item.id]).length;
  const parts = [`${completed}/${PRELIMINARY_ITEMS.length} itens concluídos`];

  if (preliminaryActions.materialEta) {
    parts.push(`material previsto para ${formatShortDate(preliminaryActions.materialEta)}`);
  }
  if (preliminaryActions.plannedStartAt) {
    parts.push(`início previsto em ${formatShortDate(preliminaryActions.plannedStartAt)}`);
  }
  if (preliminaryActions.blockerNotes?.trim()) {
    parts.push('há impedimentos registrados');
  }

  return parts.join(' | ');
}
