/**
 * LÁPIDES DE OS APAGADA.
 *
 * Quando uma OS é excluída, some tudo: a OS, a thread de e-mail, as mensagens. Mas a
 * conversa continua viva na caixa de quem participou dela — e a primeira resposta faz
 * o inbound criar uma OS NOVA, porque não há mais nada com que casar.
 *
 * Foi o que aconteceu em 12/08: a coordenadora pediu a exclusão das OS da universidade
 * (solicitantes abrindo duplicadas), 105 saíram, e horas depois uma resposta de
 * "Ciente. @Fulano, você possui alguém que realize esse serviço?" virou a OS-0331 —
 * uma OS nova, sem histórico nenhum, ressuscitando trabalho que alguém decidiu apagar.
 * Apagar 105 e ganhar 105 de volta uma a uma é o pior dos dois mundos.
 *
 * A lápide guarda o MÍNIMO para reconhecer a conversa: id da OS, id da thread do Gmail
 * e os ids das mensagens. Nada de assunto, corpo, remetente ou anexo — a exclusão foi
 * pedida para que esses dados sumissem, e uma lápide com conteúdo derrotaria o próprio
 * propósito de apagar.
 *
 * O que o sistema faz ao reconhecer: manda a mensagem para a fila de e-mail solto, com
 * o motivo escrito. NÃO descarta e NÃO recria. Quem apagou pode ter apagado errado, e
 * a decisão de abrir uma OS nova a partir dali é de uma pessoa — o sistema registra,
 * não decide.
 */

const COLECAO = 'deletedTickets';

const texto = valor => String(valor || '').trim();

/** Normaliza `<abc@dominio>` → `abc@dominio`: o mesmo id chega com e sem os sinais. */
export function normalizeMessageId(valor) {
  return texto(valor).replace(/^<|>$/g, '').toLowerCase();
}

export function collectMessageIds(fontes = []) {
  const ids = fontes
    .flatMap(fonte => (Array.isArray(fonte) ? fonte : [fonte]))
    .map(normalizeMessageId)
    .filter(Boolean);
  // Teto: uma thread longa não pode inflar o documento nem a leitura do inbound.
  return [...new Set(ids)].slice(0, 200);
}

/** Registra a lápide. Best-effort: falhar aqui não pode impedir a exclusão. */
export async function recordDeletedTicket(db, { ticketId, gmailThreadId, messageIds = [], deletedAt = new Date() }) {
  const id = texto(ticketId);
  if (!id) return false;
  const ids = collectMessageIds([messageIds]);
  const thread = texto(gmailThreadId);
  // Sem thread e sem mensagem não há como reconhecer a conversa depois — a lápide
  // seria um documento que nunca casa com nada.
  if (!thread && ids.length === 0) return false;
  await db.collection(COLECAO).doc(id).set({
    ticketId: id,
    gmailThreadId: thread || null,
    messageIds: ids,
    deletedAt,
  }, { merge: true });
  return true;
}

/**
 * Esta mensagem pertence a uma OS apagada? Devolve a lápide ou `null`.
 *
 * Consulta por thread primeiro (uma leitura, casa a conversa inteira) e só depois pelos
 * ids referenciados. `array-contains-any` aceita no máximo 10 valores, e uma resposta
 * carrega o `References` inteiro — daí o corte nos 10 mais RECENTES, que são os que têm
 * chance real de casar.
 */
export async function findDeletedTicketForInbound(db, { threadId, inReplyTo, references } = {}) {
  const thread = texto(threadId);
  if (thread) {
    const porThread = await db.collection(COLECAO).where('gmailThreadId', '==', thread).limit(1).get();
    if (!porThread.empty) return porThread.docs[0].data();
  }

  const ids = collectMessageIds([inReplyTo, references]).slice(-10);
  if (ids.length === 0) return null;

  const porMensagem = await db.collection(COLECAO).where('messageIds', 'array-contains-any', ids).limit(1).get();
  return porMensagem.empty ? null : porMensagem.docs[0].data();
}
