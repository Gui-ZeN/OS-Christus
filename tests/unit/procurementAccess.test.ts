import { describe, expect, it } from 'vitest';
import { HttpError } from '../../api/_lib/http.js';
import { assertProcurementMutationAllowed } from '../../api/_lib/procurementAccess.js';

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
  it('edição operacional continua com Admin e Gestor', () => {
    for (const action of ['quotes', 'contract', 'payment', 'measurement']) {
      expect(() => assertProcurementMutationAllowed('Admin', action)).not.toThrow();
      expect(() => assertProcurementMutationAllowed('Gestor', action)).not.toThrow();
      expectDenied('Diretor', action, 403);
    }
  });

  it('as ações de aprovação da Diretoria não existem mais', () => {
    // Saíram junto com a rota e a tela: não havia diretor cadastrado, e a
    // aprovação real acontece por e-mail.
    for (const action of ['approveSolution', 'approveBudget', 'approveContract']) {
      expectDenied('Admin', action, 400);
      expectDenied('Diretor', action, 400);
    }
  });

  it('mantém seed financeiro exclusivo do Admin e bloqueia ações desconhecidas', () => {
    expect(() => assertProcurementMutationAllowed('Admin', 'seedDefaults')).not.toThrow();
    expectDenied('Gestor', 'seedDefaults', 403);
    expectDenied('Usuario', 'quotes', 403);
    expectDenied('Admin', 'unknown', 400);
  });
});

