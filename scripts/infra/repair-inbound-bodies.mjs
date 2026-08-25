import process from 'node:process';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import {
  extractInboundMessageBody,
  displayNameFromEmail,
  stripQuotedReply,
  stripSignature,
  isForwardHeaderLine,
  tidyInboundText,
  sanitizeInboundLines,
} from '../../api/_lib/inboundBody.js';
import { buildInboundHistoryId } from '../../api/_lib/emailThreading.js';
import { TICKET_HISTORY_SUBCOLLECTION, ticketHistoryEntryDocumentId } from '../../api/_lib/tickets.js';
import { readServiceAccount, resolveCredentialsPath } from './shared-auth.mjs';

/**
 * REPARO do corpo de entradas de histórico que nasceram truncadas — o caso do
 * "Forwarded Conversation" (medido por `infra:inbound:measure`).
 *
 * Por que reescrever histórico, se a regra do sistema é que histórico NÃO se
 * reescreve: o texto gravado ali é ARTEFATO DE PARSING, não o que a pessoa
 * escreveu. O original está intacto em `ticketInbound` — este script só refaz a
 * leitura dele com o parser corrigido.
 *
 * TRAVA DE CONTINÊNCIA: só reescreve quando o texto atual está CONTIDO no novo.
 * Assim a operação é comprovadamente aditiva — nenhuma palavra existente some.
 * O que não passa na trava é listado para decisão humana e não é tocado.
 *
 * Cada entrada reparada leva `repairedAt` + `repairedBy` + `repairedFromLength`,
 * então dá para auditar depois o que foi mexido e desfazer caso a caso.
 *
 * Uso:
 *   npm run infra:inbound:repair                 (DRY-RUN — não escreve nada)
 *   npm run infra:inbound:repair -- --apply      (escreve)
 *   npm run infra:inbound:repair -- --os=OS-0289 (limita a uma OS)
 *   npm run infra:inbound:repair -- --encolher   (tira a citação que vazou para o corpo)
 */

const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT_ID = process.env.GCLOUD_PROJECT || 'os-christus';
const PAGE_SIZE = 200;

const APPLY = process.argv.includes('--apply');
const ONLY_OS = (process.argv.find(arg => arg.startsWith('--os=')) || '').split('=')[1]?.toUpperCase() || null;
/**
 * MODO ENCOLHER. O reparo nasceu para o caso em que o parser passou a EXTRAIR
 * mais texto — daí a trava de tamanho, que só deixa passar reparo que cresce.
 *
 * O caso oposto apareceu em 25/08/2026: 204 das 824 mensagens recebidas tinham a
 * corrente citada COLADA no corpo, porque o `text/plain` quebra em ~72 colunas e
 * partia o cabeçalho da citação — nenhum marcador casava e o corte não acontecia.
 * `unwrapQuoteHeaders` consertou a entrada, mas o que já estava gravado seguiu
 * inchado: ao ler a OS-0344, a mesma frase aparecia duas vezes.
 *
 * Aqui o texto novo é MENOR, e a trava vira o seu espelho: em vez de exigir que o
 * núcleo velho sobreviva no novo, exige que o núcleo NOVO caiba no velho. Assim a
 * operação é comprovadamente subtrativa — nenhuma palavra nova aparece, e o que
 * some é o que `nucleo()` já classifica como não-conteúdo (citação, despedida,
 * endereço). O original segue intacto em `ticketInbound`.
 */
const ENCOLHER = process.argv.includes('--encolher');

function connect() {
  if (getApps().length > 0) return getFirestore();
  if (EMULATOR) {
    initializeApp({ projectId: PROJECT_ID });
  } else {
    const serviceAccount = readServiceAccount(resolveCredentialsPath());
    initializeApp({
      credential: cert(serviceAccount),
      projectId: serviceAccount.project_id || PROJECT_ID,
    });
  }
  return getFirestore();
}

/**
 * Comparação tolerante a espaço: o parser novo remonta quebras de linha, então
 * exigir igualdade literal reprovaria reparos legítimos. O que importa é que
 * nenhuma PALAVRA existente desapareça.
 */
function normalizeForContainment(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * A trava compara o NÚCLEO do texto atual, não ele inteiro. O texto velho carrega
 * justamente o lixo que o parser corrigido passou a remover — despedida e cabeçalho
 * de citação ("Atenciosamente,", "Em seg... escreveu:"). Exigir que esse lixo
 * sobrevivesse reprovaria todo reparo legítimo, inclusive o caso que originou tudo.
 *
 * O que a trava garante continua valendo: nenhuma palavra de CONTEÚDO desaparece.
 * Só se tolera perder o que a própria limpeza remove.
 */
const MARCADOR_ENCAMINHAMENTO =
  /^\s*(?:-+\s*)?(?:forwarded (?:message|conversation)|mensagem encaminhada|conversa encaminhada)(?:\s*-+)?\s*$/i;

/**
 * Núcleo = só o que é CONTEÚDO. Fora: cabeçalho de encaminhamento, cabeçalho de
 * citação, separador tracejado, despedida e linha de contato.
 *
 * Aplicado aos DOIS lados da comparação. Sem isso a trava reprovava todo reparo
 * legítimo, porque o texto velho guarda exatamente o ruído que o parser corrigido
 * passou a remover — há OS cujo corpo inteiro hoje é a linha "Forwarded
 * Conversation / Subject: ...", sem uma palavra do chamado.
 */
function nucleo(value) {
  // `tidyInboundText` nos DOIS lados: o texto velho guarda `[image: ...]` e o
  // asterisco do negrito, que o acabamento novo remove. Sem normalizar igual, a
  // trava reprova reparo legítimo por diferença de formatação, não de conteúdo.
  const semRuido = tidyInboundText(stripSignature(stripQuotedReply(String(value || ''))))
    .split('\n')
    .map(line => line.replace(/^\s*(?:>\s?)+/, ''))
    .filter(line => {
      const t = line.trim();
      if (!t) return false;
      if (MARCADOR_ENCAMINHAMENTO.test(t)) return false;
      if (/^-{3,}$/.test(t)) return false;
      if (isForwardHeaderLine(t)) return false;
      if (/^(on|em)\s.+(wrote|escreveu):?$/i.test(t)) return false;
      // Sobra do cabeçalho quebrado: a linha era "…@px.com.br> escreveu:" e, sem
      // o endereço, resta só o verbo. Não é conteúdo em nenhum dos dois lados.
      if (/^[>\s]*(escreveu|wrote):?$/i.test(t)) return false;
      return true;
    })
    .join(' ')
    // Endereço não conta como conteúdo em nenhum dos lados. Sem isto a trava
    // acabava PROTEGENDO endereço vazado: há OS cujo texto atual começa com um
    // pedaço da lista de destinatários, e o reparo (que o remove) era reprovado
    // como se estivesse destruindo informação.
    .replace(/<[^>\n]*>/g, ' ')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, ' ')
    // O `<`/`>` que sobra do endereço removido também não é conteúdo — e era ele
    // que reprovava a comparação depois de tudo o mais já bater.
    .replace(/[<>]/g, ' ');
  return normalizeForContainment(semRuido);
}

/** Linha de atribuição de citação, com ou sem o "escreveu:" no fim. */
const LINHA_DE_CITACAO =
  /^\s*(?:Em|On)\s+(?:[^\s,]+,\s*)?\d{1,2}\s+de\s+[^\s,]+\.?\s+de\s+\d{4},?\s+(?:às\s+|as\s+)?\d{1,2}:\d{2}/m;

/**
 * Só a sequência de palavras, sem acento e sem pontuação. É o denominador comum
 * entre dois textos que passaram por acabamentos diferentes do parser.
 */
function palavras(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Toda palavra de `novo` aparece em `atual`, na mesma ordem?
 *
 * Prefixo seria mais simples, mas recusa reparo legítimo: o parser de hoje não só
 * corta o rabo da citação — ele também redige endereço no MEIO do texto. Uma
 * entrada como "E-mail do SERV3 em cópia / @fulano@x.com <fulano@x.com> em cópia
 * / Em qui., 14 de mai…" vira "E-mail do SERV3 em cópia / cópia", que não é
 * prefixo de nada, embora só tenha removido.
 *
 * Subsequência prova o mesmo que interessa — nenhuma palavra nova aparece — sem
 * exigir que as remoções sejam todas no fim.
 */
function ehSubsequencia(novo, atual) {
  const alvo = novo.split(' ').filter(Boolean);
  if (alvo.length === 0) return false;
  let i = 0;
  for (const palavra of atual.split(' ')) {
    if (palavra === alvo[i]) i += 1;
    if (i === alvo.length) return true;
  }
  return false;
}

function isContained(atual, novo) {
  const alvo = nucleo(atual);
  if (!alvo) return true;
  return nucleo(novo).includes(alvo);
}

async function main() {
  const db = connect();
  const alvo = EMULATOR ? `emulador ${EMULATOR}` : `PRODUÇÃO (${PROJECT_ID})`;
  const modo = APPLY ? '*** APLICANDO (escreve no banco) ***' : 'DRY-RUN (não escreve nada)';
  const direcao = ENCOLHER
    ? 'ENCOLHER (tira a citação que vazou para o corpo)'
    : 'crescer (recupera texto que o parser antigo perdeu)';
  console.log(`\nReparo de corpo de e-mail encaminhado — ${alvo}`);
  console.log(`${modo} · ${direcao}${ONLY_OS ? ` · só ${ONLY_OS}` : ''}\n`);

  const stats = { inbounds: 0, candidatos: 0, reparados: 0, semEntrada: 0, bloqueados: 0, jaOk: 0 };
  const bloqueados = [];
  const porOs = new Map();

  // Primeira passada: qual inbound ABRIU cada OS. Sem isto, uma resposta cujo
  // `mail-<messageId>` não existe cai no `-c1` — que é a mensagem de ABERTURA,
  // outra mensagem — e o script tentaria escrever o texto de uma por cima da
  // outra. A trava de continência rejeitava (nada foi corrompido), mas o
  // diagnóstico saía errado: 96 "bloqueados" que eram só par errado.
  const inboundDeAbertura = new Map();
  {
    let c = null;
    while (true) {
      let q = db.collection('ticketInbound').orderBy('__name__').limit(PAGE_SIZE);
      if (c) q = q.startAfter(c);
      const s = await q.get();
      if (s.empty) break;
      for (const d of s.docs) {
        const i = d.data() || {};
        const tid = String(i.ticketId || '').trim().toUpperCase();
        if (!tid) continue;
        const quando = i.createdAt?.toMillis?.() ?? 0;
        const atual = inboundDeAbertura.get(tid);
        if (!atual || quando < atual.quando) inboundDeAbertura.set(tid, { id: d.id, quando });
      }
      c = s.docs[s.docs.length - 1];
      if (s.size < PAGE_SIZE) break;
    }
  }

  let cursor = null;
  while (true) {
    let query = db.collection('ticketInbound').orderBy('__name__').limit(PAGE_SIZE);
    if (cursor) query = query.startAfter(cursor);
    const snap = await query.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      const inbound = doc.data() || {};
      stats.inbounds += 1;

      const ticketId = String(inbound.ticketId || '').trim().toUpperCase();
      if (!ticketId) continue;
      if (ONLY_OS && ticketId !== ONLY_OS) continue;

      const novoTexto = extractInboundMessageBody(inbound.text || '', inbound.html || '');
      if (!novoTexto) continue;

      const sender = displayNameFromEmail(inbound.from || inbound.fromEmail || '') || 'Solicitante';
      const ticketRef = db.collection('tickets').doc(ticketId);

      // Duas convenções de id, e a segunda foi a que originou o caso:
      //  · resposta numa OS existente → `mail-<messageId>`;
      //  · e-mail que CRIOU a OS      → `<ticketId>-c1` (api/mail.js), com o corpo
      //    virando a primeira mensagem. Procurar só por `mail-` deixava de fora
      //    justamente a abertura do chamado — o texto que mais importa.
      const abriuAOs = inboundDeAbertura.get(ticketId)?.id === doc.id;
      const idsPossiveis = [buildInboundHistoryId(inbound.messageId || doc.id, sender)];
      if (abriuAOs) idsPossiveis.push(`${ticketId}-c1`);

      let entryId = null;
      let entryRef = null;
      let entrySnap = null;
      for (const candidato of idsPossiveis) {
        const ref = ticketRef
          .collection(TICKET_HISTORY_SUBCOLLECTION)
          .doc(ticketHistoryEntryDocumentId(ticketId, candidato));
        const snapCandidato = await ref.get();
        if (snapCandidato.exists) {
          entryId = candidato;
          entryRef = ref;
          entrySnap = snapCandidato;
          break;
        }
      }
      if (!entryId) {
        entryId = idsPossiveis[0];
        entryRef = ticketRef
          .collection(TICKET_HISTORY_SUBCOLLECTION)
          .doc(ticketHistoryEntryDocumentId(ticketId, entryId));
        entrySnap = { exists: false, data: () => null };
      }

      // A entrada pode estar SÓ no array embutido do doc da OS: tickets que ainda
      // não migraram para a subcoleção não têm doc em `historyEntries`. Procurar
      // apenas na subcoleção deixaria justamente as OS mais antigas sem reparo.
      const ticketSnapPrevio = entrySnap.exists ? null : await ticketRef.get();
      const embeddedPrevio = Array.isArray(ticketSnapPrevio?.data()?.history)
        ? ticketSnapPrevio.data().history
        : [];
      let embeddedEntry = null;
      if (!entrySnap.exists) {
        for (const candidato of idsPossiveis) {
          const achado = embeddedPrevio.find(item => item?.id === candidato);
          if (achado) {
            embeddedEntry = achado;
            entryId = candidato;
            break;
          }
        }
      }

      if (!entrySnap.exists && !embeddedEntry) {
        stats.semEntrada += 1;
        continue;
      }

      const soEmbutido = !entrySnap.exists;
      const dadosEntrada = entrySnap.exists ? entrySnap.data() : embeddedEntry;
      const atual = String(dadosEntrada?.text || '');
      // Entrada que ESTE script já reparou pode precisar de reparo de novo quando o
      // parser melhora — e aí o texto novo costuma ser MENOR (foi o caso da redação
      // de endereço). Sem esta exceção, a trava de tamanho travaria a correção.
      const jaReparada = dadosEntrada?.repairedBy === 'infra:inbound:repair';

      if (normalizeForContainment(atual) === normalizeForContainment(novoTexto)) {
        stats.jaOk += 1;
        continue;
      }
      const encolhendo = novoTexto.length < atual.length;
      // No modo encolher só interessa o que diminui; fora dele, só o que cresce.
      // Sem esta separação o modo encolher também mexia em reparo de crescimento,
      // e o relatório misturava as duas coisas.
      if (ENCOLHER && !encolhendo) {
        stats.jaOk += 1;
        continue;
      }
      if (!ENCOLHER && !jaReparada && novoTexto.length <= atual.length) {
        stats.jaOk += 1;
        continue;
      }

      stats.candidatos += 1;

      // A trava protege texto HUMANO. Se a entrada já é saída deste script, o que
      // está lá é máquina, não pessoa — e o original segue intacto em
      // `ticketInbound`. Comparar contra a própria saída anterior só impediria de
      // corrigir o que ela mesma errou (foi o caso do endereço vazado no prefácio).
      if (ENCOLHER) {
        // Trava do encolher: o texto novo tem que ser o COMEÇO do atual. Isso prova
        // que a operação só cortou o rabo — a citação — sem trocar nem inventar
        // palavra no meio.
        //
        // A comparação ignora acento e pontuação de propósito: os dois textos
        // passaram por acabamentos diferentes ("- *Subsolo;*" contra "- Subsolo;")
        // e exigir igualdade literal reprovaria todo reparo legítimo. O que
        // importa é a SEQUÊNCIA DE PALAVRAS.
        const novoP = palavras(novoTexto);
        const atualP = palavras(atual);
        // Texto de duas palavras casa como subsequência em quase qualquer lugar
        // por acaso ("ok", "ciente"). Abaixo de três, exige o começo mesmo.
        const provado = novoP.split(' ').filter(Boolean).length >= 3
          ? ehSubsequencia(novoP, atualP)
          : atualP.startsWith(novoP);
        if (!novoP || !provado) {
          stats.bloqueados += 1;
          bloqueados.push({
          ticketId,
          entryId,
          atual: atual.length,
          novo: novoTexto.length,
          // Quem revisa precisa saber se valeria a pena forçar: se o texto novo
          // AINDA traz citação, reescrever não conserta nada — o que falta é o
          // parser aprender aquele formato, não afrouxar a trava.
          aindaCitado: LINHA_DE_CITACAO.test(novoTexto),
        });
          continue;
        }
      } else if (!jaReparada && !isContained(atual, novoTexto)) {
        stats.bloqueados += 1;
        bloqueados.push({
          ticketId,
          entryId,
          atual: atual.length,
          novo: novoTexto.length,
          // Quem revisa precisa saber se valeria a pena forçar: se o texto novo
          // AINDA traz citação, reescrever não conserta nada — o que falta é o
          // parser aprender aquele formato, não afrouxar a trava.
          aindaCitado: LINHA_DE_CITACAO.test(novoTexto),
        });
        continue;
      }

      const registro = porOs.get(ticketId) || { entradas: 0, ganho: 0 };
      registro.entradas += 1;
      registro.ganho += novoTexto.length - atual.length;
      porOs.set(ticketId, registro);

      if (!APPLY) continue;

      // Reescreve na subcoleção (fonte da verdade) e, se a entrada estiver na
      // janela embutida do doc da OS, também lá — senão a tela continuaria
      // mostrando o texto velho até a janela rolar.
      await db.runTransaction(async tx => {
        const ticketSnap = await tx.get(ticketRef);
        if (!ticketSnap.exists) return;

        if (!soEmbutido) {
          tx.set(
            entryRef,
            {
              text: novoTexto,
              repairedAt: new Date(),
              repairedBy: 'infra:inbound:repair',
              repairedFromLength: atual.length,
            },
            { merge: true }
          );
        }

        const embedded = Array.isArray(ticketSnap.data()?.history) ? ticketSnap.data().history : [];
        const index = embedded.findIndex(item => item?.id === entryId);
        if (index >= 0) {
          const proximo = embedded.slice();
          proximo[index] = {
            ...proximo[index],
            text: novoTexto,
            repairedAt: new Date(),
            repairedBy: 'infra:inbound:repair',
          };
          tx.set(ticketRef, { history: proximo, updatedAt: new Date() }, { merge: true });
        }
      });

      stats.reparados += 1;
    }

    cursor = snap.docs[snap.docs.length - 1];
    if (snap.size < PAGE_SIZE) break;
  }

  // Passada final: limpa a PRÓPRIA saída. Entradas que este script já escreveu
  // podem ter ficado com ruído de uma versão anterior dele, e algumas não são mais
  // alcançáveis pelo pareamento (o `mail-<messageId>` não existe). Aqui não há
  // reparse: só se aplica a sanitização sobre o texto gravado, o que apenas
  // REMOVE linha de endereço — nunca inventa conteúdo.
  let saneadas = 0;
  {
    let c = null;
    while (true) {
      let q = db.collectionGroup(TICKET_HISTORY_SUBCOLLECTION).orderBy('__name__').limit(400);
      if (c) q = q.startAfter(c);
      const s = await q.get();
      if (s.empty) break;
      for (const d of s.docs) {
        const x = d.data() || {};
        if (x.repairedBy !== 'infra:inbound:repair') continue;
        const ticketId = d.ref.parent.parent.id;
        if (ONLY_OS && ticketId !== ONLY_OS) continue;
        const atual = String(x.text || '');
        const limpo = tidyInboundText(sanitizeInboundLines(atual));
        if (!limpo || limpo === atual) continue;
        saneadas += 1;
        if (!APPLY) continue;
        await d.ref.set({ text: limpo, repairedAt: new Date() }, { merge: true });
      }
      c = s.docs[s.docs.length - 1];
      if (s.size < 400) break;
    }
  }

  console.log(`inbounds varridos ............ ${stats.inbounds}`);
  if (saneadas > 0) {
    console.log(`  saída própria re-higienizada  ${saneadas}`);
  }
  console.log(`  entrada de histórico ausente  ${stats.semEntrada}`);
  console.log(`  já estavam corretas ......... ${stats.jaOk}`);
  console.log(`  candidatos a reparo ......... ${stats.candidatos}`);
  console.log(`  BLOQUEADOS pela continência . ${stats.bloqueados}`);
  console.log(`  ${APPLY ? 'reparados' : 'seriam reparados'} ............${APPLY ? '.' : ''} ${APPLY ? stats.reparados : stats.candidatos - stats.bloqueados}`);

  if (porOs.size > 0) {
    console.log(`\nPor OS (${porOs.size} OS):`);
    console.log(ENCOLHER ? '  OS          entradas  removido' : '  OS          entradas    ganho');
    // Ao encolher o "ganho" é negativo: ordena pelo que mais tira e mostra positivo.
    const ordem = ENCOLHER ? (a, b) => a[1].ganho - b[1].ganho : (a, b) => b[1].ganho - a[1].ganho;
    for (const [ticketId, dados] of [...porOs.entries()].sort(ordem)) {
      const quanto = ENCOLHER ? -dados.ganho : dados.ganho;
      console.log(`  ${ticketId.padEnd(11)} ${String(dados.entradas).padStart(8)} ${String(quanto).padStart(8)}`);
    }
    const total = [...porOs.values()].reduce((soma, dados) => soma + dados.ganho, 0);
    console.log(`\n  total: ${Math.abs(total).toLocaleString('pt-BR')} caracteres ${ENCOLHER ? 'removidos' : 'recuperados'}`);
  }

  if (bloqueados.length > 0) {
    console.log(ENCOLHER
      ? `\n⚠️  Bloqueados — o texto novo NÃO está contido no atual (apareceria palavra que\n   não estava lá) ou ficaria vazio. Nada foi tocado;`
      : `\n⚠️  Bloqueados — o texto atual NÃO está contido no novo. Nada foi tocado;`);
    console.log(`   olhe caso a caso antes de decidir:`);
    for (const item of bloqueados) {
      const nota = item.aindaCitado ? '  ← o texto novo AINDA traz citação' : '';
      console.log(`  ${item.ticketId.padEnd(11)} atual=${item.atual} novo=${item.novo}${nota}`);
    }
  }

  if (!APPLY) console.log('\nDRY-RUN: nada foi escrito. Rode com --apply para valer.\n');
  else console.log('\nConcluído.\n');
}

main().catch(error => {
  console.error('Falhou:', error?.message || error);
  process.exitCode = 1;
});
