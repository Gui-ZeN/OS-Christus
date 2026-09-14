import process from 'node:process';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readServiceAccount, resolveCredentialsPath } from './shared-auth.mjs';

/**
 * MEDIÇÃO (somente leitura): o que a auditoria diz que foi salvo × o que está no
 * catálogo agora.
 *
 * ⚠️ POR QUE ESTE SCRIPT EXISTE. A tela de Auditoria escreve a MESMA linha para criar,
 * editar, desativar e reativar item do catálogo — todas são `catalog.upsert`, e o
 * texto sai "serviceCatalog salvo(a): <nome>". Então, olhando a tela, não dá para
 * distinguir "criei e sumiu" de "desativei" nem de "sobrescrevi sem querer".
 *
 * O id do documento vinha de `slugify(code || name)`, gravado com `set(merge: true)`
 * sem checar existência — dois nomes (ou dois códigos) que produzem o mesmo slug
 * caíam no MESMO documento, e o segundo renomeava o primeiro calado. É esse rastro
 * que este script procura: entrada de auditoria cujo nome NÃO é mais o nome do
 * documento que ela diz ter salvo.
 *
 * Uso:
 *   node scripts/infra/medir-catalogo-sobrescrito.mjs               (produção, leitura)
 *   node scripts/infra/medir-catalogo-sobrescrito.mjs 2026-09-14    (só o dia)
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/infra/...   (emulador)
 */

const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT_ID = process.env.GCLOUD_PROJECT || 'os-christus';
const COLECOES = ['macroServices', 'serviceCatalog', 'materials', 'regions', 'sites'];

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

function paraData(valor) {
  if (!valor) return null;
  if (typeof valor?.toDate === 'function') return valor.toDate();
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? null : data;
}

function emFortaleza(data) {
  if (!data) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Fortaleza',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(data);
}

function diaEmFortaleza(data) {
  if (!data) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Fortaleza',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(data);
}

async function main() {
  const db = connect();
  const diaAlvo = String(process.argv[2] || '').trim();

  console.log(`\nAlvo: ${EMULATOR ? `EMULADOR (${EMULATOR})` : `PRODUÇÃO (${PROJECT_ID})`}`);
  console.log('Modo: SOMENTE LEITURA — este script não escreve nada.');
  if (diaAlvo) console.log(`Recorte: ${diaAlvo} (dia civil em Fortaleza)`);
  console.log('');

  // 1) O catálogo como está agora.
  const itens = new Map();
  for (const colecao of COLECOES) {
    const snap = await db.collection(colecao).get();
    for (const doc of snap.docs) {
      const dados = doc.data() || {};
      itens.set(`${colecao}:${doc.id}`, {
        colecao,
        id: doc.id,
        name: String(dados.name || ''),
        code: String(dados.code || ''),
        active: dados.active !== false,
        createdAt: paraData(dados.createdAt),
        updatedAt: paraData(dados.updatedAt),
      });
    }
    console.log(`${colecao.padEnd(16)} ${snap.size} itens`);
  }

  // 2) O que a auditoria diz que foi salvo.
  const auditSnap = await db.collection('auditLogs').where('action', '==', 'catalog.upsert').get();
  const registros = auditSnap.docs
    .map(doc => {
      const dados = doc.data() || {};
      return {
        quando: paraData(dados.createdAt),
        ator: String(dados.actor?.name || dados.actor?.email || dados.actor || ''),
        entity: String(dados.entity || ''),
        entityId: String(dados.entityId || ''),
        nomeAntes: dados.before ? String(dados.before.name || '') : null,
        nomeDepois: dados.after ? String(dados.after.name || '') : '',
      };
    })
    .filter(r => (diaAlvo ? diaEmFortaleza(r.quando) === diaAlvo : true))
    .sort((a, b) => (a.quando?.getTime() || 0) - (b.quando?.getTime() || 0));

  console.log(`\nauditoria: ${registros.length} gravações de catálogo${diaAlvo ? ' no recorte' : ''}\n`);

  // 3) O cruzamento.
  const sumiram = [];
  const sobrescreveram = [];

  for (const registro of registros) {
    const atual = itens.get(`${registro.entity}:${registro.entityId}`);
    // A gravação renomeou um item que já existia com OUTRO nome: sobrescrita.
    if (registro.nomeAntes && registro.nomeAntes !== registro.nomeDepois) {
      sobrescreveram.push({ ...registro, atual });
    }
    // O nome que foi salvo não é mais o nome do documento: alguém passou por cima.
    if (atual && registro.nomeDepois && atual.name !== registro.nomeDepois) {
      sumiram.push({ ...registro, atual });
    }
    if (!atual) {
      sumiram.push({ ...registro, atual: null });
    }
  }

  console.log('── gravações que RENOMEARAM um item existente ──');
  if (sobrescreveram.length === 0) console.log('   (nenhuma)');
  for (const r of sobrescreveram) {
    console.log(
      `   ${emFortaleza(r.quando)}  ${r.ator}  ${r.entity}/${r.entityId}: "${r.nomeAntes}" -> "${r.nomeDepois}"`
    );
  }

  console.log('\n── nomes salvos que NÃO estão mais no documento ──');
  if (sumiram.length === 0) console.log('   (nenhum)');
  for (const r of sumiram) {
    const agora = r.atual ? `hoje é "${r.atual.name}"${r.atual.active ? '' : ' (inativo)'}` : 'o documento NÃO EXISTE mais';
    console.log(`   ${emFortaleza(r.quando)}  ${r.ator}  ${r.entity}/${r.entityId}: salvou "${r.nomeDepois}" — ${agora}`);
  }

  // 4) Itens inativos, que existem mas somem dos seletores.
  const inativos = [...itens.values()].filter(item => !item.active);
  console.log(`\n── itens DESATIVADOS (existem, mas não aparecem nos seletores): ${inativos.length} ──`);
  for (const item of inativos) {
    console.log(`   ${item.colecao}/${item.id}: "${item.name}" — última gravação ${emFortaleza(item.updatedAt)}`);
  }

  console.log('');
}

main().catch(error => {
  console.error('falhou:', error?.message || error);
  process.exit(1);
});
