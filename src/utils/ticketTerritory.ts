import type { CatalogRegion, CatalogSite } from '../services/catalogApi';
import type { Ticket } from '../types';
import * as compartilhado from '../../api/_lib/territorioDaOs.js';

// A resolu\u00e7\u00e3o mora em `api/_lib/territorioDaOs.js`: o Resumo Executivo agrupa por
// sede no servidor e precisa casar a sede exatamente como a tela.
export const resolveTicketSite: (ticket: Ticket, sites: CatalogSite[]) => CatalogSite | null =
  compartilhado.resolveTicketSite;

export const resolveTicketRegion: (
  ticket: Ticket,
  regions: CatalogRegion[],
  sites: CatalogSite[]
) => CatalogRegion | null = compartilhado.resolveTicketRegion;

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
