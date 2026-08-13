/**
 * BACKUP — a única volta atrás real antes de apagar OS.
 *
 * Por que não basta a auditoria: `writeAuditLog` trunca `history` nas últimas 8
 * entradas e, acima de 400 KB, descarta o snapshot inteiro gravando
 * `{__audit:'omitido'}` (api/_lib/auditLogs.js). Nas OS mais movimentadas — que são
 * exatamente as que este script salva — o `before` chega mutilado ou vazio. E o
 * auditLog nunca guarda os BINÁRIOS do Storage, que a cascata apaga de verdade.
 *
 * Salva tudo que `deleteTicketCascade` destrói: o doc, as cinco subcoleções, a
 * thread de e-mail com as mensagens, inbound/eventos, e os arquivos do bucket.
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=.secrets/os-christus-*.json \
 *     node scripts/infra/backup-os.mjs --escopo=territorio
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolveCredentialsPath, readServiceAccount } from './shared-auth.mjs';
import { ESCOPOS, selecionarOs } from './escopo-os-a-apagar.mjs';

const escopo = (process.argv.find(a => a.startsWith('--escopo=')) || '').split('=')[1];
if (!ESCOPOS[escopo]) {
  console.error(`uso: --escopo=<${Object.keys(ESCOPOS).join('|')}>`);
  process.exit(1);
}

const conta = readServiceAccount(resolveCredentialsPath());
const bucketName = process.env.FIREBASE_STORAGE_BUCKET?.trim() || `${conta.project_id}-attachments`;
initializeApp({ credential: cert(conta), projectId: conta.project_id, storageBucket: bucketName });
const db = getFirestore();

// Importado DEPOIS do initializeApp, como em apagar-os.mjs: api/tickets.js chama
// getStorage() e precisa do app default já de pé.
const { listTicketStorageFiles } = await import('../../api/tickets.js');

// Timestamp do Firestore vira string ISO com marca, para a restauração saber
// distinguir uma data de um texto que por acaso parece data.
const serializar = (_chave, valor) => {
  if (valor && typeof valor === 'object' && typeof valor.toDate === 'function') {
    return { __tipo: 'timestamp', iso: valor.toDate().toISOString() };
  }
  return valor;
};

const lerColecao = async ref => {
  const snap = await ref.get();
  return snap.docs.map(d => ({ id: d.id, dados: d.data() }));
};

const carimbo = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const raiz = path.resolve(process.cwd(), '_os_backups', `${carimbo}__${escopo}`);
fs.mkdirSync(path.join(raiz, 'anexos'), { recursive: true });
console.log(`projeto: ${conta.project_id} | bucket: ${bucketName}`);
console.log(`escopo:  ${escopo} — ${ESCOPOS[escopo]}`);
console.log(`destino: ${raiz}\n`);

const { alvo } = await selecionarOs(db, escopo);
console.log(`OS a salvar: ${alvo.length}\n`);

const manifesto = [];
let arquivosOk = 0;
let arquivosFalhos = 0;
let bytes = 0;

for (const [i, os] of alvo.entries()) {
  const threadRef = db.collection('emailThreads').doc(os.id);
  const [quotes, contracts, payments, measurements, historyEntries, threadMsgs, inbound, eventos, prefs, threadSnap] =
    await Promise.all([
      lerColecao(os.ref.collection('quotes')),
      lerColecao(os.ref.collection('contracts')),
      lerColecao(os.ref.collection('payments')),
      lerColecao(os.ref.collection('measurements')),
      lerColecao(os.ref.collection('historyEntries')),
      lerColecao(threadRef.collection('messages')),
      lerColecao(db.collection('ticketInbound').where('ticketId', '==', os.id)),
      lerColecao(db.collection('emailEvents').where('ticketId', '==', os.id)),
      lerColecao(db.collection('vendorPreferenceEvents').where('ticketId', '==', os.id)),
      threadRef.get(),
    ]);

  // A MESMA varredura da cascata, e não a lista de paths do documento: anexo que
  // chega por e-mail mora em `inbound/` e é referenciado só pelo histórico. Enquanto
  // isto aqui lia `attachments[]` e `closureChecklist.documents[]`, o backup salvava
  // MENOS do que a exclusão apagava — o oposto do motivo de ele existir.
  const arquivos = await listTicketStorageFiles(os.id);

  const anexosSalvos = [];
  for (const arquivo of arquivos) {
    const caminho = arquivo.name;
    // O tipo entra no destino porque o mesmo nome se repete entre pastas
    // (inbound/foto.jpeg e messages/foto.jpeg): sem ele, um sobrescreve o outro e o
    // backup fica com menos arquivos do que diz ter.
    const tipo = caminho.split('/')[2] || 'outros';
    const destino = path.join(raiz, 'anexos', os.id, tipo, path.basename(caminho));
    try {
      fs.mkdirSync(path.dirname(destino), { recursive: true });
      await arquivo.download({ destination: destino });
      bytes += fs.statSync(destino).size;
      anexosSalvos.push({ caminho, arquivo: path.relative(raiz, destino), ok: true });
      arquivosOk += 1;
    } catch (erro) {
      anexosSalvos.push({ caminho, ok: false, erro: String(erro?.message || erro) });
      arquivosFalhos += 1;
      console.error(`  ! anexo não baixado: ${os.id} ${caminho} — ${erro?.message || erro}`);
    }
  }

  const pacote = {
    id: os.id,
    motivos: os.motivos,
    ticket: os.dados,
    subcolecoes: { quotes, contracts, payments, measurements, historyEntries },
    emailThread: threadSnap.exists ? threadSnap.data() : null,
    threadMessages: threadMsgs,
    ticketInbound: inbound,
    emailEvents: eventos,
    vendorPreferenceEvents: prefs,
    anexos: anexosSalvos,
  };
  fs.writeFileSync(path.join(raiz, `${os.id}.json`), JSON.stringify(pacote, serializar, 2), 'utf8');

  manifesto.push({
    id: os.id,
    sede: os.sede,
    status: os.status,
    assunto: os.assunto,
    motivos: os.motivos,
    viva: os.viva,
    contagens: {
      quotes: quotes.length,
      contracts: contracts.length,
      payments: payments.length,
      measurements: measurements.length,
      historyEntries: historyEntries.length,
      historyInline: Array.isArray(os.dados.history) ? os.dados.history.length : 0,
      threadMessages: threadMsgs.length,
      ticketInbound: inbound.length,
      emailEvents: eventos.length,
      vendorPreferenceEvents: prefs.length,
      anexos: anexosSalvos.length,
    },
  });

  if ((i + 1) % 10 === 0 || i + 1 === alvo.length) console.log(`  ${i + 1}/${alvo.length}`);
}

fs.writeFileSync(
  path.join(raiz, '_manifesto.json'),
  JSON.stringify({ escopo, criadoEm: new Date().toISOString(), projeto: conta.project_id, bucket: bucketName, total: alvo.length, os: manifesto }, null, 2),
  'utf8',
);

console.log(`\nOS salvas ............ ${alvo.length}`);
console.log(`anexos baixados ...... ${arquivosOk} (${(bytes / 1024 / 1024).toFixed(1)} MB)`);
console.log(`anexos que FALHARAM .. ${arquivosFalhos}`);
console.log(`\nbackup em: ${raiz}`);
if (arquivosFalhos > 0) {
  console.error('\nATENÇÃO: houve anexo não baixado. NÃO apague antes de resolver.');
  process.exit(2);
}
process.exit(0);
