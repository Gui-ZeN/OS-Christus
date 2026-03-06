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
  };
}
