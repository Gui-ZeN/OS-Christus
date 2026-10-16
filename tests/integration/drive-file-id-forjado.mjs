// Teste de integração: `driveFileId` de anexo é campo SÓ DO SERVIDOR.
// Antes, o PATCH gravava o anexo como veio do cliente, e o download entregava o
// arquivo do Drive cujo id estivesse gravado na OS. Um Gestor da região X plantava
// numa OS DELE o id de um arquivo arquivado de outra OS (região Y) e baixava.
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';

const API = 'http://127.0.0.1:3001';
const AUTH = 'http://127.0.0.1:9099';
// Gestor do seed: universidade/pql3. A OS alheia é da regiao-sul.
const OWN = 'OS-DRVF01';
const OTHER = 'OS-DRVF02';
const STOLEN_ID = 'drive-arquivo-da-outra-os';
const OWN_ARCHIVED_ID = 'drive-arquivo-da-propria-os';

initializeApp({ projectId: 'os-christus' });
const db = getFirestore();

const results = [];
function check(name, pass, detail = '') {
  results.push({ pass });
  console.log(`${pass ? 'PASS' : 'FALHOU'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function signIn(email) {
  const res = await fetch(
    `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'Test@123456', returnSecureToken: true }),
    }
  );
  const json = await res.json();
  if (!json.idToken) throw new Error(`sem idToken para ${email}: ${JSON.stringify(json)}`);
  return json.idToken;
}

async function patch(token, updates) {
  const res = await fetch(`${API}/api/tickets`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ id: OWN, updates }),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function download(token, path, driveFileId) {
  const query = new URLSearchParams({ ticketId: OWN, path, driveFileId });
  const res = await fetch(`${API}/api/attachments?${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  let error = '';
  try {
    error = (await res.clone().json())?.error || '';
  } catch {
    error = '';
  }
  return { status: res.status, error };
}

function allDriveIds(value, found = []) {
  if (Array.isArray(value)) value.forEach(item => allDriveIds(item, found));
  else if (value && typeof value === 'object') {
    if (value.driveFileId) found.push(value.driveFileId);
    Object.values(value).forEach(item => allDriveIds(item, found));
  }
  return found;
}

const ownRef = db.collection('tickets').doc(OWN);
const otherRef = db.collection('tickets').doc(OTHER);
const ownArchivedPath = `attachments/tickets/pdfs/${OWN}/laudo.pdf`;
const plantedPath = `attachments/tickets/pdfs/${OWN}/plantado.pdf`;

async function cleanup() {
  for (const ref of [ownRef, otherRef]) {
    const hist = await ref.collection('historyEntries').get();
    await Promise.all(hist.docs.map(d => d.ref.delete()));
    await ref.delete().catch(() => {});
  }
}

await cleanup();

await otherRef.set({
  id: OTHER,
  subject: 'OS de outra região',
  status: 'Encerrada',
  regionId: 'regiao-sul',
  siteId: 'sede-sul',
  attachments: [{ name: 'contrato.pdf', path: `attachments/tickets/pdfs/${OTHER}/contrato.pdf`, archived: true, driveFileId: STOLEN_ID }],
  createdAt: new Date(),
  updatedAt: new Date(),
});
await ownRef.set({
  id: OWN,
  subject: 'OS do gestor',
  status: 'Em andamento',
  regionId: 'universidade',
  siteId: 'pql3',
  attachments: [{ name: 'laudo.pdf', path: ownArchivedPath, archived: true, driveFileId: OWN_ARCHIVED_ID }],
  createdAt: new Date(),
  updatedAt: new Date(),
});

const gestor = await signIn('gestor.e2e@test.local');
const forged = { name: 'plantado.pdf', path: plantedPath, archived: true, driveFileId: STOLEN_ID };

const res = await patch(gestor, {
  attachments: [
    { name: 'laudo.pdf', path: ownArchivedPath }, // tela reenvia o arquivado sem os campos
    forged,
  ],
  orcamento: { anexos: [forged], notas: [{ id: 'n1', texto: 'nota', anexo: forged }] },
  history: [{ id: `h-${Date.now()}`, type: 'internal', text: 'anexo', time: new Date().toISOString(), attachments: [forged] }],
});
check('PATCH do Gestor na OS dele é aceito', res.status === 200, `HTTP ${res.status} ${JSON.stringify(res.json).slice(0, 160)}`);

const saved = (await ownRef.get()).data() || {};
const hist = await ownRef.collection('historyEntries').get();
const ids = allDriveIds([saved, ...hist.docs.map(d => d.data())]);
check(
  'driveFileId forjado NÃO fica gravado (attachments, orcamento, history)',
  !ids.includes(STOLEN_ID),
  `ids gravados: ${JSON.stringify(ids)}`
);
const keptArchived = (saved.attachments || []).find(a => a.path === ownArchivedPath);
check(
  'anexo já arquivado reenviado sem os campos continua apontando para o Drive',
  keptArchived?.driveFileId === OWN_ARCHIVED_ID && keptArchived?.archived === true,
  JSON.stringify(keptArchived)
);
check(
  'o anexo plantado ficou gravado como anexo comum (sem archived)',
  (saved.attachments || []).some(a => a.path === plantedPath && a.archived === undefined && a.driveFileId === undefined)
);

const dl = await download(gestor, plantedPath, STOLEN_ID);
check('download com o driveFileId alheio é recusado (404)', dl.status === 404, `HTTP ${dl.status} "${dl.error}"`);

await cleanup();

const failed = results.filter(r => !r.pass).length;
console.log(`\n=== ${results.length - failed}/${results.length} OK ===`);
process.exit(failed ? 1 : 0);
