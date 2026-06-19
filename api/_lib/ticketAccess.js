import { chunkValues, normalizeKey } from './text.js';

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
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

function resolveUserSiteIds(user, sites) {
  const rawValues = Array.isArray(user?.siteIds) ? uniqueValues(user.siteIds) : [];
  if (rawValues.length === 0) return [];
  const normalizedValues = rawValues.map(normalizeKey).filter(Boolean);
  return uniqueValues(
    sites
      .filter(site =>
        normalizedValues.some(value => [site.id, site.code, site.name].map(normalizeKey).includes(value))
      )
      .map(site => site.id)
  );
}

function resolveUserRegionIds(user, regions) {
  const rawValues = Array.isArray(user?.regionIds) ? uniqueValues(user.regionIds) : [];
  if (rawValues.length === 0) return [];
  const normalizedValues = rawValues.map(normalizeKey).filter(Boolean);
  return uniqueValues(
    regions
      .filter(region =>
        normalizedValues.some(value => [region.id, region.code, region.name].map(normalizeKey).includes(value))
      )
      .map(region => region.id)
  );
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
  if (user.role === 'Admin') return true;
  // Gestor é escopado por território (regionIds/siteIds), igual ao perfil Usuario:
  // cai no bloco genérico abaixo. Fail-closed se não tiver escopo vinculado.
  if (user.role === 'Diretor') {
    const directorIds = Array.isArray(ticket?.directorIds) ? ticket.directorIds.map(value => String(value || '').trim()).filter(Boolean) : [];
    const directorEmails = Array.isArray(ticket?.directorEmails)
      ? ticket.directorEmails.map(value => String(value || '').trim().toLowerCase()).filter(Boolean)
      : [];
    // OS com diretores designados: somente eles têm acesso (mesmo fora do território).
    if (directorIds.length > 0 || directorEmails.length > 0) {
      const userId = String(user.id || '').trim();
      const userEmail = String(user.email || '').trim().toLowerCase();
      if (userId && directorIds.includes(userId)) return true;
      if (userEmail && directorEmails.includes(userEmail)) return true;
      return false;
    }
    // OS sem diretor designado: cai no escopo territorial (regionIds/siteIds),
    // tratada pelo bloco genérico abaixo. Fail-closed se o diretor não tiver escopo.
  }

  const hasExplicitSiteScope = Array.isArray(user?.siteIds) && user.siteIds.some(value => String(value || '').trim());
  const siteIds = resolveUserSiteIds(user, sites);
  const regionIds = resolveUserRegionIds(user, regions);
  if (hasExplicitSiteScope && siteIds.length === 0) return false;
  if (regionIds.length === 0 && siteIds.length === 0) return false;

  const ticketSiteIds = resolveTicketSiteIds(ticket, sites);
  const ticketRegionIds = resolveTicketRegionIds(ticket, regions, sites);

  // Para perfil Usuario: se houver sedes vinculadas, restringe somente a essas sedes.
  if (siteIds.length > 0) {
    return siteIds.some(siteId => ticketSiteIds.includes(siteId));
  }
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
  const hasExplicitSiteScope = Array.isArray(user?.siteIds) && user.siteIds.some(value => String(value || '').trim());
  const userSiteIds = resolveUserSiteIds(user, sites);
  const userRegionIds = resolveUserRegionIds(user, regions);

  const allowedSiteIds = hasExplicitSiteScope
    ? uniqueValues([...userSiteIds])
    : userSiteIds.length > 0
    ? uniqueValues([...userSiteIds])
    : uniqueValues([
        ...sites.filter(site => userRegionIds.includes(site.regionId)).map(site => site.id),
      ]);

  const allowedRegionIds = uniqueValues([
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
    hasExplicitSiteScope,
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

  if (!scope.hasExplicitSiteScope) {
    for (const chunk of chunkValues(scope.allowedRegionIds)) {
      queries.push(db.collection('tickets').where('regionId', 'in', chunk).get());
    }
  }

  for (const chunk of chunkValues(scope.siteMatchers)) {
    queries.push(db.collection('tickets').where('sede', 'in', chunk).get());
  }

  if (!scope.hasExplicitSiteScope) {
    for (const chunk of chunkValues(scope.regionMatchers)) {
      queries.push(db.collection('tickets').where('region', 'in', chunk).get());
    }
  }

  const snapshots = await Promise.all(queries);
  snapshots.forEach(snapshot => {
    snapshot.docs.forEach(doc => {
      docs.set(doc.id, { id: doc.id, ...doc.data() });
    });
  });

  return [...docs.values()];
}

async function queryDirectorAssignedTickets(db, user) {
  const userId = String(user?.id || '').trim();
  const userEmail = String(user?.email || '').trim().toLowerCase();
  const queries = [];
  if (userId) queries.push(db.collection('tickets').where('directorIds', 'array-contains', userId).get());
  if (userEmail) queries.push(db.collection('tickets').where('directorEmails', 'array-contains', userEmail).get());
  if (queries.length === 0) return [];

  const docs = new Map();
  const snapshots = await Promise.all(queries);
  snapshots.forEach(snapshot => {
    snapshot.docs.forEach(doc => docs.set(doc.id, { id: doc.id, ...doc.data() }));
  });
  return [...docs.values()];
}

async function readAccessibleTickets(db, user) {
  if (!user) return [];
  if (user.role === 'Admin') {
    const snap = await db.collection('tickets').get();
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  const territory = await readTerritoryCatalog(db);
  const scope = buildAllowedScope(user, territory.regions, territory.sites);

  if (user.role === 'Diretor') {
    // Diretor vê: OS explicitamente atribuídas a ele (mesmo fora do território)
    // + OS sem diretor designado dentro do seu escopo territorial.
    const [assignedTickets, scopedTickets] = await Promise.all([
      queryDirectorAssignedTickets(db, user),
      queryTicketsByScope(db, scope),
    ]);
    const docs = new Map();
    for (const ticket of [...assignedTickets, ...scopedTickets]) docs.set(ticket.id, ticket);
    return [...docs.values()].filter(ticket =>
      canUserAccessTicket(user, ticket, territory.regions, territory.sites)
    );
  }

  const scopedTickets = await queryTicketsByScope(db, scope);
  return scopedTickets.filter(ticket => canUserAccessTicket(user, ticket, territory.regions, territory.sites));
}

export {
  normalizeKey,
  resolveTicketSiteIds,
  resolveTicketRegionIds,
  canUserAccessTicket,
  readTerritoryCatalog,
  readAccessibleTickets,
};
