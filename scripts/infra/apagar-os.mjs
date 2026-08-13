/**
 * APAGA OS em lote, pela MESMA cascata do endpoint admin (`DELETE /api/tickets`).
 *
 * Reaproveita `deleteTicketCascade` em vez de reescrever a cascata: ela carrega a
 * trava `isPathInTicketScope`, que recusa apagar do bucket um anexo cujo path aponta
 * para OUTRA OS. Uma cópia local do laço perderia essa trava sem ninguém notar.
 *
 * Trava de segurança: sem um backup do MESMO escopo cobrindo TODAS as OS-alvo, o
 * --apply se recusa a rodar. A auditoria não substitui o backup — ela trunca o
 * history em 8 entradas, descarta snapshots acima de 400 KB e nunca guarda binário.
 *
 *   node scripts/infra/apagar-os.mjs --escopo=territorio            # ensaio (padrão)
 *   node scripts/infra/apagar-os.mjs --escopo=territorio --apply    # apaga
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolveCredentialsPath, readServiceAccount } from './shared-auth.mjs';
import { ESCOPOS, selecionarOs } from './escopo-os-a-apagar.mjs';

const escopo = (process.argv.find(a => a.startsWith('--escopo=')) || '').split('=')[1];
const APLICAR = process.argv.includes('--apply');
if (!ESCOPOS[escopo]) {
  console.error(`uso: --escopo=<${Object.keys(ESCOPOS).join('|')}> [--apply]`);
  process.exit(1);
}

const conta = readServiceAccount(resolveCredentialsPath());
const bucketName = process.env.FIREBASE_STORAGE_BUCKET?.trim() || `${conta.project_id}-attachments`;
initializeApp({ credential: cert(conta), projectId: conta.project_id, storageBucket: bucketName });
const db = getFirestore();

// Importado DEPOIS do initializeApp: api/tickets.js chama getStorage() na cascata e
// writeAuditLog chama getAdminDb(), e ambos precisam do app default já de pé.
const { deleteTicketCascade } = await import('../../api/tickets.js');
const { writeAuditLog } = await import('../../api/_lib/auditLogs.js');

console.log(`projeto: ${conta.project_id} | bucket: ${bucketName}`);
console.log(`escopo:  ${escopo} — ${ESCOPOS[escopo]}\n`);

const { alvo, todas, preservadas } = await selecionarOs(db, escopo);
const vivas = alvo.filter(o => o.viva);
console.log(`preservadas por decisão explícita: ${preservadas.length ? preservadas.map(o => o.id).join(', ') : 'nenhuma casava com este escopo'}`);

console.log(`base .............. ${todas.length} OS`);
console.log(`a apagar .......... ${alvo.length} (${((alvo.length / todas.length) * 100).toFixed(0)}% da base)`);
console.log(`...ainda vivas .... ${vivas.length}`);
console.log(`...só por "thais" . ${alvo.filter(o => o.motivos.length === 1 && o.thais).length}`);

const porSede = new Map();
alvo.forEach(o => porSede.set(o.sede, (porSede.get(o.sede) || 0) + 1));
console.log(`\npor sede: ${[...porSede.entries()].sort((a, b) => b[1] - a[1]).map(([s, n]) => `${s}=${n}`).join('  ')}`);

// --- trava: exige backup do mesmo escopo cobrindo todo o alvo ---
const pastaBackups = path.resolve(process.cwd(), '_os_backups');
const candidatos = fs.existsSync(pastaBackups)
  ? fs.readdirSync(pastaBackups).filter(n => n.endsWith(`__${escopo}`)).sort().reverse()
  : [];
let backup = null;
for (const nome of candidatos) {
  const arquivo = path.join(pastaBackups, nome, '_manifesto.json');
  if (!fs.existsSync(arquivo)) continue;
  const m = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  const salvos = new Set(m.os.map(o => o.id));
  const faltando = alvo.filter(o => !salvos.has(o.id)).map(o => o.id);
  if (faltando.length === 0) {
    backup = { nome, total: m.total };
    break;
  }
  console.log(`\nbackup ${nome} descartado: não cobre ${faltando.length} OS (${faltando.slice(0, 5).join(', ')}…)`);
}
console.log(`\nbackup ....... ${backup ? `${backup.nome} (${backup.total} OS) ✓` : 'NENHUM que cubra o alvo ✗'}`);

if (!APLICAR) {
  console.log('\nENSAIO — nada foi apagado. Para valer: --apply');
  console.log('primeiras 15 do alvo:');
  alvo.slice(0, 15).forEach(o => console.log(`  ${o.id} [${o.sede}] ${o.status.padEnd(16)} (${o.motivos.join('+')}) ${o.assunto.slice(0, 46)}`));
  process.exit(0);
}

if (!backup) {
  console.error('\nRECUSADO: rode antes `node scripts/infra/backup-os.mjs --escopo=' + escopo + '`.');
  process.exit(1);
}

const ator = `script:apagar-os (${process.env.USERNAME || process.env.USER || 'desconhecido'})`;
console.log(`\nAPAGANDO ${alvo.length} OS como ${ator}…\n`);

const falhas = [];
let feitas = 0;
for (const os of alvo) {
  try {
    const r = await deleteTicketCascade(db, os.id);
    await writeAuditLog({
      actor: ator,
      action: 'tickets.delete',
      entity: 'ticket',
      entityId: os.id,
      before: r.before,
      after: r.deleted,
      metadata: { lote: escopo, motivos: os.motivos, backup: backup.nome },
    });
    feitas += 1;
    if (feitas % 10 === 0 || feitas === alvo.length) console.log(`  ${feitas}/${alvo.length}`);
  } catch (erro) {
    falhas.push({ id: os.id, erro: String(erro?.message || erro) });
    console.error(`  ! ${os.id}: ${erro?.message || erro}`);
  }
}

console.log(`\napagadas: ${feitas} | falhas: ${falhas.length}`);
falhas.forEach(f => console.error(`  ${f.id}: ${f.erro}`));
process.exit(falhas.length ? 2 : 0);
