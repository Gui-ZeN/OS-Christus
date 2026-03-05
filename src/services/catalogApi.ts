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

export async function fetchCatalog() {
  const response = await fetch('/api/catalog');
  if (!response.ok) {
    throw new Error('Falha ao buscar catálogo de regiões/sedes.');
  }
  const json = await response.json();
  if (!json.ok || !Array.isArray(json.regions) || !Array.isArray(json.sites)) {
    throw new Error('Resposta inválida do catálogo.');
  }
  return {
    regions: json.regions as CatalogRegion[],
    sites: json.sites as CatalogSite[],
  };
}
