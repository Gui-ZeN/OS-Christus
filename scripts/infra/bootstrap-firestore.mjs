import process from 'node:process';
import { randomUUID } from 'node:crypto';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { createStorageClient, readServiceAccount, resolveCredentialsPath } from './shared-auth.mjs';

const DEFAULT_REGIONS = [
  { id: 'dionisio-torres', name: 'Região Dionísio Torres', code: 'DT', active: true },
  { id: 'aldeota', name: 'Região Aldeota', code: 'ALD', active: true },
  { id: 'parquelandia', name: 'Região Parquelândia', code: 'PQL', active: true },
  { id: 'sul', name: 'Região Sul', code: 'SUL', active: true },
  { id: 'benfica', name: 'Região Benfica', code: 'BN', active: true },
  { id: 'universidade', name: 'Universidade', code: 'UNI', active: true },
];

const DEFAULT_SITES = [
  { id: 'dt', name: 'DT', regionId: 'dionisio-torres', code: 'DT', active: true },
  { id: 'dt2', name: 'DT2', regionId: 'dionisio-torres', code: 'DT2', active: true },
  { id: 'pdt', name: 'PDT', regionId: 'dionisio-torres', code: 'PDT', active: true },
  { id: 'idiomas', name: 'IDIOMAS', regionId: 'dionisio-torres', code: 'IDIOMAS', active: true },
  { id: 'bs', name: 'BS', regionId: 'aldeota', code: 'BS', active: true },
  { id: 'sp', name: 'SP', regionId: 'aldeota', code: 'SP', active: true },
  { id: 'pnv', name: 'PNV', regionId: 'aldeota', code: 'PNV', active: true },
  { id: 'pql1', name: 'PQL1', regionId: 'parquelandia', code: 'PQL1', active: true },
  { id: 'pql2', name: 'PQL2', regionId: 'parquelandia', code: 'PQL2', active: true },
  { id: 'pjf', name: 'PJF', regionId: 'parquelandia', code: 'PJF', active: true },
  { id: 'sul1', name: 'SUL1', regionId: 'sul', code: 'SUL1', active: true },
  { id: 'sul2', name: 'SUL2', regionId: 'sul', code: 'SUL2', active: true },
  { id: 'sul3', name: 'SUL3', regionId: 'sul', code: 'SUL3', active: true },
  { id: 'psul', name: 'PSUL', regionId: 'sul', code: 'PSUL', active: true },
  { id: 'bn', name: 'BN', regionId: 'benfica', code: 'BN', active: true },
  { id: 'dl', name: 'Dom Luís', regionId: 'universidade', code: 'DL', active: true },
  { id: 'pe', name: 'Parque Ecológico', regionId: 'universidade', code: 'PE', active: true },
  { id: 'eus', name: 'Eusébio', regionId: 'universidade', code: 'EUS', active: true },
  { id: 'pql3', name: 'Parquelândia', regionId: 'universidade', code: 'PQL3', active: true },
  { id: 'bn-uni', name: 'Benfica', regionId: 'universidade', code: 'BN', active: true },
  { id: 'ald', name: 'Aldeota', regionId: 'universidade', code: 'ALD', active: true },
];

const DEFAULT_TEAMS = [
  { id: 'construtora', name: 'Construtora', type: 'internal', active: true },
  { id: 'informatica', name: 'Informática', type: 'internal', active: true },
  { id: 'infra-compras', name: 'Infra - Compras', type: 'internal', active: true },
  { id: 'infra-coordenacao', name: 'Infra - Coordenação', type: 'internal', active: true },
  { id: 'infra-sede', name: 'Infra - Sede', type: 'internal', active: true },
  { id: 'fornecedor-externo', name: 'Fornecedor externo', type: 'external', active: true },
];

const DEFAULT_USERS = [
  { id: 'rafael', name: 'Rafael', role: 'Admin', email: 'rafael@empresa.com', status: 'Ativo', regionIds: [], siteIds: [], active: true },
  { id: 'leonardo', name: 'Leonardo', role: 'Diretor', email: 'leonardo@empresa.com', status: 'Ativo', regionIds: [], siteIds: [], active: true },
  { id: 'murilo', name: 'Murilo', role: 'Diretor', email: 'murilo@empresa.com', status: 'Ativo', regionIds: [], siteIds: [], active: true },
  { id: 'pedro', name: 'Pedro', role: 'Diretor', email: 'pedro@empresa.com', status: 'Ativo', regionIds: [], siteIds: [], active: true },
  { id: 'fernando', name: 'Fernando', role: 'Supervisor', email: 'fernando@empresa.com', status: 'Ativo', regionIds: [], siteIds: [], active: true },
  { id: 'geovana', name: 'Geovana', role: 'Admin', email: 'geovana@empresa.com', status: 'Ativo', regionIds: [], siteIds: [], active: true },
  { id: 'equipe-climatizacao', name: 'Equipe Climatização', role: 'Usuario', email: 'clima@empresa.com', status: 'Ativo', regionIds: [], siteIds: [], active: true },
  { id: 'eletrica-jose', name: 'Elétrica José', role: 'Usuario', email: 'contato@eletricajose.com.br', status: 'Inativo', regionIds: [], siteIds: [], active: true },
];

const DEFAULT_VENDORS = [
  { id: 'decor-interiores', name: 'Decor Interiores', email: '', active: true },
  { id: 'ambientes-cia', name: 'Ambientes & Cia', email: '', active: true },
  { id: 'reforma-facil', name: 'Reforma Fácil LTDA', email: '', active: true },
];

const DEFAULT_NOTIFICATIONS = [
  {
    id: 'bootstrap-infra',
    type: 'info',
    title: 'Infraestrutura inicializada',
    body: 'Seed inicial do Firebase executado.',
    read: false,
    action: { label: 'Abrir auditoria', view: 'audit-logs' },
  },
];

const DEFAULT_SETTINGS = {
  emailTemplates: {
    default: {
      fromName: 'OS Christus',
      signature: 'Sistema interno OS Christus',
      replyToMode: 'thread',
    },
  },
  dailyDigest: {
    default: {
      enabled: true,
      hour: '08:00',
      recipients: [],
    },
  },
  sla: {
    default: {
      urgentHours: 4,
      highHours: 8,
      normalHours: 24,
      lowHours: 72,
    },
  },
};

const ADMIN_EMAIL = process.env.OS_CHRISTUS_ADMIN_EMAIL?.trim().toLowerCase() || 'admin@os-christus.local';
const ADMIN_PASSWORD = process.env.OS_CHRISTUS_ADMIN_PASSWORD?.trim() || 'Admin@123456';
const ADMIN_NAME = process.env.OS_CHRISTUS_ADMIN_NAME?.trim() || 'Administrador OS Christus';
const DEFAULT_USER_PASSWORD = process.env.OS_CHRISTUS_DEFAULT_PASSWORD?.trim() || '12345678';

function initApp(serviceAccount, bucketName) {
  if (getApps().length > 0) return;
  initializeApp({
    credential: cert(serviceAccount),
    projectId: serviceAccount.project_id,
    storageBucket: bucketName,
  });
}

async function resolveBucketName(storage, projectId) {
  const candidates = [
    process.env.FIREBASE_STORAGE_BUCKET?.trim(),
    `${projectId}.firebasestorage.app`,
    `${projectId}.appspot.com`,
  ].filter(Boolean);

  for (const bucketName of candidates) {
    const [exists] = await storage.bucket(bucketName).exists();
    if (exists) return bucketName;
  }

  const [buckets] = await storage.getBuckets({ prefix: projectId });
  return buckets[0]?.name || null;
}

async function seedCatalog(db) {
  const batch = db.batch();
  const now = new Date();
  for (const region of DEFAULT_REGIONS) {
    batch.set(db.collection('regions').doc(region.id), { ...region, createdAt: now, updatedAt: now }, { merge: true });
  }
  for (const site of DEFAULT_SITES) {
    batch.set(db.collection('sites').doc(site.id), { ...site, createdAt: now, updatedAt: now }, { merge: true });
  }
  await batch.commit();
}

async function seedDirectory(db, adminUid, authUsersByEmail = {}) {
  const batch = db.batch();
  const now = new Date();

  for (const user of DEFAULT_USERS) {
    batch.set(
      db.collection('users').doc(user.id),
      {
        ...user,
        authUid: authUsersByEmail[user.email] || null,
        createdAt: now,
        updatedAt: now,
      },
      { merge: true }
    );
  }

  batch.set(
    db.collection('users').doc('admin-os-christus'),
    {
      id: 'admin-os-christus',
      name: ADMIN_NAME,
      role: 'Admin',
      email: ADMIN_EMAIL,
      status: 'Ativo',
      regionIds: [],
      siteIds: [],
      active: true,
      authUid: adminUid,
      createdAt: now,
      updatedAt: now,
    },
    { merge: true }
  );

  for (const team of DEFAULT_TEAMS) {
    batch.set(db.collection('teams').doc(team.id), { ...team, createdAt: now, updatedAt: now }, { merge: true });
  }

  for (const vendor of DEFAULT_VENDORS) {
    batch.set(db.collection('vendors').doc(vendor.id), { ...vendor, createdAt: now, updatedAt: now }, { merge: true });
  }

  await batch.commit();
}

async function seedNotifications(db) {
  const batch = db.batch();
  const now = new Date();
  for (let index = 0; index < DEFAULT_NOTIFICATIONS.length; index += 1) {
    const item = DEFAULT_NOTIFICATIONS[index];
    batch.set(
      db.collection('notifications').doc(item.id),
      { ...item, time: new Date(now.getTime() - index * 60000), createdAt: now, updatedAt: now },
      { merge: true }
    );
  }
  await batch.commit();
}

async function seedSettings(db) {
  const now = new Date();
  const entries = [
    ['emailTemplates', 'default', DEFAULT_SETTINGS.emailTemplates.default],
    ['dailyDigest', 'default', DEFAULT_SETTINGS.dailyDigest.default],
    ['sla', 'default', DEFAULT_SETTINGS.sla.default],
  ];

  const batch = db.batch();
  for (const [section, docId, data] of entries) {
    batch.set(
      db.collection('settings').doc(section).collection('items').doc(docId),
      { ...data, createdAt: now, updatedAt: now },
      { merge: true }
    );
  }
  await batch.commit();
}

async function seedConfig(db, projectId, bucketName) {
  const now = FieldValue.serverTimestamp();
  await Promise.all([
    db.collection('config').doc('system').set({ projectId, bucketName, workflowVersion: 'v1', updatedAt: now }, { merge: true }),
    db.collection('config').doc('gmailSync').set({ lastSyncAt: null, seenMessageIds: [], updatedAt: now }, { merge: true }),
  ]);
}

async function seedAudit(db, adminUid) {
  await db.collection('auditLogs').add({
    actor: ADMIN_EMAIL,
    action: 'system.bootstrap',
    entity: 'firebase',
    entityId: adminUid,
    before: null,
    after: { seeded: true, adminEmail: ADMIN_EMAIL },
    metadata: { runId: randomUUID() },
    createdAt: new Date(),
  });
}

async function ensureInboundLog(db) {
  await db.collection('ticketInbound').doc('_bootstrap').set(
    {
      id: '_bootstrap',
      type: 'system',
      message: 'Coleção preparada para inbound de e-mail.',
      createdAt: new Date(),
    },
    { merge: true }
  );
}

async function ensureStoragePlaceholders(storage, bucketName) {
  if (!bucketName) return;
  const bucket = storage.bucket(bucketName);
  const placeholders = [
    'attachments/tickets/images/.keep',
    'attachments/tickets/pdfs/.keep',
    'attachments/contracts/.keep',
    'attachments/quotes/.keep',
  ];

  for (const name of placeholders) {
    const file = bucket.file(name);
    const [exists] = await file.exists();
    if (!exists) {
      await file.save('', { resumable: false, contentType: 'text/plain' });
    }
  }
}

function mapRoleToClaim(role) {
  if (role === 'Admin') return 'admin';
  if (role === 'Diretor' || role === 'Supervisor') return 'gestor';
  return 'user';
}

async function upsertAuthUser({ email, name, role, status }, password) {
  const auth = getAuth();
  let record;
  try {
    record = await auth.getUserByEmail(email);
    await auth.updateUser(record.uid, {
      displayName: name,
      password,
      disabled: status !== 'Ativo',
    });
  } catch (error) {
    if (error?.code !== 'auth/user-not-found') throw error;
    record = await auth.createUser({
      email,
      password,
      displayName: name,
      disabled: status !== 'Ativo',
    });
  }

  await auth.setCustomUserClaims(record.uid, {
    role: mapRoleToClaim(role),
    appRole: role,
  });

  return record.uid;
}

async function ensureAdminAuth() {
  const uid = await upsertAuthUser(
    { email: ADMIN_EMAIL, name: ADMIN_NAME, role: 'Admin', status: 'Ativo' },
    ADMIN_PASSWORD
  );
  return { uid, enabled: true, error: null };
}

async function ensureDefaultUsersAuth() {
  const authUsersByEmail = {};
  for (const user of DEFAULT_USERS) {
    const uid = await upsertAuthUser(user, DEFAULT_USER_PASSWORD);
    authUsersByEmail[user.email] = uid;
  }
  return authUsersByEmail;
}

async function main() {
  const credentialsPath = resolveCredentialsPath();
  const serviceAccount = readServiceAccount(credentialsPath);
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim() || serviceAccount.project_id;
  const storage = createStorageClient(serviceAccount, projectId);
  const bucketName = await resolveBucketName(storage, projectId);

  initApp(serviceAccount, bucketName || undefined);

  let adminAuth = { uid: null, enabled: false, error: null };
  try {
    adminAuth = await ensureAdminAuth();
  } catch (error) {
    adminAuth = {
      uid: null,
      enabled: false,
      error: error.message || 'Falha ao provisionar Firebase Auth.',
    };
  }
  const db = getFirestore();
  let authUsersByEmail = {};
  if (adminAuth.enabled) {
    authUsersByEmail = await ensureDefaultUsersAuth();
  }

  await seedConfig(db, projectId, bucketName);
  await seedCatalog(db);
  await seedDirectory(db, adminAuth.uid, authUsersByEmail);
  await seedNotifications(db);
  await seedSettings(db);
  await ensureInboundLog(db);
  await ensureStoragePlaceholders(storage, bucketName);
  await seedAudit(db, adminAuth.uid || 'auth-pending');

  const collections = (await db.listCollections()).map(col => col.id).sort();
  console.log(
    JSON.stringify(
      {
        ok: true,
        projectId,
        bucketName,
        admin: {
          email: ADMIN_EMAIL,
          password: ADMIN_PASSWORD,
          uid: adminAuth.uid,
          authEnabled: adminAuth.enabled,
          authError: adminAuth.error,
        },
        collections,
      },
      null,
      2
    )
  );
}

main().catch(error => {
  console.error(JSON.stringify({ ok: false, error: error.message, stack: error.stack }, null, 2));
  process.exit(1);
});
