import process from 'node:process';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readServiceAccount, resolveCredentialsPath } from './shared-auth.mjs';
import { slugify } from '../../api/_lib/text.js';

/**
 * RESTAURAÇÃO: recria os itens de catálogo que foram engolidos por sobrescrita.
 *
 * ⚠️ O DEFEITO QUE ISTO REPARA (corrigido em `aabf142`): o id vinha de
 * `slugify(code || name)` e a gravação era `set(merge: true)` direto nesse id. A
 * operação usava o código como código de CATEGORIA — "CIV" em todo serviço civil,
 * "COB" em todo serviço de cobertura — então cada criação caía no MESMO documento e
 * renomeava a anterior. Seis tentativas viravam um item.
 *
 * O que sobrou é sempre o ÚLTIMO nome digitado. Os anteriores só existem na
 * auditoria, que guarda `before` e `after` inteiros — é dela que este script lê.
 *
 * ⚠️ O QUE ESTE SCRIPT NÃO SABE DISTINGUIR: renomear de propósito de criar-por-cima.
 * As duas ações gravam a mesma coisa. O critério usado aqui é a CADEIA: um documento
 * que troca de nome várias vezes em minutos, com nomes que são irmãos numa taxonomia
 * (Laje, Viga, Pilar, Parede), estava recebendo itens novos — não sendo renomeado
 * cinco vezes. Cadeia de UM passo só fica de fora, porque aí renomear é a leitura
 * mais provável; elas saem listadas no relatório para decisão humana.
 *
 * Uso:
 *   node scripts/infra/restaurar-catalogo-sobrescrito.mjs            (ensaio)
 *   node scripts/infra/restaurar-catalogo-sobrescrito.mjs --gravar   (grava)
 */

const GRAVAR = process.argv.includes('--gravar');
const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT_ID = process.env.GCLOUD_PROJECT || 'os-christus';
/** Cadeia com menos trocas que isto é tratada como renomeação deliberada. */
const MINIMO_DA_CADEIA = 2;

function connect() {
  if (getApps().length > 0) return getFirestore();
  if (EMULATOR) {
    initializeApp({ projectId: PROJECT_ID });
  } else {
    const conta = readServiceAccount(resolveCredentialsPath());
    initializeApp({ credential: cert(conta), projectId: conta.project_id || PROJECT_ID });
  }
  return getFirestore();
}

const db = connect();

// ── o que a auditoria registrou ──────────────────────────────────────────────
/**
 * ⚠️ LÊ A COLEÇÃO INTEIRA, sem `limit`. Medido: são 2.997 entradas de auditoria e 252
 * `catalog.upsert`, das quais **17 ficam fora das 1.000 mais recentes** — um `limit`
 * confortável perderia justamente as cadeias mais antigas, em silêncio.
 */
const logs = await db.collection('auditLogs').get();
const upserts = logs.docs
  .map(d => d.data())
  .filter(a => a?.action === 'catalog.upsert' && a?.before && a?.after)
  .filter(a => String(a.before.name || '') !== String(a.after.name || ''))
  .sort((a, b) => (a.createdAt?.toDate?.() || 0) - (b.createdAt?.toDate?.() || 0));

/** Por documento: o nome original e cada nome que passou por cima dele. */
const cadeias = new Map();
for (const a of upserts) {
  const chave = `${a.entity}/${a.entityId}`;
  if (!cadeias.has(chave)) {
    cadeias.set(chave, {
      entity: a.entity,
      docId: a.entityId,
      original: String(a.before.name || ''),
      // ⚠️ O MOLDE É POR NOME, não o último da cadeia: se alguém trocou o
      // macroserviço no meio, usar o molde final poria os itens anteriores debaixo
      // da categoria errada — e classificação errada é pior que classificação
      // ausente, porque parece certa.
      moldeDe: new Map([[String(a.before.name || ''), a.before]]),
      nomes: [],
      quem: new Set(),
    });
  }
  const c = cadeias.get(chave);
  const nome = String(a.after.name || '');
  c.nomes.push(nome);
  if (!c.moldeDe.has(nome)) c.moldeDe.set(nome, a.after);
  c.quem.add(String(a.actor || '?'));
}

// ── o que existe hoje ────────────────────────────────────────────────────────
const colecoes = [...new Set([...cadeias.values()].map(c => c.entity))];
const existentes = new Map();
for (const col of colecoes) {
  const snap = await db.collection(col).get();
  existentes.set(col, new Map(snap.docs.map(d => [d.id, d.data()])));
}

const nomesJaUsados = new Map(
  colecoes.map(col => [
    col,
    new Set([...existentes.get(col).values()].map(x => String(x?.name || '').trim().toLowerCase())),
  ])
);

function idLivreLocal(col, base) {
  const usados = existentes.get(col);
  let candidato = base;
  for (let i = 1; i <= 50; i += 1) {
    if (!usados.has(candidato)) return candidato;
    candidato = `${base}-${i + 1}`;
  }
  throw new Error(`sem id livre para ${base}`);
}

// ── o plano ──────────────────────────────────────────────────────────────────
const aCriar = [];
const paraDecisaoHumana = [];

for (const c of cadeias.values()) {
  const sobreviveu = String(existentes.get(c.entity)?.get(c.docId)?.name || '').trim();
  // O original + todos os nomes da cadeia, menos o que sobrou no documento.
  const perdidos = [c.original, ...c.nomes]
    .map(n => n.trim())
    .filter(Boolean)
    .filter(n => slugify(n) !== slugify(sobreviveu));
  // ⚠️ DEDUPE PELO SLUG, e não pelo nome em minúsculas: é a mesma comparação que o
  // catálogo usa para o id, então "Forro relacionado à cobertura" e "Forro
  // relacionado a cobertura" são o MESMO item digitado duas vezes — recriar os dois
  // reporia como duplicata justamente o que o defeito já tinha confundido.
  const unicos = [...new Map(perdidos.map(n => [slugify(n), n])).values()];
  if (unicos.length === 0) continue;

  const destino = c.nomes.length >= MINIMO_DA_CADEIA ? aCriar : paraDecisaoHumana;
  for (const nome of unicos) {
    if (nomesJaUsados.get(c.entity).has(nome.toLowerCase())) continue;
    const molde = c.moldeDe.get(nome) || c.moldeDe.values().next().value || {};
    const base = slugify(nome) || slugify(molde?.code || '') || 'item';
    const id = destino === aCriar ? idLivreLocal(c.entity, base) : base;
    destino.push({
      entity: c.entity,
      id,
      nome,
      doc: c.docId,
      sobreviveu,
      passos: c.nomes.length,
      quem: [...c.quem].join(', '),
      molde,
    });
    if (destino === aCriar) {
      existentes.get(c.entity).set(id, { name: nome });
      nomesJaUsados.get(c.entity).add(nome.toLowerCase());
    }
  }
}

console.log(`=== A RECRIAR: ${aCriar.length} itens (cadeias de ${MINIMO_DA_CADEIA}+ trocas) ===`);
for (const item of aCriar) {
  console.log(
    `  ${item.entity}/${item.id.padEnd(26)} "${item.nome}"` +
      `  macro=${item.molde?.macroServiceId || '—'}` +
      `  ← engolido em ${item.doc} (${item.passos} trocas, hoje "${item.sobreviveu}") · ${item.quem}`
  );
}

console.log(`\n=== PARA DECISÃO HUMANA: ${paraDecisaoHumana.length} (uma troca só — pode ter sido renomeação) ===`);
for (const item of paraDecisaoHumana) {
  console.log(`  ${item.entity}/${item.doc}: "${item.nome}" → hoje "${item.sobreviveu}" · ${item.quem}`);
}

if (!GRAVAR) {
  console.log('\n=== ENSAIO. Use --gravar para criar. ===');
  process.exit(0);
}

const agora = new Date();
let gravados = 0;
for (const item of aCriar) {
  const molde = item.molde || {};
  const registro = {
    id: item.id,
    name: item.nome,
    code: String(molde.code || '').trim(),
    active: true,
    createdAt: agora,
    updatedAt: agora,
  };
  if (item.entity === 'serviceCatalog') {
    registro.macroServiceId = String(molde.macroServiceId || '');
    registro.suggestedMaterialIds = [];
  }
  if (item.entity === 'materials') registro.unit = molde.unit ?? null;

  /**
   * ⚠️ RECUSA SE O DOCUMENTO JÁ EXISTE. Este `set` é SEM merge — escrever por cima de
   * um id ocupado seria repetir, com outra roupa, exatamente o defeito que este
   * script repara. O id já passou por `idLivreLocal`; esta é a segunda tranca, contra
   * corrida com alguém mexendo no catálogo pela tela agora.
   */
  const ref = db.collection(item.entity).doc(item.id);
  if ((await ref.get()).exists) {
    console.log(`  ⚠️ PULADO ${item.entity}/${item.id} — documento apareceu nesse meio-tempo`);
    continue;
  }
  await ref.set(registro);
  await db.collection('auditLogs').add({
    actor: 'Restauração de catálogo (script)',
    action: 'catalog.upsert',
    entity: item.entity,
    entityId: item.id,
    before: null,
    after: registro,
    metadata: {
      motivo: 'Recriado a partir da auditoria: o item tinha sido sobrescrito pelo defeito de id do catálogo (corrigido em aabf142).',
      documentoQueEngoliu: item.doc,
    },
    createdAt: agora,
  });
  gravados += 1;
  console.log(`  gravado ${item.entity}/${item.id} "${item.nome}"`);
}
console.log(`\n=== GRAVADOS ${gravados} itens ===`);
process.exit(0);
