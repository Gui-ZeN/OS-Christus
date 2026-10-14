/**
 * SEGREDO NA URL: SÓ NO PUSH DO GMAIL, E SÓ O DO PUSH.
 *
 * Auditoria de segurança de 14/10/2026: `?secret=` era aceito em todas as rotas de
 * automação do Gmail e para os três segredos — inclusive o `CRON_SECRET`. URL vai
 * parar no log da Vercel. O push é a exceção porque o Pub/Sub só manda o segredo na
 * URL; lá vale o `GMAIL_PUSH_SECRET` e mais nenhum.
 *
 * Pré-requisitos: emulador (auth 9099 + firestore 8080) e `npm run dev:seed`.
 */
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
process.env.FIREBASE_PROJECT_ID ||= 'os-christus';
process.env.GMAIL_CLIENT_ID = 'dummy-id';
process.env.GMAIL_CLIENT_SECRET = 'dummy-secret';
process.env.GMAIL_REFRESH_TOKEN = 'dummy-refresh';
process.env.GMAIL_FROM_EMAIL = 'os@christus.com.br';
process.env.GMAIL_SYNC_SECRET = 'segredo-do-sync';
process.env.GMAIL_PUSH_SECRET = 'segredo-do-push';
process.env.CRON_SECRET = 'segredo-do-cron';

import { google } from 'googleapis';
import { initializeApp } from 'firebase-admin/app';

const results = [];
function check(name, pass, detail = '') {
  results.push({ pass });
  console.log(`${pass ? 'PASS' : 'FALHOU'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

google.gmail = () => ({
  users: {
    getProfile: async () => ({ data: { emailAddress: 'os@christus.com.br' } }),
    messages: {
      list: async () => ({ data: { messages: [] } }),
      get: async () => { throw new Error('caixa vazia'); },
    },
  },
});

initializeApp({ projectId: 'os-christus' });
const { default: handler } = await import('../../api/mail.js');

function chamar(route, { query = {}, headers = {} } = {}) {
  const req = { method: 'POST', query: { route, ...query }, headers: { 'user-agent': 'teste', ...headers }, body: {} };
  return new Promise(resolve => {
    const res = {
      statusCode: 200,
      setHeader() {},
      end(payload) {
        let json = payload;
        try { json = JSON.parse(payload); } catch { /* texto */ }
        resolve({ status: res.statusCode, json });
      },
    };
    handler(req, res).catch(error => resolve({ status: 'throw', json: { error: error.message } }));
  });
}

const okDe = r => r.status === 200 && r.json?.ok !== false;

const syncNaUrl = await chamar('gmail-sync', { query: { secret: 'segredo-do-sync' } });
check('gmail-sync com o segredo na URL é recusado', !okDe(syncNaUrl), `status ${syncNaUrl.status}`);

const cronNaUrl = await chamar('gmail-sync', { query: { secret: 'segredo-do-cron' } });
check('o CRON_SECRET na URL é recusado', !okDe(cronNaUrl), `status ${cronNaUrl.status}`);

const syncNoCabecalho = await chamar('gmail-sync', { headers: { authorization: 'Bearer segredo-do-sync' } });
check('gmail-sync com o segredo no cabeçalho passa', okDe(syncNoCabecalho), JSON.stringify(syncNoCabecalho.json).slice(0, 160));

const pushNaUrl = await chamar('gmail-push', { query: { secret: 'segredo-do-push' } });
check('o push com o GMAIL_PUSH_SECRET na URL passa (o Pub/Sub não manda cabeçalho)', okDe(pushNaUrl), JSON.stringify(pushNaUrl.json).slice(0, 160));

const pushComCron = await chamar('gmail-push', { query: { secret: 'segredo-do-cron' } });
check('o push NÃO aceita o CRON_SECRET na URL', !okDe(pushComCron), `status ${pushComCron.status}`);

const pushComSync = await chamar('gmail-push', { query: { secret: 'segredo-do-sync' } });
check('nem o GMAIL_SYNC_SECRET na URL', !okDe(pushComSync), `status ${pushComSync.status}`);

// Revisão de segurança: o segredo do push fica gravado no log (vai na URL), então ele
// não pode abrir outra rota nem pelo cabeçalho — o gmail-watch reescreve o ponteiro
// da caixa.
const pushNoSync = await chamar('gmail-sync', { headers: { 'x-gmail-push-secret': 'segredo-do-push' } });
check('o segredo do push no cabeçalho NÃO abre o gmail-sync', !okDe(pushNoSync), `status ${pushNoSync.status}`);
const pushNoWatch = await chamar('gmail-watch', { headers: { authorization: 'Bearer segredo-do-push' } });
check('nem o gmail-watch', !okDe(pushNoWatch), `status ${pushNoWatch.status}`);

const falhas = results.filter(r => !r.pass).length;
console.log(`\n${results.length - falhas}/${results.length} verificações passaram`);
process.exit(falhas > 0 ? 1 : 0);
