import { getActorHeaders, getAuthenticatedActorHeaders } from './actorHeaders';

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

export async function fetchCatalog() {
  const response = await fetch('/api/catalog');
  if (!response.ok) {
    throw new Error('Falha ao buscar catalogo operacional.');
  }
  const json = await response.json();
  if (!json.ok || !Array.isArray(json.regions) || !Array.isArray(json.sites)) {
    throw new Error('Resposta invalida do catalogo.');
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
  if (!response.ok) {
    throw new Error('Falha ao salvar item do catalogo.');
  }
  const json = await response.json();
  if (!json.ok) {
    throw new Error(json.error || 'Resposta invalida ao salvar catalogo.');
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

export async function deleteCatalogEntry(entity: 'regions' | 'sites', id: string) {
  const headers = await getAuthenticatedActorHeaders();
  const response = await fetch('/api/catalog', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', ...headers, ...getActorHeaders() },
    body: JSON.stringify({ entity, id }),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.ok) {
    throw new Error(json?.error || 'Falha ao excluir item do catálogo.');
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
