import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolveCredentialsPath, readServiceAccount } from './shared-auth.mjs';

// Limpa o texto de mensagens de e-mail ENCAMINHADAS no histórico das OS:
// remove marcadores de citação ">", placeholders "[image: ...]", divisórias de
// encaminhamento e linhas de cabeçalho, preservando as quebras de linha.
//
// Espelha o cleanForwardedMessageText do front (src/utils/text.ts), mas sem o
// repairMojibake (que continua sendo aplicado no render) nem o truncamento de
// "anexos enviados:" — aqui só arrumamos a estrutura do texto encaminhado.
//
// Uso:
//   node scripts/infra/fix-forwarded-texts.mjs        (DRY-RUN: só mostra)
//   APPLY=1 node scripts/infra/fix-forwarded-texts.mjs (escreve, preservando rawText)

const APPLY = process.env.APPLY === '1';

function cleanForwarded(text) {
  if (!text) return '';
  const lines = String(text)
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line =>
      line
        .replace(/^\s*>[>\s]*/, '')
        .replace(/\[image:[^\]]*\]/gi, '')
        .replace(/[ \t]{2,}/g, ' ')
        .trim()
    );
  const cleaned = lines.filter(line => {
    const n = line.toLowerCase();
    if (!line) return false;
    if (n === 'forwarded message' || n === 'mensagem encaminhada') return false;
    if (/forwarded conversation/i.test(line)) return false;
    if (/^[-_=*~]{3,}.*[-_=*~]{3,}$/.test(line)) return false;
    if (/^[-_=*~]{3,}$/.test(line)) return false;
    if (/^(from|de|to|para|subject|assunto|date|data|cc|cco|enviado|sent)\s*:/i.test(line)) return false;
    return true;
  });
  return cleaned.join('\n').replace(/(?:\n\s*){3,}/g, '\n\n').trim();
}

function looksForwarded(text) {
  const s = String(text || '');
  return (
    /forwarded conversation|forwarded message|mensagem encaminhada/i.test(s) ||
    /\[image:[^\]]*\]/i.test(s) ||
    /(^|\s)>\s*\S/.test(s) ||
    /^(from|de|to|para|subject|assunto)\s*:/im.test(s)
  );
}

function snippet(text, max = 140) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

async function main() {
  const credentialsPath = resolveCredentialsPath();
  const serviceAccount = readServiceAccount(credentialsPath);
  if (!getApps().length) {
    initializeApp({ credential: cert(serviceAccount), projectId: serviceAccount.project_id });
  }
  const db = getFirestore();

  console.log(`Projeto: ${serviceAccount.project_id}`);
  console.log(`Modo: ${APPLY ? 'APLICAR (escreve no banco)' : 'DRY-RUN (só leitura)'}\n`);

  const snap = await db.collection('tickets').get();
  console.log(`Tickets lidos: ${snap.size}\n`);

  let ticketsAfetados = 0;
  let entradasAfetadas = 0;
  const exemplos = [];

  for (const doc of snap.docs) {
    const data = doc.data() || {};
    const history = Array.isArray(data.history) ? data.history : [];
    let changed = false;
    const nextHistory = history.map(item => {
      if (!item || typeof item.text !== 'string') return item;
      if (item.type === 'system' || item.type === 'field_change') return item;
      const original = item.text;
      if (!looksForwarded(original)) return item;
      const cleaned = cleanForwarded(original);
      if (!cleaned || cleaned === original) return item;

      changed = true;
      entradasAfetadas += 1;
      if (exemplos.length < 6) {
        exemplos.push({ id: doc.id, antes: snippet(original), depois: snippet(cleaned) });
      }
      // Preserva o original só na primeira limpeza (idempotente).
      const rawText = typeof item.rawText === 'string' ? item.rawText : original;
      return { ...item, text: cleaned, rawText };
    });

    if (changed) {
      ticketsAfetados += 1;
      if (APPLY) {
        await doc.ref.update({ history: nextHistory });
      }
    }
  }

  console.log('--- Exemplos (antes -> depois) ---');
  for (const ex of exemplos) {
    console.log(`\n[OS ${ex.id}]`);
    console.log(`  ANTES : ${ex.antes}`);
    console.log(`  DEPOIS: ${ex.depois}`);
  }

  console.log('\n--- Resumo ---');
  console.log(`Tickets com encaminhadas a arrumar: ${ticketsAfetados}`);
  console.log(`Entradas (mensagens) a arrumar:     ${entradasAfetadas}`);
  if (!APPLY) {
    console.log('\nNada foi escrito (dry-run). Para aplicar: APPLY=1 node scripts/infra/fix-forwarded-texts.mjs');
  } else {
    console.log('\nAplicado. Original preservado em entry.rawText (reversível).');
  }
}

main().catch(err => {
  console.error('Erro:', err.message);
  process.exit(1);
});
