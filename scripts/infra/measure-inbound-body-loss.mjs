import process from 'node:process';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { extractInboundMessageBody } from '../../api/_lib/inboundBody.js';
import { readServiceAccount, resolveCredentialsPath } from './shared-auth.mjs';

/**
 * MEDIÇÃO (somente leitura) da perda de corpo em e-mail ENCAMINHADO.
 *
 * Caso que originou (OS-0289, "Tapumes salas de aula"): o Gmail escreve
 * "Forwarded Conversation" ao encaminhar uma THREAD inteira, e o parser só
 * reconhecia "forwarded message". Além disso o bloco vinha DENTRO da citação
 * (prefixo ">"), então caía no filtro de citação. Resultado: a OS nasceu com
 * "Bom dia, Serv3 em cópia" e perdeu o pedido, as fotos e meses de decisão.
 *
 * O e-mail cru está guardado em `ticketInbound` (text/html), então dá para
 * reprocessar SEM voltar ao Gmail. Este script não escreve nada: ele reparsa
 * cada inbound com o parser corrigido e mede quanto texto voltaria.
 *
 * NÃO imprime conteúdo de e-mail — só tamanhos, contagens e ids de OS. O que
 * a gente precisa aqui é dimensionar o estrago, não ler a correspondência
 * de ninguém.
 *
 * Uso:
 *   node scripts/infra/measure-inbound-body-loss.mjs           (produção, leitura)
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node ...            (emulador)
 */

const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT_ID = process.env.GCLOUD_PROJECT || 'os-christus';
const PAGE_SIZE = 200;
const TOP_LIST = 20;

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
 * O parser ANTIGO, reproduzido só para comparação. Ficou aqui de propósito e não
 * importado: o objetivo é medir a diferença contra o que REALMENTE rodou quando a
 * OS nasceu, e o módulo de produção já está corrigido.
 */
const OLD_FORWARD_MARKER =
  /^\s*(?:-+\s*)?(?:forwarded message|mensagem encaminhada)(?:\s*-+)?\s*$/im;

function oldStripQuotedReply(value) {
  const text = String(value || '').replace(/\r\n/g, '\n').trim();
  if (!text) return '';
  const markers = [
    /^\s*On .+ wrote:?\s*$/im,
    /^\s*Em .+ escreveu:?\s*$/im,
    /^\s*-----Original Message-----\s*$/im,
    /^\s*De:\s.+$/im,
  ];
  let next = text;
  for (const marker of markers) {
    const match = marker.exec(next);
    if (match?.index != null && match.index > 0) {
      next = next.slice(0, match.index).trim();
      break;
    }
  }
  return next
    .split('\n')
    .filter(line => !line.trim().startsWith('>'))
    .join('\n')
    .trim();
}

function classify(text, html) {
  const raw = `${String(text || '')}\n${String(html || '')}`;
  const unquoted = raw
    .split('\n')
    .map(line => line.replace(/^\s*(?:>\s?)+/, ''))
    .join('\n');

  const temMarcadorNovo =
    /^\s*(?:-+\s*)?(?:forwarded (?:message|conversation)|mensagem encaminhada|conversa encaminhada)(?:\s*-+)?\s*$/im.test(
      unquoted
    );
  const temMarcadorAntigo = OLD_FORWARD_MARKER.test(raw);

  if (!temMarcadorNovo) return 'sem-encaminhamento';
  if (temMarcadorAntigo) return 'ja-funcionava';
  return 'so-o-parser-novo-pega';
}

async function main() {
  const db = connect();
  const alvo = EMULATOR ? `emulador ${EMULATOR}` : `PRODUÇÃO (${PROJECT_ID})`;
  console.log(`\nMedindo perda de corpo em e-mail encaminhado — ${alvo}\n`);

  const stats = {
    inbounds: 0,
    semTexto: 0,
    porClasse: { 'sem-encaminhamento': 0, 'ja-funcionava': 0, 'so-o-parser-novo-pega': 0 },
    recuperariam: 0,
    charsRecuperados: 0,
  };
  const piores = [];
  const ticketsAfetados = new Set();

  let cursor = null;
  while (true) {
    let query = db.collection('ticketInbound').orderBy('__name__').limit(PAGE_SIZE);
    if (cursor) query = query.startAfter(cursor);
    const snap = await query.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      const inbound = doc.data() || {};
      stats.inbounds += 1;

      const text = inbound.text || '';
      const html = inbound.html || '';
      if (!text && !html) {
        stats.semTexto += 1;
        continue;
      }

      const classe = classify(text, html);
      stats.porClasse[classe] += 1;
      if (classe !== 'so-o-parser-novo-pega') continue;

      const antes = oldStripQuotedReply(text || html);
      const depois = extractInboundMessageBody(text, html);
      const ganho = depois.length - antes.length;
      if (ganho <= 0) continue;

      stats.recuperariam += 1;
      stats.charsRecuperados += ganho;
      const ticketId = String(inbound.ticketId || '').trim().toUpperCase();
      if (ticketId) ticketsAfetados.add(ticketId);
      piores.push({
        ticketId: ticketId || '(sem ticket)',
        antes: antes.length,
        depois: depois.length,
        ganho,
        criadoEm: inbound.createdAt?.toDate?.()?.toISOString?.().slice(0, 10) || '?',
      });
    }

    cursor = snap.docs[snap.docs.length - 1];
    if (snap.size < PAGE_SIZE) break;
  }

  console.log(`inbounds varridos ............ ${stats.inbounds}`);
  console.log(`  sem text nem html .......... ${stats.semTexto}`);
  console.log(`  sem encaminhamento ......... ${stats.porClasse['sem-encaminhamento']}`);
  console.log(`  encaminhamento que já pegava  ${stats.porClasse['ja-funcionava']}`);
  console.log(`  SÓ o parser novo reconhece .. ${stats.porClasse['so-o-parser-novo-pega']}`);
  console.log(`\nrecuperariam texto ........... ${stats.recuperariam}`);
  console.log(`OS distintas afetadas ........ ${ticketsAfetados.size}`);
  console.log(`caracteres recuperados ....... ${stats.charsRecuperados}`);

  if (piores.length > 0) {
    piores.sort((a, b) => b.ganho - a.ganho);
    console.log(`\nMaiores perdas (top ${Math.min(TOP_LIST, piores.length)}):`);
    console.log('  OS          criada      antes  depois   ganho');
    for (const item of piores.slice(0, TOP_LIST)) {
      console.log(
        `  ${item.ticketId.padEnd(11)} ${item.criadoEm}  ${String(item.antes).padStart(5)}  ${String(
          item.depois
        ).padStart(6)}  ${String(item.ganho).padStart(6)}`
      );
    }
    console.log('\nIds das OS afetadas (para reprocessar):');
    console.log(`  ${[...ticketsAfetados].sort().join(' ')}`);
  }

  console.log('\nNada foi escrito. Só leitura.\n');
}

main().catch(error => {
  console.error('Falhou:', error?.message || error);
  process.exitCode = 1;
});
