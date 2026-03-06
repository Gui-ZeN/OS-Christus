import { getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import { requireAdminUser } from './_lib/authz.js';
import { getAdminDb } from './_lib/firebaseAdmin.js';
import { gmailGetProfile } from './_lib/gmail.js';
import { sendJson } from './_lib/http.js';

function isConfigured(name) {
  return Boolean(process.env[name]);
}

function detectEmailProvider() {
  if (process.env.EMAIL_PROVIDER) {
    return String(process.env.EMAIL_PROVIDER).toLowerCase();
  }
  if (process.env.GMAIL_CLIENT_ID || process.env.GMAIL_REFRESH_TOKEN) {
    return 'gmail';
  }
  if (process.env.SENDGRID_API_KEY) {
    return 'sendgrid';
  }
  return 'none';
}

async function checkFirebaseAdmin() {
  try {
    const db = getAdminDb();
    await db.collection('config').limit(1).get();
    const app = getApps()[0];

    return {
      ok: true,
      label: 'Firebase Admin',
      detail: 'Credencial administrativa carregada e Firestore acessível.',
      meta: {
        projectId: app?.options?.projectId || process.env.FIREBASE_PROJECT_ID || null,
      },
    };
  } catch (error) {
    return {
      ok: false,
      label: 'Firebase Admin',
      detail: error.message || 'Falha ao inicializar Firebase Admin.',
      meta: {
        env: {
          hasProjectId: isConfigured('FIREBASE_PROJECT_ID'),
          hasServiceAccountJson: isConfigured('FIREBASE_SERVICE_ACCOUNT_JSON'),
          hasServiceAccountB64: isConfigured('FIREBASE_SERVICE_ACCOUNT_B64'),
        },
      },
    };
  }
}

async function checkAuth() {
  try {
    const db = getAdminDb();
    void db;
    const app = getApps()[0];
    const auth = getAuth(app);
    const page = await auth.listUsers(1);

    return {
      ok: true,
      label: 'Firebase Auth',
      detail: 'Firebase Auth acessível pelo backend.',
      meta: {
        sampledUsers: page.users.length,
      },
    };
  } catch (error) {
    return {
      ok: false,
      label: 'Firebase Auth',
      detail: error.message || 'Falha ao acessar Firebase Auth.',
      meta: null,
    };
  }
}

async function checkStorage() {
  try {
    const db = getAdminDb();
    void db;
    const app = getApps()[0];
    const bucketName = app?.options?.storageBucket || process.env.FIREBASE_STORAGE_BUCKET || null;
    if (!bucketName) {
      return {
        ok: false,
        label: 'Firebase Storage',
        detail: 'Bucket não configurado no ambiente.',
        meta: {
          hasStorageBucket: false,
        },
      };
    }

    const bucket = getStorage(app).bucket(bucketName);
    const [exists] = await bucket.exists();

    return {
      ok: exists,
      label: 'Firebase Storage',
      detail: exists ? 'Bucket acessível pelo backend.' : 'Bucket configurado, mas não encontrado.',
      meta: {
        bucket: bucketName,
      },
    };
  } catch (error) {
    return {
      ok: false,
      label: 'Firebase Storage',
      detail: error.message || 'Falha ao validar Storage.',
      meta: {
        hasStorageBucket: isConfigured('FIREBASE_STORAGE_BUCKET'),
      },
    };
  }
}

async function checkEmail() {
  const provider = detectEmailProvider();

  if (provider === 'gmail') {
    try {
      const profile = await gmailGetProfile();
      return {
        ok: true,
        label: 'E-mail',
        detail: 'Gmail API autenticada e pronta para envio/sincronização.',
        meta: {
          provider,
          emailAddress: profile.emailAddress,
        },
      };
    } catch (error) {
      return {
        ok: false,
        label: 'E-mail',
        detail: error.message || 'Falha ao autenticar Gmail API.',
        meta: {
          provider,
          env: {
            hasClientId: isConfigured('GMAIL_CLIENT_ID'),
            hasClientSecret: isConfigured('GMAIL_CLIENT_SECRET'),
            hasRefreshToken: isConfigured('GMAIL_REFRESH_TOKEN'),
            hasFromEmail: isConfigured('GMAIL_FROM_EMAIL'),
            hasSyncSecret: isConfigured('GMAIL_SYNC_SECRET'),
          },
        },
      };
    }
  }

  if (provider === 'sendgrid') {
    const configured = isConfigured('SENDGRID_API_KEY') && isConfigured('SENDGRID_FROM_EMAIL');
    return {
      ok: configured,
      label: 'E-mail',
      detail: configured ? 'SendGrid configurado no ambiente.' : 'Variáveis do SendGrid ausentes.',
      meta: {
        provider,
        env: {
          hasApiKey: isConfigured('SENDGRID_API_KEY'),
          hasFromEmail: isConfigured('SENDGRID_FROM_EMAIL'),
          hasReplyTo: isConfigured('SENDGRID_REPLY_TO_EMAIL'),
        },
      },
    };
  }

  return {
    ok: false,
    label: 'E-mail',
    detail: 'Nenhum provedor de e-mail configurado.',
    meta: {
      provider,
    },
  };
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return sendJson(res, 405, { ok: false, error: 'Método não permitido.' });
    }

    await requireAdminUser(req);
    const [firebaseAdmin, auth, storage, email] = await Promise.all([
      checkFirebaseAdmin(),
      checkAuth(),
      checkStorage(),
      checkEmail(),
    ]);

    return sendJson(res, 200, {
      ok: true,
      checks: {
        firebaseAdmin,
        auth,
        storage,
        email,
      },
    });
  } catch (error) {
    return sendJson(res, 400, { ok: false, error: error.message || 'Falha ao validar integrações.' });
  }
}
