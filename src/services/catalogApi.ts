import { getActorHeaders, getAuthenticatedActorHeaders } from './actorHeaders';
import { expectApiJson, readApiJson, resolveApiError } from './apiClient';
import { UserFacingError } from '../utils/errorMessage';
export interface CatalogRegion {
  id: string;
  code: string;
  name: string;
  group?: string;
  active?: boolean;
}

export interface CatalogSite {
  id: string;
  code: string;
  name: string;
  regionId: string;
  active?: boolean;
  /** Apelidos que o pessoal escreve no [SEDE] do e-mail (ex.: CESIU numa sede ALD). */
  aliases?: string[];
}

export interface CatalogMacroService {
  id: string;
  code: string;
  name: string;
  active?: boolean;
}

export interface CatalogMaterial {
  id: string;
  code: string;
  name: string;
  unit?: string;
  active?: boolean;
}

export interface CatalogServiceItem {
  id: string;
  code: string;
  name: string;
  macroServiceId: string;
  suggestedMaterialIds?: string[];
  active?: boolean;
}

export interface CatalogVendorPreference {
  id: string;
  scopeType: 'service' | 'macroService' | 'material';
  scopeId: string;
  scopeName: string;
  vendor: string;
  approvalCount: number;
  averageApprovedValue?: number | null;
  averageUnitPrice?: number | null;
  lastApprovedAt?: string | Date | null;
  lastApprovedValue?: number | null;
  lastTicketId?: string | null;
  unit?: string | null;
  materialId?: string | null;
  materialName?: string | null;
  serviceCatalogId?: string | null;
  serviceCatalogName?: string | null;
  macroServiceId?: string | null;
  macroServiceName?: string | null;
}

/**
 * @param incluirInativos só a tela de Configurações pede — é ela que precisa ver o
 *   que está desativado para poder reativar. Em todo o resto do sistema o catálogo
 *   devolve apenas o ativo, que é o que faz desativar valer como limpeza.
 */
export async function fetchCatalog({ incluirInativos = false } = {}) {
  // Envia headers de auth quando o usuário está logado (assim recebe materiais e
  // preferências de fornecedor). No formulário público segue anônimo.
  const authHeaders = await getAuthenticatedActorHeaders().catch(() => ({}));
  const url = incluirInativos ? '/api/catalog?incluirInativos=1' : '/api/catalog';
  const response = await fetch(url, { headers: { ...authHeaders } });
  const json = await expectApiJson<any>(response, 'Falha ao buscar catálogo operacional.');
  if (!json.ok || !Array.isArray(json.regions) || !Array.isArray(json.sites)) {
    throw new UserFacingError('Resposta inválida do catálogo.');
  }
  return {
    regions: json.regions as CatalogRegion[],
    sites: json.sites as CatalogSite[],
    macroServices: (json.macroServices || []) as CatalogMacroService[],
    serviceCatalog: (json.serviceCatalog || []) as CatalogServiceItem[],
    materials: (json.materials || []) as CatalogMaterial[],
    vendorPreferences: (json.vendorPreferences || []) as CatalogVendorPreference[],
  };
}

export async function saveCatalogEntry(
  entity: 'macroServices' | 'serviceCatalog' | 'materials' | 'regions' | 'sites',
  record: Record<string, unknown>
) {
  const headers = await getAuthenticatedActorHeaders();
  const response = await fetch('/api/catalog', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers, ...getActorHeaders() },
    body: JSON.stringify({ entity, record }),
  });
  const json = await expectApiJson<any>(response, 'Falha ao salvar item do catálogo.');
  if (!json.ok) {
    // Mesmo corte do excluir: salvar também recusa por conflito (código repetido,
    // por exemplo), e o motivo é tão útil aqui quanto lá.
    throw erroDoCatalogo(response.status, json, 'Falha ao salvar item do catálogo.');
  }
  return {
    regions: json.regions as CatalogRegion[],
    sites: json.sites as CatalogSite[],
    macroServices: (json.macroServices || []) as CatalogMacroService[],
    serviceCatalog: (json.serviceCatalog || []) as CatalogServiceItem[],
    materials: (json.materials || []) as CatalogMaterial[],
    vendorPreferences: (json.vendorPreferences || []) as CatalogVendorPreference[],
  };
}

/**
 * O MOTIVO DA RECUSA CHEGA NA TELA — mas só quando ele foi escrito para alguém ler.
 *
 * ⚠️ ANTES A TELA DIZIA SÓ "Falha ao excluir item do catálogo.". Reproduzido contra o
 * emulador em 11/09/2026: apagar um macroserviço que ainda tem serviços vinculados
 * devolve **400 com o motivo por extenso**, e o cliente jogava o texto fora porque
 * `mensagemDeErro` só deixa passar `UserFacingError`. A pessoa via "falhou" e não
 * tinha como saber que bastava tirar os serviços primeiro.
 *
 * ⚠️ E NÃO É "MOSTRE O QUE O SERVIDOR MANDAR". O `catch` do handler devolve
 * `error.message` de QUALQUER erro — inclusive os do SDK do Firestore, em inglês.
 * Mostrar todos reabriria exatamente o buraco que o `UserFacingError` fechou.
 *
 * O corte é o STATUS: 409 é recusa deliberada (o item está em uso), 404 é "sumiu".
 * Os dois carregam frase escrita para gente; o resto cai no texto de quem chamou.
 */
export function erroDoCatalogo(status: number, json: unknown, fallback: string): Error {
  const mensagem = resolveApiError(json, fallback);
  return status === 409 || status === 404 ? new UserFacingError(mensagem) : new Error(mensagem);
}

export async function deleteCatalogEntry(
  entity: 'regions' | 'sites' | 'macroServices' | 'serviceCatalog' | 'materials',
  id: string
) {
  const headers = await getAuthenticatedActorHeaders();
  const response = await fetch('/api/catalog', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', ...headers, ...getActorHeaders() },
    body: JSON.stringify({ entity, id }),
  });
  const json = await readApiJson<any>(response);
  if (!response.ok || !json?.ok) {
    throw erroDoCatalogo(response.status, json, 'Falha ao excluir item do catálogo.');
  }
  return {
    regions: json.regions as CatalogRegion[],
    sites: json.sites as CatalogSite[],
    macroServices: (json.macroServices || []) as CatalogMacroService[],
    serviceCatalog: (json.serviceCatalog || []) as CatalogServiceItem[],
    materials: (json.materials || []) as CatalogMaterial[],
    vendorPreferences: (json.vendorPreferences || []) as CatalogVendorPreference[],
  };
}


