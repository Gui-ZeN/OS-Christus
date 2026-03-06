import type { ProcurementClassificationSnapshot, Ticket } from '../types';

export function buildProcurementClassification(ticket: Ticket): ProcurementClassificationSnapshot {
  return {
    ticketType: ticket.type || null,
    macroServiceId: ticket.macroServiceId || null,
    macroServiceName: ticket.macroServiceName || null,
    serviceCatalogId: ticket.serviceCatalogId || null,
    serviceCatalogName: ticket.serviceCatalogName || null,
    regionId: ticket.regionId || null,
    regionName: ticket.region || null,
    siteId: ticket.siteId || null,
    siteName: ticket.sede || null,
    sector: ticket.sector || null,
  };
}
