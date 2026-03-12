function normalizeKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}

function chunkValues(values, size = 10) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
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

function buildAllowedScope(user, regions, sites) {
  const userSiteIds = Array.isArray(user?.siteIds) ? uniqueValues(user.siteIds) : [];
  const userRegionIds = Array.isArray(user?.regionIds) ? uniqueValues(user.regionIds) : [];

  const allowedSiteIds =
    user.role === 'Supervisor' && userSiteIds.length > 0
      ? userSiteIds
      : uniqueValues([
          ...userSiteIds,
          ...sites.filter(site => userRegionIds.includes(site.regionId)).map(site => site.id),
        ]);

  const allowedRegionIds =
    user.role === 'Supervisor' && userSiteIds.length > 0
      ? uniqueValues(
          allowedSiteIds
            .map(siteId => sites.find(site => site.id === siteId)?.regionId)
            .filter(Boolean)
        )
      : uniqueValues([
          ...userRegionIds,
          ...allowedSiteIds
            .map(siteId => sites.find(site => site.id === siteId)?.regionId)
            .filter(Boolean),
        ]);

  const siteMatchers = uniqueValues(
    allowedSiteIds.flatMap(siteId => {
      const site = sites.find(entry => entry.id === siteId);
      return site ? [site.id, site.code, site.name].map(normalizeKey).filter(Boolean) : [];
    })
  );

  const regionMatchers = uniqueValues(
    allowedRegionIds.flatMap(regionId => {
      const region = regions.find(entry => entry.id === regionId);
      return region ? [region.id, region.code, region.name].map(normalizeKey).filter(Boolean) : [];
    })
  );

  return {
    allowedSiteIds,
    allowedRegionIds,
    siteMatchers,
    regionMatchers,
  };
}

async function queryTicketsByScope(db, scope) {
  const docs = new Map();

  const queries = [];

  for (const chunk of chunkValues(scope.allowedSiteIds)) {
    queries.push(db.collection('tickets').where('siteId', 'in', chunk).get());
  }

  for (const chunk of chunkValues(scope.allowedRegionIds)) {
    queries.push(db.collection('tickets').where('regionId', 'in', chunk).get());
  }

  for (const chunk of chunkValues(scope.siteMatchers)) {
    queries.push(db.collection('tickets').where('sede', 'in', chunk).get());
  }

  for (const chunk of chunkValues(scope.regionMatchers)) {
    queries.push(db.collection('tickets').where('region', 'in', chunk).get());
  }

  const snapshots = await Promise.all(queries);
  snapshots.forEach(snapshot => {
    snapshot.docs.forEach(doc => {
      docs.set(doc.id, { id: doc.id, ...doc.data() });
    });
  });

  return [...docs.values()];
}

async function readAccessibleTickets(db, user) {
  if (!user) return [];

  if (user.role === 'Admin' || user.role === 'Diretor') {
    const snap = await db.collection('tickets').get();
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  const territory = await readTerritoryCatalog(db);
  const scope = buildAllowedScope(user, territory.regions, territory.sites);

  if (scope.allowedSiteIds.length === 0 && scope.allowedRegionIds.length === 0) {
    return [];
  }

  const tickets = await queryTicketsByScope(db, scope);
  return tickets.filter(ticket => canUserAccessTicket(user, ticket, territory.regions, territory.sites));
}

export {
  normalizeKey,
  resolveTicketSiteIds,
  resolveTicketRegionIds,
  canUserAccessTicket,
  readTerritoryCatalog,
  readAccessibleTickets,
};
