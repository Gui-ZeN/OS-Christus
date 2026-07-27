import { describe, expect, it } from 'vitest';
import { HttpError } from '../../api/_lib/http.js';
import { assertProcurementMutationAllowed, isApprovalAction } from '../../api/_lib/procurementAccess.js';

function expectDenied(role: string, action: string, statusCode: number) {
  try {
    assertProcurementMutationAllowed(role, action);
    throw new Error('A ação deveria ter sido bloqueada.');
  } catch (error) {
    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).statusCode).toBe(statusCode);
  }
}

describe('procurement RBAC', () => {
  it('separa edição operacional de aprovação da Diretoria', () => {
    for (const action of ['quotes', 'contract', 'payment', 'measurement']) {
      expect(() => assertProcurementMutationAllowed('Admin', action)).not.toThrow();
      expect(() => assertProcurementMutationAllowed('Gestor', action)).not.toThrow();
      expectDenied('Diretor', action, 403);
    }

    for (const action of ['approveSolution', 'rejectSolution', 'approveBudget', 'rejectBudget', 'approveContract', 'rejectContract']) {
      expect(() => assertProcurementMutationAllowed('Admin', action)).not.toThrow();
      expect(() => assertProcurementMutationAllowed('Diretor', action)).not.toThrow();
      expectDenied('Gestor', action, 403);
      expect(isApprovalAction(action)).toBe(true);
    }
  });

  it('mantém seed financeiro exclusivo do Admin e bloqueia ações desconhecidas', () => {
    expect(() => assertProcurementMutationAllowed('Admin', 'seedDefaults')).not.toThrow();
    expectDenied('Gestor', 'seedDefaults', 403);
    expectDenied('Usuario', 'quotes', 403);
    expectDenied('Admin', 'unknown', 400);
  });
});

