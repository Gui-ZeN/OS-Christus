import type { ClosureChecklist, Ticket } from '../types';

export function buildValidationClosureChecklist(ticket: Ticket, completedAt: Date): ClosureChecklist {
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
    serviceCompletedAt: current?.serviceCompletedAt || completedAt,
    closedAt: current?.closedAt || null,
    documents: current?.documents || [],
  };
}
