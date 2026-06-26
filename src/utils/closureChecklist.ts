import type { ClosureChecklist, Ticket } from '../types';

/**
 * Mescla `patch` sobre o checklist de encerramento CANÔNICO do ticket,
 * preservando os campos legados (`infrastructureApprovedByRafael/Fernando`) e a
 * cadeia de fallback de `serviceStartedAt`. **Fonte única** — antes os handlers
 * da FinanceView reconstruíam o objeto campo-a-campo e dropavam os legados
 * (perda de dados: OS com só o campo legado perdia a aprovação de infraestrutura).
 */
export function mergeClosureChecklist(
  ticket: Ticket,
  patch: Partial<ClosureChecklist> = {}
): ClosureChecklist {
  const current = ticket.closureChecklist;

  return {
    requesterApproved: current?.requesterApproved ?? false,
    requesterApprovedBy: current?.requesterApprovedBy || null,
    requesterApprovedAt: current?.requesterApprovedAt || null,
    infrastructureApprovalPrimary:
      current?.infrastructureApprovalPrimary ?? current?.infrastructureApprovedByRafael ?? false,
    infrastructureApprovalSecondary:
      current?.infrastructureApprovalSecondary ?? current?.infrastructureApprovedByFernando ?? false,
    infrastructureApprovedByRafael: current?.infrastructureApprovedByRafael,
    infrastructureApprovedByFernando: current?.infrastructureApprovedByFernando,
    closureNotes: current?.closureNotes || '',
    serviceStartedAt:
      current?.serviceStartedAt ||
      ticket.executionProgress?.startedAt ||
      ticket.preliminaryActions?.actualStartAt ||
      ticket.preliminaryActions?.plannedStartAt ||
      null,
    serviceCompletedAt: current?.serviceCompletedAt || null,
    closedAt: current?.closedAt || null,
    documents: current?.documents || [],
    ...patch,
  };
}

/** Checklist no momento da validação/encerramento: garante `serviceCompletedAt`. */
export function buildValidationClosureChecklist(ticket: Ticket, completedAt: Date): ClosureChecklist {
  return mergeClosureChecklist(ticket, {
    serviceCompletedAt: ticket.closureChecklist?.serviceCompletedAt || completedAt,
  });
}
