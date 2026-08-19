import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { metricasDeCobranca } from '../../api/_lib/metricasDeCobranca.js';

/**
 * TESTE DE CONTRATO — o banco atravessa a rota e chega inteiro em quem consome.
 *
 * Existe por causa de um defeito específico, e do jeito como ele passou: o painel
 * de cobrança mostrava "12 visitas, 0 cobranças" com o banco cheio de cobranças, e
 * os oito testes unitários do módulo passavam.
 *
 * A razão é que eles testavam a forma do SERVIDOR (`Date`), e o navegador recebe
 * outra: as cobranças moram DENTRO do compromisso, o serializador copia o campo
 * cru, e um `Timestamp` do Firestore atravessa o JSON como `{_seconds,
 * _nanoseconds}` — com sublinhado, porque o `toJSON()` da biblioteca usa o nome
 * privado. Nenhum teste da suíte atravessava essa fronteira, então nada podia
 * pegar.
 *
 * ⚠️ ESTE TESTE VAI DE PONTA A PONTA de propósito: grava `Timestamp` de verdade no
 * emulador, chama a rota HTTP autenticada, deixa o `fetch` fazer o `JSON.parse`, e
 * entrega o resultado ao MESMO módulo que a tela usa. Se alguém trocar o
 * serializador, o hidratador ou o parser de datas, ele quebra aqui — que é o único
 * lugar onde a quebra é barata.
 *
 * O que ele NÃO faz: afirmar regra de negócio. Isso é dos unitários. Aqui só se
 * verifica que o dado sobrevive à viagem.
 */

process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';

initializeApp({ projectId: 'os-christus' });
const db = getFirestore();
const API = 'http://127.0.0.1:3001';
const AUTH = 'http://127.0.0.1:9099';

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

const ID = 'contrato-compromisso-teste';
const horas = h => new Date(Date.now() - h * 60 * 60 * 1000);

async function semear() {
  await db.collection('commitments').doc(ID).delete().catch(() => {});
  await db
    .collection('commitments')
    .doc(ID)
    .set({
      kind: 'visita-fornecedor',
      ticketIds: ['OS-0001'],
      sede: 'DL',
      vendorName: 'Contrato Teste',
      // `Timestamp` de verdade, e não `Date`: é a diferença que o defeito explorou.
      startAt: Timestamp.fromDate(horas(30)),
      endAt: null,
      state: 'faltou',
      confirmedAt: Timestamp.fromDate(horas(28)),
      createdAt: Timestamp.fromDate(horas(50)),
      updatedAt: Timestamp.fromDate(horas(28)),
      // ⚠️ O CAMPO ANINHADO. É por aqui que o dado se perdia: o serializador
      // normaliza cinco datas de primeiro nível e espalha o resto cru.
      cobrancas: [
        {
          em: Timestamp.fromDate(horas(27)),
          por: 'admin@test.local',
          canal: 'whatsapp',
          evento: 'whatsappAberto',
          desfecho: 'nao-respondeu',
          desfechoEm: Timestamp.fromDate(horas(25)),
          desfechoPor: 'admin@test.local',
        },
      ],
    });
}

async function main() {
  await semear();
  const token = await signIn('admin@test.local');

  const res = await fetch(`${API}/api/tickets?route=commitments`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const json = await res.json().catch(() => ({}));
  check('a rota de compromissos responde 200', res.status === 200, `HTTP ${res.status}`);

  const lista = Array.isArray(json.commitments) ? json.commitments : [];
  const alvo = lista.find(item => item.id === ID);
  check('o compromisso semeado volta na resposta', Boolean(alvo), `${lista.length} na lista`);
  if (!alvo) {
    console.log('\n=== abortado: sem o compromisso não há contrato a verificar ===');
    return 1;
  }

  // ── O FORMATO, campo a campo. O que está escrito aqui É o contrato.
  check(
    'startAt chega como string ISO (o serializador normaliza o primeiro nível)',
    typeof alvo.startAt === 'string' && !Number.isNaN(Date.parse(alvo.startAt)),
    JSON.stringify(alvo.startAt)
  );
  check(
    'effectiveState vem resolvido pelo servidor',
    typeof alvo.effectiveState === 'string' && alvo.effectiveState.length > 0,
    String(alvo.effectiveState)
  );

  const cobranca = Array.isArray(alvo.cobrancas) ? alvo.cobrancas[0] : null;
  check('a cobrança aninhada sobrevive à viagem', Boolean(cobranca), JSON.stringify(alvo.cobrancas));

  /**
   * Aqui o teste DOCUMENTA a assimetria em vez de fingir que ela não existe: a data
   * de primeiro nível vira ISO, a aninhada não. Enquanto o serializador espalhar o
   * documento cru, é isto que o cliente recebe — e é isto que ele precisa entender.
   *
   * Se um dia o serializador passar a normalizar tudo, esta linha falha e alguém
   * lê o comentário antes de "consertar" o parser do cliente.
   */
  const dataAninhada = cobranca?.em;
  const ehTimestampCru =
    dataAninhada && typeof dataAninhada === 'object' &&
    (typeof dataAninhada._seconds === 'number' || typeof dataAninhada.seconds === 'number');
  const ehIso = typeof dataAninhada === 'string' && !Number.isNaN(Date.parse(dataAninhada));
  check(
    'a data DENTRO da cobrança chega como Timestamp cru ou ISO — e o parser aceita as duas',
    Boolean(ehTimestampCru || ehIso),
    JSON.stringify(dataAninhada)
  );

  // ── O QUE IMPORTA: o consumidor real conta a cobrança que existe no banco.
  const m = metricasDeCobranca({
    commitments: lista,
    de: horas(72),
    ate: new Date(),
  });
  check(
    'metricasDeCobranca ENXERGA a visita que está no banco',
    m.visitas >= 1,
    `visitas=${m.visitas}`
  );
  check(
    'metricasDeCobranca ENXERGA a cobrança aninhada — o defeito original',
    m.acionamentos >= 1 && m.classificados >= 1,
    `acionamentos=${m.acionamentos} classificados=${m.classificados}`
  );
  /**
   * A ASSERÇÃO QUE REALMENTE GUARDA O DEFEITO — e ela é EXATA, não "não nulo".
   *
   * A semente marca o acionamento 27h atrás e o desfecho 25h atrás: dois pontos
   * conhecidos, exatamente 120 minutos entre eles. Só chega a 120 quem leu os dois
   * `Timestamp` aninhados e converteu certo, inclusive os nanossegundos.
   *
   * "Não nulo" não bastaria: uma leitura errada que devolvesse qualquer instante
   * passaria. Verificado reintroduzindo o defeito de propósito — o parser sem
   * `_seconds` derruba esta linha, e só ela.
   */
  check(
    'a data aninhada vira o INSTANTE certo (27h → 25h = 120 min)',
    m.medianaSobre === 1 && m.medianaAteODesfechoEmMinutos === 120,
    `sobre=${m.medianaSobre} mediana=${m.medianaAteODesfechoEmMinutos}`
  );

  // ── A COBERTURA. O teto de 500 era silencioso: a tela não tinha como saber que
  // faltava visita. Se o campo sumir, ele volta a ser silencioso.
  check(
    'a resposta declara até onde alcança',
    Boolean(json.cobertura) &&
      typeof json.cobertura.de === 'string' &&
      typeof json.cobertura.ate === 'string' &&
      typeof json.cobertura.truncado === 'boolean',
    JSON.stringify(json.cobertura)
  );

  await db.collection('commitments').doc(ID).delete().catch(() => {});

  const falhas = results.filter(item => !item.pass).length;
  console.log(`\n=== ${results.length - falhas}/${results.length} OK ===`);
  return falhas > 0 ? 1 : 0;
}

/**
 * db.terminate() ANTES de sair, e `exitCode` em vez de `process.exit()`.
 *
 * Sair com o cliente do Firestore ainda aberto derrubava o Node no encerramento
 * (UV_HANDLE_CLOSING no libuv): o script imprimia "10/10 OK" e saía 127. No CI
 * isso e o pior tipo de falha — vermelho sem defeito, que ensina todo mundo a
 * reexecutar sem ler.
 */
main()
  .then(async codigo => {
    await db.terminate().catch(() => {});
    process.exitCode = codigo;
  })
  .catch(async error => {
    console.error('FALHOU  erro inesperado —', error);
    await db.terminate().catch(() => {});
    process.exitCode = 1;
  });
