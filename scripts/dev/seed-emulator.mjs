// Seed do emulador: cria usuário Admin de teste (Auth + users doc),
// regiões/sedes e tickets em vários status. Rodar com FIRESTORE_EMULATOR_HOST
// e FIREBASE_AUTH_EMULATOR_HOST setados.
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

// Aponta o firebase-admin pro emulador (defaults; sobrescrevíveis por env).
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
process.env.GCLOUD_PROJECT ||= 'os-christus';

initializeApp({ projectId: 'os-christus' });
const db = getFirestore();
const auth = getAuth();

const TEST_EMAIL = 'admin@test.local';
const TEST_PASSWORD = 'Test@123456';

// 1) Usuário Auth + diretório
let uid;
try {
  const existing = await auth.getUserByEmail(TEST_EMAIL).catch(() => null);
  const user = existing || (await auth.createUser({ email: TEST_EMAIL, password: TEST_PASSWORD, emailVerified: true, displayName: 'Admin Teste' }));
  uid = user.uid;
  await auth.setCustomUserClaims(uid, { role: 'admin', appRole: 'Admin' });
} catch (e) {
  console.error('auth seed failed:', e.message);
  process.exit(1);
}

await db.collection('users').doc('user-admin-test').set({
  name: 'Admin Teste', email: TEST_EMAIL, authUid: uid,
  role: 'Admin', status: 'Ativo', active: true, regionIds: [], siteIds: [],
});

// 2) Regiões e sedes (subconjunto representativo)
const regions = [
  { id: 'universidade', code: 'UNI', name: 'Universidade', active: true },
  { id: 'regiao-sul', code: 'RSU', name: 'Região Sul', active: true },
];
const sites = [
  { id: 'pql3', code: 'PQL3', name: 'Parquelândia (PQL3)', regionId: 'universidade', active: true },
  { id: 'dl', code: 'DL', name: 'Dom Luís (DL)', regionId: 'universidade', active: true },
  { id: 'sul3', code: 'SUL3', name: 'SUL3', regionId: 'regiao-sul', active: true },
];
for (const r of regions) await db.collection('regions').doc(r.id).set(r);
for (const s of sites) await db.collection('sites').doc(s.id).set(s);

// Equipes técnicas (DEFAULT_TEAMS) para o fluxo de triagem/aceite
const teams = [
  { id: 'construtora', name: 'Construtora', type: 'internal', active: true },
  { id: 'infra-sede', name: 'Infra - Sede', type: 'internal', active: true },
  { id: 'refrigeracao', name: 'Refrigeracao', type: 'internal', active: true },
  { id: 'terceiro', name: 'Terceiro', type: 'external', active: true },
];
for (const t of teams) await db.collection('teams').doc(t.id).set(t);

// 3) Tickets em vários status
const now = new Date();
const baseHistory = subject => ([
  { id: `h-${Math.round(Math.random() * 1e9)}`, type: 'customer', sender: 'Solicitante Teste', time: now, text: subject, visibility: 'public' },
]);
const tickets = [
  { id: 'OS-0001', status: 'Nova OS', subject: 'Lâmpada queimada na recepção', site: 'pql3', region: 'universidade', sede: 'PQL3', priority: 'Trivial' },
  { id: 'OS-0002', status: 'Aguardando Parecer Técnico', subject: 'Vazamento no banheiro do 2º andar', site: 'dl', region: 'universidade', sede: 'DL', priority: 'Urgente' },
  { id: 'OS-0003', status: 'Aguardando Orçamento', subject: 'Troca de piso da sala 12', site: 'sul3', region: 'regiao-sul', sede: 'SUL3', priority: 'Moderado' },
  { id: 'OS-0004', status: 'Aguardando Aprovação do Orçamento', subject: 'Reforma da copa', site: 'pql3', region: 'universidade', sede: 'PQL3', priority: 'Moderado' },
  { id: 'OS-0005', status: 'Aguardando pagamento', subject: 'Manutenção do ar-condicionado central', site: 'dl', region: 'universidade', sede: 'DL', priority: 'Urgente' },
  { id: 'OS-0006', status: 'Em andamento', subject: 'Pintura do corredor principal', site: 'sul3', region: 'regiao-sul', sede: 'SUL3', priority: 'Trivial' },
];
for (const t of tickets) {
  await db.collection('tickets').doc(t.id).set({
    id: t.id, trackingToken: `trk_${t.id.toLowerCase().replace(/-/g, '')}`,
    subject: t.subject, requester: 'Solicitante Teste', requesterEmail: 'solicitante@test.local',
    requesterCcEmails: [], status: t.status, type: 'Manutenção Predial Estrutural',
    regionId: t.region, region: regions.find(r => r.id === t.region).name,
    siteId: t.site, sede: t.sede, sector: 'Recepção', location: '', priority: t.priority,
    macroServiceId: null, macroServiceName: null, serviceCatalogId: null, serviceCatalogName: null,
    directorIds: [], directorEmails: [], time: now, createdAt: now, updatedAt: now,
    history: baseHistory(t.subject),
  });
}

console.log(`seed ok: user ${TEST_EMAIL} (uid ${uid}), ${regions.length} regions, ${sites.length} sites, ${tickets.length} tickets`);
process.exit(0);
