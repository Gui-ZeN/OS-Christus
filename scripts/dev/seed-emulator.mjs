// Seed do emulador: cria usuário Admin de teste (Auth + users doc),
// regiões/sedes e tickets em vários status. Rodar com FIRESTORE_EMULATOR_HOST
// e FIREBASE_AUTH_EMULATOR_HOST setados.
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { seedLifecycleFixtures } from './lifecycle-fixtures.mjs';

// Aponta o firebase-admin pro emulador (defaults; sobrescrevíveis por env).
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
process.env.GCLOUD_PROJECT ||= 'os-christus';

initializeApp({ projectId: 'os-christus' });
const db = getFirestore();
const auth = getAuth();

const TEST_EMAIL = 'admin@test.local';
const TEST_PASSWORD = 'Test@123456';
const TERRITORY_USER_EMAIL = 'usuario.pe@test.local';
const DIRECTOR_EMAIL = 'diretor.e2e@test.local';
const MANAGER_EMAIL = 'gestor.e2e@test.local';

async function ensureAuthUser({ email, displayName, role }) {
  const existing = await auth.getUserByEmail(email).catch(() => null);
  const user = existing || (await auth.createUser({
    email,
    password: TEST_PASSWORD,
    emailVerified: true,
    displayName,
  }));
  await auth.setCustomUserClaims(user.uid, {
    role: role.toLowerCase(),
    appRole: role,
  });
  return user;
}

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

let territoryUserUid;
try {
  const existing = await auth.getUserByEmail(TERRITORY_USER_EMAIL).catch(() => null);
  const user = existing || (await auth.createUser({
    email: TERRITORY_USER_EMAIL,
    password: TEST_PASSWORD,
    emailVerified: true,
    displayName: 'Usuário PE',
  }));
  territoryUserUid = user.uid;
  await auth.setCustomUserClaims(territoryUserUid, { role: 'usuario', appRole: 'Usuario' });
} catch (e) {
  console.error('territory user seed failed:', e.message);
  process.exit(1);
}

await db.collection('users').doc('user-pe-test').set({
  name: 'Usuário PE',
  email: TERRITORY_USER_EMAIL,
  authUid: territoryUserUid,
  role: 'Usuario',
  status: 'Ativo',
  active: true,
  regionIds: [],
  siteIds: ['pe'],
});

let directorUid;
let managerUid;
try {
  const [director, manager] = await Promise.all([
    ensureAuthUser({
      email: DIRECTOR_EMAIL,
      displayName: 'Diretor E2E',
      role: 'Diretor',
    }),
    ensureAuthUser({
      email: MANAGER_EMAIL,
      displayName: 'Gestor E2E',
      role: 'Gestor',
    }),
  ]);
  directorUid = director.uid;
  managerUid = manager.uid;
} catch (e) {
  console.error('lifecycle users seed failed:', e.message);
  process.exit(1);
}

await Promise.all([
  db.collection('users').doc('user-director-e2e').set({
    name: 'Diretor E2E',
    email: DIRECTOR_EMAIL,
    authUid: directorUid,
    role: 'Diretor',
    status: 'Ativo',
    active: true,
    regionIds: ['universidade'],
    siteIds: ['pql3'],
  }),
  db.collection('users').doc('user-gestor-e2e').set({
    name: 'Gestor E2E',
    email: MANAGER_EMAIL,
    authUid: managerUid,
    role: 'Gestor',
    status: 'Ativo',
    active: true,
    regionIds: ['universidade'],
    siteIds: ['pql3'],
  }),
]);

// 2) Regiões e sedes (subconjunto representativo)
const regions = [
  { id: 'universidade', code: 'UNI', name: 'Universidade', active: true },
  { id: 'regiao-sul', code: 'RSU', name: 'Região Sul', active: true },
];
const sites = [
  { id: 'pql3', code: 'PQL3', name: 'Parquelândia (PQL3)', regionId: 'universidade', active: true },
  { id: 'dl', code: 'DL', name: 'Dom Luís (DL)', regionId: 'universidade', active: true },
  { id: 'pe', code: 'PE', name: 'Parque Ecológico (PE)', regionId: 'universidade', active: true },
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
  { id: 'OS-0007', status: 'Nova OS', subject: 'Teste territorial da sede PE', site: 'pe', region: 'universidade', sede: 'PE', priority: 'Trivial' },
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

await seedLifecycleFixtures(db, { directorEmail: DIRECTOR_EMAIL });

// Alinha o contador de OS ao maior id semeado. Sem isto o contador fica em 0 e a
// PRIMEIRA criação de OS tenta reservar OS-0001 — que já existe — e bate no guard
// anti-sobrescrita (409). Isso quebrava a duplicação nos testes de integração (e no
// CI, que roda seed + integração na sequência).
const seededNumbers = tickets
  .map(t => Number(String(t.id).replace(/\D/g, '')))
  .filter(n => Number.isFinite(n) && n > 0);
await db.collection('config').doc('ticketSequence').set(
  { lastNumber: seededNumbers.length ? Math.max(...seededNumbers) : 0, updatedAt: now },
  { merge: true }
);

console.log(
  `seed ok: users ${TEST_EMAIL}, ${TERRITORY_USER_EMAIL}, ${DIRECTOR_EMAIL}, ${MANAGER_EMAIL}; ` +
  `${regions.length} regions, ${sites.length} sites, ${tickets.length + 3} tickets`
);
process.exit(0);
