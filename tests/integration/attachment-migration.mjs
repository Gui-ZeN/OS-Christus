import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { migrateLegacyAttachmentBatch } from '../../api/_lib/attachmentMigration.js';

process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';

initializeApp({ projectId: 'os-christus' });
const db = getFirestore();
const TICKET = 'OS-AM01';
const safePath = `attachments/tickets/messages/${TICKET}/message-1/foto.jpg`;
const historyPath = `attachments/tickets/inbound/${TICKET}/mail-1/documento.pdf`;
const invalidPath = 'attachments/tickets/messages/OS-OUTRA/message-1/invalido.pdf';

const metadataByPath = new Map([
  [safePath, { metadata: { firebaseStorageDownloadTokens: 'token-root' } }],
  [historyPath, { metadata: { firebaseStorageDownloadTokens: 'token-history' } }],
]);

const bucket = {
  file(path) {
    return {
      async getMetadata() {
        const metadata = metadataByPath.get(path);
        if (!metadata) {
          const error = new Error('Objeto não encontrado.');
          error.code = 404;
          throw error;
        }
        return [structuredClone(metadata)];
      },
      async setMetadata(next) {
        metadataByPath.set(path, structuredClone(next));
      },
    };
  },
};

const results = [];
function check(name, pass, detail = '') {
  results.push({ pass });
  console.log(`${pass ? 'PASS' : 'FALHOU'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function cleanup() {
  const ref = db.collection('tickets').doc(TICKET);
  for (const sub of ['quotes', 'contracts', 'payments', 'measurements', 'historyEntries']) {
    const snap = await ref.collection(sub).get();
    await Promise.all(snap.docs.map(doc => doc.ref.delete()));
  }
  await ref.delete().catch(() => {});
}

await cleanup();
const ref = db.collection('tickets').doc(TICKET);
await ref.set({
  id: TICKET,
  subject: 'migração de anexos',
  attachments: [
    {
      name: 'foto.jpg',
      path: safePath,
      url: 'https://firebasestorage.googleapis.com/v0/b/bucket/o/foto?alt=media&token=root',
    },
    {
      name: 'sem-caminho.pdf',
      url: 'https://storage.googleapis.com/bucket/file?X-Goog-Signature=assinatura',
    },
    {
      name: 'fora-do-escopo.pdf',
      path: invalidPath,
      url: 'https://firebasestorage.googleapis.com/v0/b/bucket/o/invalido?alt=media&token=bad',
    },
  ],
  createdAt: new Date(),
  updatedAt: new Date(),
});
await ref.collection('historyEntries').doc('history-1').set({
  id: 'history-1',
  attachments: [{
    name: 'documento.pdf',
    signedFilePath: historyPath,
    signedFileUrl: 'https://storage.googleapis.com/bucket/documento?X-Goog-Signature=assinatura',
  }],
});

// cursor: a varredura é por documentId sobre a coleção INTEIRA e o limite é 10.
// Sem começar depois das OS numéricas (OS-0001...), o seed sozinho preenche a
// página e as OS deste teste (OS-AM*) nunca entram — o teste passava por acaso,
// dependendo de quantas OS existiam no emulador.
const START_AFTER = 'OS-0999';
const dry = await migrateLegacyAttachmentBatch(db, bucket, { limit: 10, cursor: START_AFTER, dryRun: true });
const afterDry = (await ref.get()).data();
check('dry-run identifica os documentos afetados', dry.changedDocuments >= 2);
check('dry-run identifica tokens sem revogá-los', dry.storage.tokenizedObjects === 2 && dry.storage.revokedTokens === 0);
check('dry-run identifica caminho fora do escopo', dry.invalidStoragePaths === 1);
check('dry-run não altera a URL segura', Boolean(afterDry.attachments[0].url));

const applied = await migrateLegacyAttachmentBatch(db, bucket, { limit: 10, cursor: START_AFTER, dryRun: false });
const afterApply = (await ref.get()).data();
const historyAfter = (await ref.collection('historyEntries').doc('history-1').get()).data();
check('aplicação remove URL quando existe path protegido', !afterApply.attachments[0].url);
check('aplicação remove signed URL do histórico completo', !historyAfter.attachments[0].signedFileUrl);
check('URL sem path permanece para saneamento manual', Boolean(afterApply.attachments[1].url));
check('URL com path fora do escopo permanece intacta', Boolean(afterApply.attachments[2].url));
check('tokens dos objetos seguros são revogados', applied.storage.revokedTokens === 2);
check(
  'metadados não conservam token de download',
  !metadataByPath.get(safePath)?.metadata?.firebaseStorageDownloadTokens &&
    !metadataByPath.get(historyPath)?.metadata?.firebaseStorageDownloadTokens
);

// ---------- Objeto INEXISTENTE no Storage: a url é o único acesso ----------
// Um `path` fantasma (arquivo apagado, migração manual errada) com url tokenizada
// funcional: apagar a url destruiria o anexo do ponto de vista do usuário.
const GHOST = 'OS-AM02';
const ghostPath = `attachments/tickets/messages/${GHOST}/message-1/fantasma.pdf`;
const ghostRef = db.collection('tickets').doc(GHOST);
await ghostRef.delete().catch(() => {});
await ghostRef.set({
  id: GHOST,
  subject: 'path fantasma',
  attachments: [
    {
      name: 'fantasma.pdf',
      path: ghostPath, // objeto NÃO existe no bucket (não está em metadataByPath)
      url: 'https://firebasestorage.googleapis.com/v0/b/bucket/o/fantasma?alt=media&token=vivo',
    },
  ],
});

const ghostRun = await migrateLegacyAttachmentBatch(db, bucket, {
  limit: 10,
  cursor: 'OS-AM01',
  dryRun: false,
});
const ghostAfter = (await ghostRef.get()).data();
check(
  'objeto inexistente: URL PRESERVADA (não destrói o único acesso)',
  Boolean(ghostAfter.attachments[0].url),
  `url=${JSON.stringify(ghostAfter.attachments[0].url).slice(0, 40)}`
);
check(
  'objeto inexistente: documento contabilizado como pulado',
  ghostRun.skippedUnverifiedDocuments >= 1,
  `skipped=${ghostRun.skippedUnverifiedDocuments}`
);
check(
  'objeto inexistente: path aparece nas amostras para tratamento manual',
  (ghostRun.storage.missingSamples || []).includes(ghostPath),
  `missingSamples=${JSON.stringify(ghostRun.storage.missingSamples)}`
);
await ghostRef.delete().catch(() => {});

await cleanup();

const failed = results.filter(result => !result.pass).length;
console.log(`\n=== ${results.length - failed}/${results.length} OK ===`);
process.exit(failed ? 1 : 0);
