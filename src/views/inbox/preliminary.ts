// Constante e tipos do checklist de ações preliminares, compartilhados entre o
// InboxView e o PreliminaryActionsModal extraído.

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
