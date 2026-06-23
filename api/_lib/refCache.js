// Cache TTL em escopo de módulo para dados de REFERÊNCIA (sites/regions/users),
// que mudam raramente mas eram recarregados do Firestore a cada request em vários
// pontos quentes (resolveSiteContext por e-mail, readTerritoryCatalog em todo
// poll de notificações/PATCH/procurement, listas de users em e-mails).
//
// A instância serverless é reusada entre invocações dentro de uma janela quente,
// então o cache corta a maioria dessas leituras. TTL curto => no máximo ~60s de
// defasagem ao adicionar/editar uma sede/usuário (aceitável para dados de
// referência). Chame invalidateRefCache(name) após escrever para zerar a
// defasagem, se necessário.

const TTL_MS = 60_000;
const store = new Map();

async function cached(key, loader) {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.expiresAt > now) return hit.value;
  const value = await loader();
  store.set(key, { value, expiresAt: now + TTL_MS });
  return value;
}

function loadCollection(db, name) {
  return cached(name, async () => {
    const snap = await db.collection(name).get();
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  });
}

export const getCachedSites = db => loadCollection(db, 'sites');
export const getCachedRegions = db => loadCollection(db, 'regions');
export const getCachedUsers = db => loadCollection(db, 'users');

export function invalidateRefCache(name) {
  if (name) store.delete(name);
  else store.clear();
}
