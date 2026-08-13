/**
 * Apaga do bucket os anexos de OS que NÃO EXISTEM MAIS.
 *
 * Passivo deixado pela cascata antiga, que só apagava os paths de `attachments[]` e
 * `closureChecklist.documents[]` — anexo chegado por e-mail (`inbound/`) ficava para
 * sempre. A cascata já foi corrigida (deleteTicketStorageFolder); isto limpa o que
 * ela deixou para trás antes da correção.
 *
 *   node scripts/infra/limpar-anexos-orfaos.mjs           # ensaio (padrão)
 *   node scripts/infra/limpar-anexos-orfaos.mjs --apply
 */
import process from 'node:process';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { resolveCredentialsPath, readServiceAccount } from './shared-auth.mjs';

const APLICAR = process.argv.includes('--apply');
const conta = readServiceAccount(resolveCredentialsPath());
const bucketName = process.env.FIREBASE_STORAGE_BUCKET?.trim() || `${conta.project_id}-attachments`;
initializeApp({ credential: cert(conta), projectId: conta.project_id, storageBucket: bucketName });
const db = getFirestore();
const bucket = getStorage().bucket();

console.log(`projeto: ${conta.project_id} | bucket: ${bucketName}\n`);

// ORDEM IMPORTA: lista os arquivos ANTES de ler as OS. Assim, uma OS criada durante
// a varredura já aparece na lista de vivas — e os anexos dela nunca entram no alvo.
const [arquivos] = await bucket.getFiles({ prefix: 'attachments/tickets/' });
const vivas = new Set((await db.collection('tickets').get()).docs.map(d => d.id));
console.log(`arquivos no bucket: ${arquivos.length}`);
console.log(`OS vivas: ${vivas.size}\n`);

const porOs = new Map();
for (const f of arquivos) {
  const partes = f.name.split('/'); // attachments/tickets/<tipo>/<osId>/...
  const osId = partes[3];
  if (partes.length <= 4 || partes[0] !== 'attachments' || partes[1] !== 'tickets' || !osId) continue;
  if (vivas.has(osId)) continue;
  if (!porOs.has(osId)) porOs.set(osId, []);
  porOs.get(osId).push(f);
}

const totalArquivos = [...porOs.values()].reduce((s, v) => s + v.length, 0);
const totalBytes = [...porOs.values()].flat().reduce((s, f) => s + Number(f.metadata.size || 0), 0);
console.log(`ÓRFÃOS: ${totalArquivos} arquivos de ${porOs.size} OS — ${(totalBytes / 1024 / 1024).toFixed(1)} MB`);
[...porOs.entries()].slice(0, 10).forEach(([os, fs_]) => console.log(`  ${os}: ${fs_.length} arquivo(s)`));

if (!APLICAR) {
  console.log('\nENSAIO — nada foi apagado. Para valer: --apply');
  process.exit(0);
}

console.log('\napagando…');
let apagados = 0;
let pulados = 0;
const falhas = [];
for (const [osId, lista] of porOs) {
  // Rede de segurança: relê a OS agora. Se ela existir (recriada, ou lida errado na
  // varredura), os arquivos dela ficam. Anexo apagado à toa não volta.
  if ((await db.collection('tickets').doc(osId).get()).exists) {
    console.log(`  ~ ${osId} voltou a existir — preservada`);
    pulados += lista.length;
    continue;
  }
  for (const f of lista) {
    try {
      await f.delete({ ignoreNotFound: true });
      apagados += 1;
    } catch (erro) {
      falhas.push(`${f.name}: ${erro?.message || erro}`);
    }
  }
  if (apagados % 100 < lista.length) console.log(`  ${apagados}/${totalArquivos}`);
}

console.log(`\napagados: ${apagados} | preservados: ${pulados} | falhas: ${falhas.length}`);
falhas.slice(0, 10).forEach(f => console.error(`  ${f}`));
process.exit(falhas.length ? 2 : 0);
