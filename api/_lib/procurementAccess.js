import { HttpError } from './http.js';

const EDIT_ACTIONS = new Set(['quotes', 'contract', 'payment', 'measurement']);
const APPROVAL_ACTIONS = new Set([
  'approveSolution',
  'rejectSolution',
  'approveBudget',
  'rejectBudget',
  'approveContract',
  'rejectContract',
]);

export function assertProcurementMutationAllowed(role, action) {
  const normalizedRole = String(role || '').trim();
  const normalizedAction = String(action || '').trim();

  if (EDIT_ACTIONS.has(normalizedAction)) {
    if (normalizedRole === 'Admin' || normalizedRole === 'Gestor') return;
    throw new HttpError(403, 'Apenas Admin ou Gestor podem editar dados de compras.');
  }

  if (APPROVAL_ACTIONS.has(normalizedAction)) {
    if (normalizedRole === 'Admin' || normalizedRole === 'Diretor') return;
    throw new HttpError(403, 'Apenas Admin ou Diretor podem aprovar ou reprovar etapas.');
  }

  if (normalizedAction === 'seedDefaults') {
    if (normalizedRole === 'Admin') return;
    throw new HttpError(403, 'Apenas Admin pode criar dados financeiros padrão.');
  }

  throw new HttpError(400, 'Ação de compras inválida.');
}

export function isApprovalAction(action) {
  return APPROVAL_ACTIONS.has(String(action || '').trim());
}

