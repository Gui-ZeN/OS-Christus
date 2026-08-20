import net from 'node:net';
import { once } from 'node:events';
import { spawn } from 'node:child_process';

const ROOT = process.cwd();
const API_HOST = '127.0.0.1';
const API_PORT = 3001;
const env = {
  ...process.env,
  FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080',
  FIREBASE_AUTH_EMULATOR_HOST: process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099',
  GCLOUD_PROJECT: process.env.GCLOUD_PROJECT || 'os-christus',
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || 'os-christus',
  VITE_FIREBASE_API_KEY: process.env.VITE_FIREBASE_API_KEY || 'demo-os-christus',
  VITE_FIREBASE_AUTH_DOMAIN: process.env.VITE_FIREBASE_AUTH_DOMAIN || 'os-christus.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: process.env.VITE_FIREBASE_PROJECT_ID || 'os-christus',
  VITE_FIREBASE_STORAGE_BUCKET: process.env.VITE_FIREBASE_STORAGE_BUCKET || 'os-christus.appspot.com',
  VITE_FIREBASE_MESSAGING_SENDER_ID: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '000000000000',
  VITE_FIREBASE_APP_ID: process.env.VITE_FIREBASE_APP_ID || '1:000000000000:web:demo',
  VITE_USE_FIREBASE_EMULATOR: 'true',
  VITE_API_PROXY: process.env.VITE_API_PROXY || 'http://127.0.0.1:3001',
  E2E_LOGIN_EMAIL: process.env.E2E_LOGIN_EMAIL || 'admin@test.local',
  E2E_LOGIN_PASSWORD: process.env.E2E_LOGIN_PASSWORD || 'Test@123456',
  E2E_TERRITORY_USER_EMAIL: process.env.E2E_TERRITORY_USER_EMAIL || 'usuario.pe@test.local',
  E2E_TERRITORY_USER_PASSWORD: process.env.E2E_TERRITORY_USER_PASSWORD || 'Test@123456',
  E2E_DIRECTOR_EMAIL: process.env.E2E_DIRECTOR_EMAIL || 'diretor.e2e@test.local',
  E2E_MANAGER_EMAIL: process.env.E2E_MANAGER_EMAIL || 'gestor.e2e@test.local',
};

function run(command, args, label, { shell = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      env,
      stdio: 'inherit',
      shell,
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${label} falhou (código ${code ?? 'n/a'}, sinal ${signal || 'n/a'}).`));
    });
  });
}

function canConnect() {
  return new Promise(resolve => {
    const socket = net.createConnection({ host: API_HOST, port: API_PORT });
    const finish = result => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(500);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

async function waitForApi(child, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`O adaptador da API encerrou antes de ficar pronto (código ${child.exitCode}).`);
    }
    if (await canConnect()) return;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`O adaptador da API não respondeu em ${API_HOST}:${API_PORT}.`);
}

async function stopChild(child) {
  if (child.exitCode !== null) return;
  // Pede para encerrar antes de matar: sem saída limpa, o arquivo de cobertura do
  // adaptador não é gravado e as rotas ficam de fora da medição.
  if (child.connected) {
    try {
      child.send('encerrar');
      await Promise.race([once(child, 'exit'), new Promise(r => setTimeout(r, 5_000))]);
      if (child.exitCode !== null) return;
    } catch {
      /* segue para o kill */
    }
  }
  child.kill('SIGTERM');
  await Promise.race([
    once(child, 'exit'),
    new Promise(resolve => setTimeout(resolve, 5_000)),
  ]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

/**
 * ⚠️ PORTA OCUPADA É ERRO, NÃO "TUDO BEM".
 *
 * Se já houver um adaptador em `3001` — o que quem desenvolve deixa rodando o dia
 * inteiro —, o adaptador desta execução morre com EADDRINUSE e os testes batem no
 * OUTRO processo. A suíte passa, porque o servidor está lá; mas o que ela mediu não
 * é o que ela pensa que mediu.
 *
 * Descobri isso medindo cobertura: a primeira leitura deu 8% com `api/mail.js` em
 * zero, e as rotas tinham acabado de responder 200. Falha silenciosa que produz
 * VERDE é a pior categoria — a suíte confirmando algo sobre um processo que ela nem
 * lançou. Aqui ela para e diz o que fazer.
 */
if (await canConnect()) {
  throw new Error(
    `Já existe algo escutando em ${API_HOST}:${API_PORT}. ` +
      'Pare o `npm run dev:api` antes — senão os testes batem no processo errado e o resultado não vale.'
  );
}

const api = spawn(process.execPath, ['scripts/dev/api-adapter.mjs'], {
  cwd: ROOT,
  env,
  // O quarto descritor é o canal de IPC, usado só para pedir o encerramento limpo.
  stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
  shell: false,
});

try {
  await waitForApi(api);
  await run(process.execPath, ['scripts/dev/seed-emulator.mjs'], 'Seed dos emuladores');
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  // O Node moderno recusa spawnar .cmd/.bat sem shell (EINVAL), e no Windows `npm` é
  // npm.cmd. Sem isto a suíte só roda no Linux do CI — quem desenvolve aqui descobre
  // que quebrou depois de abrir o PR. Só o npm vai pelo shell; o resto continua direto.
  const npmOpts = { shell: process.platform === 'win32' };
  await run(npmCommand, ['run', 'test:integration'], 'Testes de integração', npmOpts);
  const runE2E = String(process.env.RUN_E2E || '').toLowerCase() === 'true';
  if (runE2E) {
    await run(npmCommand, ['run', 'test:e2e:ci'], 'Testes E2E', npmOpts);
  } else if (String(process.env.CI || '').toLowerCase() === 'true') {
    // No CI o E2E é obrigatório: se a env sumir (typo/refactor no workflow), o
    // pipeline ficaria VERDE sem ter rodado E2E — falso-verde silencioso, pior que
    // não ter teste. Falha alto em vez de pular calado.
    throw new Error('RUN_E2E não está "true" no CI — os testes E2E não rodariam. Verifique o workflow.');
  } else {
    console.log('[ci] E2E pulados (RUN_E2E != true) — execução local.');
  }
} finally {
  await stopChild(api);
}
