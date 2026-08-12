/**
 * Reconstrói as LÁPIDES das OS já apagadas, a partir do backup da exclusão.
 *
 * A cascata passou a registrar a lápide sozinha (`recordDeletedTicket`), mas as 105 OS
 * da universidade saíram antes disso. Sem elas, cada resposta a uma daquelas conversas
 * continua virando OS nova — foi assim que a OS-0331 nasceu horas depois da exclusão.
 *
 * O backup guarda o que a lápide precisa: `emailThread.gmailThreadId` em 107 das 108
 * OS, mais 319 ids de mensagem entre `threadMessages` e `ticketInbound`.
 *
 * Grava SÓ identificadores técnicos — id da OS, id da thread, ids das mensagens. Nada
 * de assunto, corpo, remetente ou anexo: a exclusão foi pedida para que esses dados
 * sumissem, e uma lápide com conteúdo derrotaria o propósito de apagar.
 *
 *   node scripts/infra/lapides-do-backup.mjs --dir=_os_backups/<pasta>
 *   node scripts/infra/lapides-do-backup.mjs --dir=_os_backups/<pasta> --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolveCredentialsPath, readServiceAccount } from './shared-auth.mjs';
import { collectMessageIds, recordDeletedTicket } from '../../api/_lib/deletedTickets.js';

const APLICAR = process.argv.includes('--apply');
const dir = (process.argv.find(a => a.startsWith('--dir=')) || '').split('=').slice(1).join('=');
if (!dir || !fs.existsSync(dir)) {
  console.error('uso: --dir=<pasta do backup> [--apply]');
  process.exit(1);
}

initializeApp({ credential: cert(readServiceAccount(resolveCredentialsPath())) });
const db = getFirestore();

const arquivos = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
console.log(`backup: ${dir}`);
console.log(`arquivos: ${arquivos.length}\n`);

const prontas = [];
const semSinal = [];
const jaVivas = [];

for (const arquivo of arquivos) {
  const dados = JSON.parse(fs.readFileSync(path.join(dir, arquivo), 'utf8'));
  const ticketId = String(dados.id || dados.ticket?.id || '').trim();
  if (!ticketId) continue;

  // OS que voltou a existir (recriada, ou nunca foi apagada) não leva lápide: ela
  // faria o inbound recusar mensagem de uma OS VIVA.
  const viva = await db.collection('tickets').doc(ticketId).get();
  if (viva.exists) { jaVivas.push(ticketId); continue; }

  const thread = dados.emailThread || {};
  const mensagens = Array.isArray(dados.threadMessages) ? dados.threadMessages : [];
  const inbound = Array.isArray(dados.ticketInbound) ? dados.ticketInbound : [];
  const messageIds = collectMessageIds([
    thread.lastMessageId,
    thread.rootMessageId,
    thread.references,
    mensagens.map(m => m.messageId || m.id),
    inbound.map(m => m.messageId),
  ]);

  if (!thread.gmailThreadId && messageIds.length === 0) { semSinal.push(ticketId); continue; }
  prontas.push({ ticketId, gmailThreadId: thread.gmailThreadId || null, messageIds });
}

console.log(`lápides a gravar     : ${prontas.length}`);
console.log(`OS vivas (puladas)   : ${jaVivas.length}${jaVivas.length ? ` (${jaVivas.slice(0, 5).join(', ')})` : ''}`);
console.log(`sem thread nem msg   : ${semSinal.length}${semSinal.length ? ` (${semSinal.slice(0, 5).join(', ')})` : ''}`);

const totalIds = prontas.reduce((soma, p) => soma + p.messageIds.length, 0);
console.log(`ids de mensagem      : ${totalIds}`);
console.log('\namostra');
prontas.slice(0, 5).forEach(p =>
  console.log(`  ${p.ticketId}  thread=${String(p.gmailThreadId || '—').slice(0, 18)}  ${p.messageIds.length} msg`)
);

if (!APLICAR) {
  console.log('\nENSAIO — nada foi gravado. Para aplicar: --apply');
  process.exit(0);
}

let gravadas = 0;
for (const p of prontas) {
  if (await recordDeletedTicket(db, p)) gravadas += 1;
}
console.log(`\nGRAVADAS: ${gravadas}`);
process.exit(0);
