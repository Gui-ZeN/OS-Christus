import { TICKET_STATUS } from '../constants/ticketStatus';
import type { CatalogRegion, CatalogSite } from '../services/catalogApi';
import type { ClosureChecklist, ContractRecord, GuaranteeInfo, MeasurementRecord, PaymentRecord, Ticket } from '../types';
import { formatCurrency } from './currency';
import { formatDateLabel, formatInputDate } from './finance';
import { getTicketRegionLabel, getTicketSiteLabel } from './ticketTerritory';

/**
 * Encerramento da OS: estado do checklist, regras que BLOQUEIAM o lancamento final
 * e o relatorio HTML de encerramento — extraidos de src/views/FinanceView.tsx.
 * Puro: nao toca em React nem em rede.
 */

export interface ClosureFormState {
  infrastructureApprovalPrimary: boolean;
  infrastructureApprovalSecondary: boolean;
  serviceStartedAt: string;
  serviceCompletedAt: string;
  guaranteeMonths: string;
  closureNotes: string;
}

export function escapeHtml(value: string) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildClosureExportHtml(
  ticket: Ticket,
  contract: ContractRecord | undefined,
  measurements: MeasurementRecord[],
  payments: PaymentRecord[],
  plannedValue: number,
  paidValue: number,
  regions: CatalogRegion[],
  sites: CatalogSite[]
) {
  const closureDocuments = ticket.closureChecklist?.documents || [];
  const contractItems = contract?.items || [];
  const siteLabel = getTicketSiteLabel(ticket, sites);
  const regionLabel = getTicketRegionLabel(ticket, regions, sites);

  const measurementRows = measurements.length === 0
    ? '<tr><td colspan="4">Nenhuma medição registrada.</td></tr>'
    : measurements
        .map(
          measurement => `
            <tr>
              <td>${escapeHtml(measurement.label)}</td>
              <td>${measurement.progressPercent}%</td>
              <td>${measurement.releasePercent}%</td>
              <td>${escapeHtml(formatDateLabel(measurement.requestedAt))}</td>
            </tr>
          `
        )
        .join('');

  const paymentRows = payments.length === 0
    ? '<tr><td colspan="5">Nenhum lançamento registrado.</td></tr>'
    : payments
        .map(
          payment => `
            <tr>
              <td>${escapeHtml(payment.label || `Lançamento ${payment.installmentNumber || '-'}`)}</td>
              <td>${escapeHtml(payment.value)}</td>
              <td>${payment.releasedPercent || 0}%</td>
              <td>${payment.status === 'paid' ? 'Pago' : payment.status === 'approved' ? 'Liberada' : 'Pendente'}</td>
              <td>${escapeHtml(formatDateLabel(payment.paidAt || payment.dueAt))}</td>
            </tr>
          `
        )
        .join('');

  const contractRows = contractItems.length === 0
    ? '<tr><td colspan="4">Escopo contratado não informado.</td></tr>'
    : contractItems
        .map(
          item => `
            <tr>
              <td>${escapeHtml(item.description || item.materialName || 'Item sem descrição')}</td>
              <td>${escapeHtml(String(item.quantity ?? '-'))} ${escapeHtml(item.unit || '')}</td>
              <td>${escapeHtml(item.costUnitPrice || item.unitPrice || '-')}</td>
              <td>${escapeHtml(item.totalPrice || '-')}</td>
            </tr>
          `
        )
        .join('');

  const documentRows = closureDocuments.length === 0
    ? '<li>Nenhum laudo anexado.</li>'
    : closureDocuments
        .map(
          document => `
            <li>
              ${escapeHtml(document.name)} (disponível no Serv3)
              - ${escapeHtml(formatDateLabel(document.uploadedAt))}
            </li>
          `
        )
        .join('');

  return `<!DOCTYPE html>
  <html lang="pt-BR">
    <head>
      <meta charset="UTF-8" />
      <title>Encerramento ${escapeHtml(ticket.id)}</title>
      <!--
        Mesma régua dos e-mails (api/_lib/emailTemplates.js, 03/09/2026): uma família
        de fonte, sem cartão, sem fundo, sem borda em volta de nada. Aqui a régua
        pára numa coisa: este documento é IMPRESSO, então as tabelas guardam um
        filete embaixo de cada linha — no papel, sem a cor de fundo do cabeçalho para
        ancorar a vista, uma tabela sem nenhuma régua vira lista solta.
      -->
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1f2328; margin: 32px; line-height: 1.55; font-size: 14px; }
        h1, h2 { margin: 0; font-weight: 600; }
        h1 { font-size: 20px; margin-bottom: 16px; }
        h2 { font-size: 11px; letter-spacing: 1.2px; text-transform: uppercase; color: #5a626b; margin: 28px 0 8px; }
        .meta, .grid { display: grid; gap: 8px 24px; }
        .meta { grid-template-columns: repeat(2, minmax(0, 1fr)); margin-bottom: 18px; }
        .grid { grid-template-columns: repeat(3, minmax(0, 1fr)); margin-bottom: 4px; }
        table { width: 100%; border-collapse: collapse; margin-top: 4px; }
        th, td { padding: 6px 12px 6px 0; text-align: left; font-size: 13px; vertical-align: top; border-bottom: 1px solid #e6e8eb; }
        th { font-weight: 600; color: #5a626b; }
        ul { padding-left: 18px; margin: 4px 0 0; }
        .muted { color: #5a626b; }
      </style>
    </head>
    <body>
      <h1>Encerramento da Ordem de Serviço ${escapeHtml(ticket.id)}</h1>
      <div class="meta">
        <div><strong>Assunto:</strong> ${escapeHtml(ticket.subject)}</div>
        <div><strong>Status:</strong> ${escapeHtml(ticket.status)}</div>
        <div><strong>Solicitante:</strong> ${escapeHtml(ticket.requester)}</div>
        <div><strong>Sede:</strong> ${escapeHtml(siteLabel)}</div>
        <div><strong>Região:</strong> ${escapeHtml(regionLabel)}</div>
        <div><strong>Classificação:</strong> ${escapeHtml(ticket.serviceCatalogName || ticket.macroServiceName || 'Não definida')}</div>
      </div>

      <div class="grid">
        <div><strong>Fornecedor</strong><br />${escapeHtml(contract?.vendor || payments[0]?.vendor || 'Não definido')}</div>
        <div><strong>Previsto</strong><br />${escapeHtml(formatCurrency(plannedValue))}</div>
        <div><strong>Pago</strong><br />${escapeHtml(formatCurrency(paidValue))}</div>
      </div>

      <h2>Encerramento e garantia</h2>
      <div class="meta">
        <div><strong>Início do serviço:</strong> ${escapeHtml(formatDateLabel(ticket.closureChecklist?.serviceStartedAt))}</div>
        <div><strong>Término do serviço:</strong> ${escapeHtml(formatDateLabel(ticket.closureChecklist?.serviceCompletedAt))}</div>
        <div><strong>Aprovação técnica 1:</strong> ${ticket.closureChecklist?.infrastructureApprovalPrimary ? 'Sim' : 'Não'}</div>
        <div><strong>Aprovação técnica 2:</strong> ${ticket.closureChecklist?.infrastructureApprovalSecondary ? 'Sim' : 'Não'}</div>
        <div><strong>Garantia:</strong> ${escapeHtml(formatDateLabel(ticket.guarantee?.startAt))} até ${escapeHtml(formatDateLabel(ticket.guarantee?.endAt))}</div>
      </div>
      <div><strong>Observações finais</strong><br /><span class="muted">${escapeHtml(ticket.closureChecklist?.closureNotes || 'Sem observações registradas.')}</span></div>

      <h2>Escopo contratado</h2>
      <table>
        <thead>
          <tr><th>Item</th><th>Quantidade</th><th>Custo unitário</th><th>Valor total</th></tr>
        </thead>
        <tbody>${contractRows}</tbody>
      </table>

      <h2>Medições</h2>
      <table>
        <thead>
          <tr><th>Descrição</th><th>% executado</th><th>% liberado</th><th>Data</th></tr>
        </thead>
        <tbody>${measurementRows}</tbody>
      </table>

      <h2>Pagamentos</h2>
      <table>
        <thead>
          <tr><th>Lançamento</th><th>Valor</th><th>% liberado</th><th>Status</th><th>Data</th></tr>
        </thead>
        <tbody>${paymentRows}</tbody>
      </table>

      <h2>Laudos e anexos</h2>
      <ul>${documentRows}</ul>
    </body>
  </html>`;
}

export function createClosureFormState(closureChecklist?: ClosureChecklist, guarantee?: GuaranteeInfo): ClosureFormState {
  return {
    infrastructureApprovalPrimary: closureChecklist?.infrastructureApprovalPrimary ?? false,
    infrastructureApprovalSecondary: closureChecklist?.infrastructureApprovalSecondary ?? false,
    serviceStartedAt: formatInputDate(closureChecklist?.serviceStartedAt),
    serviceCompletedAt: formatInputDate(closureChecklist?.serviceCompletedAt),
    guaranteeMonths: String(guarantee?.months || 12),
    closureNotes: closureChecklist?.closureNotes || '',
  };
}

export function getFinalInstallmentBlockingReasons(ticket: Ticket, closureDraft: ClosureFormState) {
  const reasons: string[] = [];
  if (ticket.status === TICKET_STATUS.IN_PROGRESS) {
    return reasons;
  }

  if (ticket.status === TICKET_STATUS.WAITING_MAINTENANCE_APPROVAL) {
    reasons.push('Validação do solicitante pendente');
    return reasons;
  }

  if (ticket.status !== TICKET_STATUS.WAITING_PAYMENT && ticket.status !== TICKET_STATUS.CLOSED) {
    reasons.push('A OS ainda não entrou na etapa final de pagamento');
    return reasons;
  }

  const guaranteeMonths = Number(closureDraft.guaranteeMonths || 0);

  if (!closureDraft.infrastructureApprovalPrimary) reasons.push('Aprovação técnica 1 pendente');
  if (!closureDraft.infrastructureApprovalSecondary) reasons.push('Aprovação técnica 2 pendente');
  if (!closureDraft.serviceStartedAt) reasons.push('Início do serviço não informado');
  if (!closureDraft.serviceCompletedAt) reasons.push('Término do serviço não informado');
  if (!Number.isFinite(guaranteeMonths) || guaranteeMonths <= 0) reasons.push('Garantia inválida');

  return reasons;
}
