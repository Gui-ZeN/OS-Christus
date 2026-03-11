function normalizeKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function resolveTicketSiteIds(ticket, sites) {
  const rawValues = [ticket?.siteId, ticket?.sede].map(value => normalizeKey(value)).filter(Boolean);
  const matches = sites
    .filter(site => rawValues.some(value => [site.id, site.code, site.name].map(normalizeKey).includes(value)))
    .map(site => site.id);

  if (ticket?.siteId && !matches.includes(ticket.siteId)) {
    matches.push(ticket.siteId);
  }

  return matches;
}

function resolveTicketRegionIds(ticket, regions, sites) {
  const rawValues = [ticket?.regionId, ticket?.region].map(value => normalizeKey(value)).filter(Boolean);
  const matches = regions
    .filter(region => rawValues.some(value => [region.id, region.code, region.name].map(normalizeKey).includes(value)))
    .map(region => region.id);

  const siteRegionIds = resolveTicketSiteIds(ticket, sites)
    .map(siteId => sites.find(site => site.id === siteId)?.regionId)
    .filter(Boolean);

  for (const regionId of siteRegionIds) {
    if (!matches.includes(regionId)) matches.push(regionId);
  }

  if (ticket?.regionId && !matches.includes(ticket.regionId)) {
    matches.push(ticket.regionId);
  }

  return matches;
}

function canUserAccessTicket(user, ticket, regions, sites) {
  if (!user) return false;
  if (user.role === 'Admin' || user.role === 'Diretor') return true;

  const regionIds = Array.isArray(user.regionIds) ? user.regionIds : [];
  const siteIds = Array.isArray(user.siteIds) ? user.siteIds : [];
  if (regionIds.length === 0 && siteIds.length === 0) return false;

  const ticketSiteIds = resolveTicketSiteIds(ticket, sites);
  const ticketRegionIds = resolveTicketRegionIds(ticket, regions, sites);

  if (user.role === 'Supervisor') {
    if (siteIds.length > 0) {
      return siteIds.some(siteId => ticketSiteIds.includes(siteId));
    }
    return regionIds.some(regionId => ticketRegionIds.includes(regionId));
  }

  if (siteIds.length > 0 && siteIds.some(siteId => ticketSiteIds.includes(siteId))) return true;
  if (regionIds.length > 0 && regionIds.some(regionId => ticketRegionIds.includes(regionId))) return true;
  return false;
}

async function readTerritoryCatalog(db) {
  const [regionsSnap, sitesSnap] = await Promise.all([
    db.collection('regions').get(),
    db.collection('sites').get(),
  ]);

  return {
    regions: regionsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
    sites: sitesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
  };
}

export {
  normalizeKey,
  resolveTicketSiteIds,
  resolveTicketRegionIds,
  canUserAccessTicket,
  readTerritoryCatalog,
};
