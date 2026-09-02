/**
 * DISCORD — um webhook, uma mensagem, sem bot.
 *
 * Um webhook de canal é só uma URL: qualquer `POST` com `{ content }` já entrega.
 * O preço da simplicidade é o alcance — quem recebe é o CANAL inteiro, não uma
 * pessoa. Não existe "desligar para mim": quem não quer ver, sai do canal.
 */
export async function enviarParaDiscord(webhookUrl, texto) {
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: texto }),
  });
  if (!res.ok) {
    const corpo = await res.text().catch(() => '');
    throw new Error(`Discord recusou o aviso (HTTP ${res.status}): ${corpo.slice(0, 300)}`);
  }
}
