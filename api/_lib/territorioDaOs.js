/**
 * Sede e região de uma OS, pelo catálogo. Moravam só em `src/utils/ticketTerritory.ts`
 * (que reexporta daqui) e vieram para cá junto com as contas dos indicadores: o
 * Resumo Executivo agrupa por sede e precisa resolver exatamente como a tela.
 */

function normalizeKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

export function resolveTicketSite(ticket, sites) {
  const rawValues = [ticket.siteId, ticket.sede].map(normalizeKey).filter(Boolean);

  return (
    sites.find(site =>
      rawValues.some(value => [site.id, site.code, site.name].map(normalizeKey).includes(value))
    ) || null
  );
}

export function resolveTicketRegion(ticket, regions, sites) {
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
