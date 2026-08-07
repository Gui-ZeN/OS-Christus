import { firstEmail } from './email.js';
import { normalizeKey } from './text.js';

/**
 * AUTORIZAÇÃO POR E-MAIL — a decisão do superior onde ela realmente acontece.
 *
 * O sistema tinha um papel "Diretor", uma tela de Aprovações e uma etapa de
 * "aprovação da diretoria". Em produção: **zero diretores cadastrados**, e o campo
 * `directorEmails` preenchido em 1 das 270 OS (com um endereço de teste).
 *
 * O que acontece de verdade é outra coisa: quem manda está em cópia de 76% das OS e
 * responde por e-mail. A autorização existe — só que dentro de uma thread, onde o
 * sistema não a enxerga.
 *
 * ⚠️ Isto DETECTA e REGISTRA. Nunca decide. Ver `detectAuthorization`.
 */

/** O que conta como autorização, quando dito por quem pode. */
const APROVACAO = [
  /\bautoriza(?:do|da|mos|r)?\b/,
  /\bautorizo\b/,
  /\baprova(?:do|da|mos)?\b/,
  /\baprovo\b/,
  /\bpode (?:seguir|prosseguir|executar|contratar|tocar|fazer)\b/,
  /\bpodem (?:seguir|prosseguir|executar|contratar)\b/,
  /\bde acordo\b/,
  /\bsegue autorizado\b/,
];

/**
 * O que DESMANCHA a autorização quando aparece antes dela.
 *
 * É a parte que impede o pior erro possível: "ainda não está autorizado" virar
 * aprovação. A janela é curta de propósito — olhar a frase inteira faria um "não"
 * de outro assunto contaminar a autorização.
 */
const NEGACAO = /\b(?:nao|ainda nao|sem|assim que|quando|caso|apos|depois que|preciso que|aguardando|aguardo|favor|solicito que|nao esta|nao foi)\b/;
const JANELA_NEGACAO = 40;

/** Pergunta não é decisão: "pode seguir?" é o oposto de "pode seguir". */
function ehPergunta(trecho) {
  return /\?\s*$/.test(trecho.trim());
}

function frases(texto) {
  return String(texto || '')
    .split(/(?<=[.!?\n])/)
    .map(f => f.trim())
    .filter(Boolean);
}

/**
 * Esta mensagem carrega uma autorização?
 *
 * @param {{ from?: string, text?: string }} message  mensagem JÁ limpa de citação —
 *   ler o histórico citado faria toda resposta da thread redetectar a mesma
 *   autorização, para sempre.
 * @param {string[]} autorizadores  e-mails cuja palavra vale. Lista vazia = recurso
 *   desligado; nada é detectado até alguém configurar quem pode autorizar.
 * @returns {{ email: string, quote: string } | null}
 */
export function detectAuthorization(message, autorizadores = []) {
  const permitidos = new Set(
    (autorizadores || []).map(e => String(e || '').trim().toLowerCase()).filter(Boolean)
  );
  if (permitidos.size === 0) return null;

  const email = firstEmail(message?.from);
  if (!email || !permitidos.has(email)) return null;

  for (const frase of frases(message?.text)) {
    const normalizada = normalizeKey(frase);
    if (ehPergunta(frase)) continue;

    for (const rx of APROVACAO) {
      const m = normalizada.match(rx);
      if (!m) continue;
      const antes = normalizada.slice(Math.max(0, m.index - JANELA_NEGACAO), m.index);
      if (NEGACAO.test(antes)) continue;
      // Devolve a frase ORIGINAL, com acento e caixa: quem for conferir precisa ler
      // exatamente o que a pessoa escreveu, não a versão normalizada.
      return { email, quote: frase.slice(0, 300) };
    }
  }

  return null;
}
