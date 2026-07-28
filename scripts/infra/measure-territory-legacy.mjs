import process from 'node:process';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { normalizeKey, readTerritoryCatalog } from '../../api/_lib/ticketAccess.js';
import { readServiceAccount, resolveCredentialsPath } from './shared-auth.mjs';

/**
 * MEDIÇÃO (somente leitura) do achado territorial legado da 4ª auditoria.
 *
 * O escopo por sede tem dois caminhos: `where('siteId','in',[...])`, que é exato,
 * e um fallback textual `where('sede','in',[...])`. Os valores do fallback são
 * normalizados com normalizeKey (minúsculas, sem acento), mas o campo `sede` é
 * gravado a partir do `site.code` — em CAIXA ALTA ("ALD"). Como o Firestore
 * compara por igualdade exata e não tem busca case-insensitive, "ALD" nunca casa
 * com "ald".
 *
 * Isso só afeta OS SEM `siteId`/`regionId` — nas demais a query exata já cobre.
 * Este script conta quantas são, antes de decidir se o backfill se justifica.
 *
 * Uso:
 *   node scripts/infra/measure-territory-legacy.mjs            (produção, leitura)
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node ...            (emulador)
 */

const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT_ID = process.env.GCLOUD_PROJECT || 'os-christus';
const SAMPLE_SIZE = 10;

function connect() {
  if (getApps().length > 0) return getFirestore();
  if (EMULATOR) {
    initializeApp({ projectId: PROJECT_ID });
  } else {
    const serviceAccount = readServiceAccount(resolveCredentialsPath());
    initializeApp({ credential: cert(serviceAccount), projectId: serviceAccount.project_id || PROJECT_ID });
  }
  return getFirestore();
}

/** Todos os textos pelos quais o fallback consegue encontrar um site/região. */
function buildMatcherIndex(entries) {
  const index = new Map();
  for (const entry of entries) {
    for (const raw of [entry.id, entry.code, entry.name]) {
      const normalized = normalizeKey(raw);
      if (normalized && !index.has(normalized)) index.set(normalized, entry);
    }
  }
  return index;
}

async function main() {
  const db = connect();
  console.log(`\nAlvo: ${EMULATOR ? `EMULADOR (${EMULATOR})` : `PRODUÇÃO (${PROJECT_ID})`}`);
  console.log('Modo: SOMENTE LEITURA — este script não escreve nada.\n');

  const { regions, sites } = await readTerritoryCatalog(db);
  const siteIndex = buildMatcherIndex(sites);
  const regionIndex = buildMatcherIndex(regions);
  console.log(`Catálogo: ${sites.length} sedes, ${regions.length} regiões.`);

  const snap = await db.collection('tickets').get();
  const total = snap.size;

  const buckets = {
    comIds: [],
    fallbackFunciona: [],
    invisivelCorrigivel: [],
    sedeDesconhecida: [],
    semTerritorio: [],
  };

  for (const doc of snap.docs) {
    const data = doc.data() || {};
    const id = doc.id;
    const sede = String(data.sede || '').trim();
    const region = String(data.region || '').trim();

    if (data.siteId || data.regionId) {
      buckets.comIds.push(id);
      continue;
    }
    if (!sede && !region) {
      buckets.semTerritorio.push(id);
      continue;
    }

    // O fallback só encontra se o valor GRAVADO for idêntico ao matcher normalizado.
    const alcancavel =
      (sede && siteIndex.has(sede)) || (region && regionIndex.has(region));
    if (alcancavel) {
      buckets.fallbackFunciona.push(id);
      continue;
    }

    // Normalizando, o valor existe no catálogo? Então é só questão de caixa/acento
    // — exatamente o que o backfill de siteId/regionId resolve.
    const siteMatch = siteIndex.get(normalizeKey(sede));
    const regionMatch = regionIndex.get(normalizeKey(region));
    if (siteMatch || regionMatch) {
      buckets.invisivelCorrigivel.push({
        id,
        sede,
        region,
        siteIdSugerido: siteMatch?.id || null,
        regionIdSugerido: regionMatch?.id || siteMatch?.regionId || null,
      });
      continue;
    }

    buckets.sedeDesconhecida.push({ id, sede, region });
  }

  const pct = value => (total > 0 ? ((value / total) * 100).toFixed(1) : '0.0');

  console.log(`\n===== ${total} OS analisadas =====`);
  console.log(`  ${String(buckets.comIds.length).padStart(5)}  (${pct(buckets.comIds.length)}%)  com siteId/regionId — query exata cobre, sem problema`);
  console.log(`  ${String(buckets.fallbackFunciona.length).padStart(5)}  (${pct(buckets.fallbackFunciona.length)}%)  sem ids, mas o texto casa com o matcher — fallback funciona`);
  console.log(`  ${String(buckets.invisivelCorrigivel.length).padStart(5)}  (${pct(buckets.invisivelCorrigivel.length)}%)  INVISÍVEIS para perfil escopado — o backfill resolve`);
  console.log(`  ${String(buckets.sedeDesconhecida.length).padStart(5)}  (${pct(buckets.sedeDesconhecida.length)}%)  sede/região fora do catálogo — precisa decisão manual`);
  console.log(`  ${String(buckets.semTerritorio.length).padStart(5)}  (${pct(buckets.semTerritorio.length)}%)  sem território nenhum — invisíveis por ausência de dado`);

  if (buckets.invisivelCorrigivel.length > 0) {
    console.log(`\n--- Amostra das corrigíveis (até ${SAMPLE_SIZE}) ---`);
    for (const item of buckets.invisivelCorrigivel.slice(0, SAMPLE_SIZE)) {
      console.log(
        `  ${item.id}: sede="${item.sede}" region="${item.region}" → siteId=${item.siteIdSugerido} regionId=${item.regionIdSugerido}`
      );
    }
  }

  if (buckets.sedeDesconhecida.length > 0) {
    console.log(`\n--- Amostra das desconhecidas (até ${SAMPLE_SIZE}) ---`);
    for (const item of buckets.sedeDesconhecida.slice(0, SAMPLE_SIZE)) {
      console.log(`  ${item.id}: sede="${item.sede}" region="${item.region}"`);
    }
  }

  const afetadas = buckets.invisivelCorrigivel.length + buckets.sedeDesconhecida.length;
  console.log('\n===== Conclusão =====');
  if (afetadas === 0) {
    console.log('Nenhuma OS afetada: o backfill territorial NÃO se justifica.');
  } else {
    console.log(`${afetadas} OS não aparecem para perfis escopados por sede/região.`);
    console.log(`Dessas, ${buckets.invisivelCorrigivel.length} têm correspondência no catálogo e o backfill resolveria.`);
    if (buckets.sedeDesconhecida.length > 0) {
      console.log(`As outras ${buckets.sedeDesconhecida.length} têm valor fora do catálogo e precisam de decisão caso a caso.`);
    }
  }
  console.log('');
  process.exit(0);
}

main().catch(error => {
  console.error('Falha na medição:', error);
  process.exit(1);
});
