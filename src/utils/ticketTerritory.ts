import type { CatalogRegion, CatalogSite } from '../services/catalogApi';
import type { Ticket } from '../types';

function normalizeKey(value: string | null | undefined) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export function resolveTicketSite(ticket: Ticket, sites: CatalogSite[]) {
  const rawValues = [ticket.siteId, ticket.sede].map(normalizeKey).filter(Boolean);

  return (
    sites.find(site =>
      rawValues.some(value => [site.id, site.code, site.name].map(normalizeKey).includes(value))
    ) || null
  );
}

export function resolveTicketRegion(ticket: Ticket, regions: CatalogRegion[], sites: CatalogSite[]) {
  const rawValues = [ticket.regionId, ticket.region].map(normalizeKey).filter(Boolean);
  const directMatch =
    regions.find(region =>
      rawValues.some(value => [region.id, region.code, region.name].map(normalizeKey).includes(value))
    ) || null;

  if (directMatch) return directMatch;

  const site = resolveTicketSite(ticket, sites);
  if (!site) return null;
  return regions.find(region => region.id === site.regionId) || null;
}

export function getTicketRegionLabel(ticket: Ticket, regions: CatalogRegion[], sites: CatalogSite[]) {
  return resolveTicketRegion(ticket, regions, sites)?.name || ticket.region || 'Não definida';
}

export function getTicketSiteLabel(ticket: Ticket, sites: CatalogSite[]) {
  const site = resolveTicketSite(ticket, sites);
  if (site) return site.code || site.name;
  return ticket.sede || 'Não definida';
}

export function getTicketRegionId(ticket: Ticket, regions: CatalogRegion[], sites: CatalogSite[]) {
  return resolveTicketRegion(ticket, regions, sites)?.id || ticket.regionId || null;
}

export function getTicketSiteId(ticket: Ticket, sites: CatalogSite[]) {
  return resolveTicketSite(ticket, sites)?.id || ticket.siteId || null;
}
