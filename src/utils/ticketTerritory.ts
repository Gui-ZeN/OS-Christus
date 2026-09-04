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

/**
 * O DEGRAU ACIMA DA REGIÃO — Colégio ou Universidade.
 *
 * `region.group` existe no catálogo desde o começo e nunca foi usado para nada: em
 * produção, as cinco regiões do colégio têm `operacao` e a Universidade tem
 * `universidade`. Eram 209 OS de um lado e 15 do outro, sem nenhum jeito de somar as
 * 209 — os Indicadores só ofereciam "uma região por vez".
 *
 * ⚠️ GRUPO DESCONHECIDO DEVOLVE O PRÓPRIO VALOR, não um rótulo genérico. É a mesma
 * regra do `etapaDe` com status fora do mapa: quem cadastrar um grupo novo precisa
 * VER que ele apareceu estranho, em vez de encontrá-lo silenciosamente somado a
 * "Colégio".
 */
const ROTULO_DO_GRUPO: Record<string, string> = {
  operacao: 'Colégio',
  universidade: 'Universidade',
};

export const GRUPO_NAO_DEFINIDO = 'Não definida';

export function rotuloDoGrupo(group: string | null | undefined): string {
  const bruto = String(group || '').trim();
  if (!bruto) return GRUPO_NAO_DEFINIDO;
  return ROTULO_DO_GRUPO[bruto] || bruto;
}

/** Colégio / Universidade da OS, pela região dela. */
export function getTicketGroupLabel(ticket: Ticket, regions: CatalogRegion[], sites: CatalogSite[]) {
  const region = resolveTicketRegion(ticket, regions, sites);
  // Sem região resolvida não há grupo — e chutar "Colégio" porque é a maioria seria
  // exatamente o erro que este arquivo evita em todo lugar.
  return region ? rotuloDoGrupo(region.group) : GRUPO_NAO_DEFINIDO;
}
