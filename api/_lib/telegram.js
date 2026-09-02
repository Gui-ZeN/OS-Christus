/**
 * TELEGRAM — a Bot API, um chat fixo.
 *
 * ⚠️ O BOT TEM QUE JÁ ESTAR NO GRUPO/CANAL. `chat_id` sozinho não basta se o bot
 * nunca foi adicionado ali — a API devolve 400 ("chat not found"), e é exatamente
 * isso que o corpo do erro abaixo expõe, em vez de engolir.
 *
 * SEM `parse_mode`, de propósito: o texto do aviso usa `.`, `-`, `!`, `(`, `)` à
 * vontade, e o MarkdownV2 do Telegram exige escapar cada um deles ou rejeita a
 * mensagem inteira. Texto puro entrega igual, sem essa segunda chance de quebrar.
 */
export async function enviarParaTelegram(botToken, chatId, texto) {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: texto }),
  });
  if (!res.ok) {
    const corpo = await res.text().catch(() => '');
    throw new Error(`Telegram recusou o aviso (HTTP ${res.status}): ${corpo.slice(0, 300)}`);
  }
}
